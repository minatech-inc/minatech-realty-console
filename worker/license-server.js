/**
 * Cloudflare Workers: MinaTech Realty Console ライセンスサーバー
 *
 * 役割:
 *   1. クライアントからのライセンスキー検証 (POST /verify)
 *      - v2キー (RC2-...) は HMAC-SHA256 でWorker側検証
 *      - v1キー (RA-...) は後方互換のため DJB2+FNV1a 検証
 *      - KV内の revoked / expired 状態も併せて確認
 *      - 最終アクセス日時を更新
 *   2. 管理者API（要 ADMIN_TOKEN）
 *      - POST /admin/issue: 新規キー発行 + KV登録
 *      - POST /admin/revoke: 既存キー無効化
 *      - POST /admin/restore: 取消したキーを復活
 *      - GET  /admin/list: 発行済みキー一覧
 *      - GET  /admin/stats: 統計（プラン別件数、月次発行数）
 *
 * デプロイ前提:
 *   - wrangler secret put ANTHROPIC_API_KEY ... ※chat-proxy用
 *   - wrangler secret put LICENSE_SEED       ※既存license.jsと同一シード（"MinaTech-REINS-2026-ShZ9xK4p"）
 *   - wrangler secret put ADMIN_TOKEN        ※管理者UI認証用ランダム文字列
 *   - wrangler kv namespace create LICENSE_DB
 *
 * KV スキーマ:
 *   key:   "lic:{key}"
 *   value: JSON {
 *     plan, expiry, companyCode, version,
 *     status: 'active'|'revoked'|'expired',
 *     issuedAt, issuedBy, revokedAt, revokedReason,
 *     customer: { name, email, notes },
 *     devices: [{ id, firstSeen, lastSeen }],
 *     lastAccess: ISO8601
 *   }
 *
 *   key:   "idx:byPlan:{plan}"  → セット風（カンマ区切りキー）
 */

const ALLOWED_ORIGINS = [
    'https://realty.minatech1210.com',
    'https://minatech-inc.github.io',
    'http://127.0.0.1:8765',
    'http://localhost:8765'
];

const PLAN_FEATURES = {
    TRL: { name:'トライアル',         maxUsers:1,  durationDays:14  },
    STD: { name:'スタンダード',        maxUsers:3,  durationDays:365 },
    PRO: { name:'プロフェッショナル',  maxUsers:10, durationDays:365 }
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const corsHeaders = buildCorsHeaders(origin);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        try {
            if (url.pathname === '/verify'         && request.method === 'POST') return await handleVerify(request, env, corsHeaders);
            if (url.pathname === '/admin/issue'    && request.method === 'POST') return await handleIssue(request, env, corsHeaders);
            if (url.pathname === '/admin/revoke'   && request.method === 'POST') return await handleRevoke(request, env, corsHeaders);
            if (url.pathname === '/admin/restore'  && request.method === 'POST') return await handleRestore(request, env, corsHeaders);
            if (url.pathname === '/admin/list'     && request.method === 'GET')  return await handleList(request, env, corsHeaders);
            if (url.pathname === '/admin/stats'    && request.method === 'GET')  return await handleStats(request, env, corsHeaders);
        } catch (e) {
            return jsonError(500, 'Internal error: ' + e.message, corsHeaders);
        }
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

// =====================================================================
// /verify - クライアントからの検証
// =====================================================================
async function handleVerify(request, env, corsHeaders) {
    let body;
    try { body = await request.json(); } catch (e) { return jsonError(400, 'Invalid JSON', corsHeaders); }
    const key = String(body.key || '').trim().toUpperCase();
    const device = String(body.device || '').slice(0, 64);
    const hostname = String(body.hostname || '').slice(0, 128);

    if (!key) return jsonError(400, 'key required', corsHeaders);

    // フォーマット解析
    const parts = key.split('-');
    if (parts.length !== 5) {
        return verifyResp(false, 'ライセンスキーの形式が正しくありません', null, corsHeaders);
    }
    const prefix = parts[0];
    const plan = parts[1];
    const expiryStr = parts[2];
    const companyCode = parts[3];
    const sig = parts[4].toLowerCase();
    if (!PLAN_FEATURES[plan]) {
        return verifyResp(false, '不明なプランです: ' + plan, null, corsHeaders);
    }

    // 署名検証
    const payload = prefix + '-' + plan + '-' + expiryStr + '-' + companyCode;
    let sigValid = false;
    if (prefix === 'RC2') {
        const hmac = await hmacSha256Hex(env.LICENSE_SEED || '', payload);
        sigValid = (sig === hmac.slice(0, 12));
    } else if (prefix === 'RA') {
        sigValid = (sig === computeChecksumV1(env.LICENSE_SEED || '', payload));
    } else {
        return verifyResp(false, '不明な形式のライセンスキー', null, corsHeaders);
    }
    if (!sigValid) {
        return verifyResp(false, 'ライセンスキーが無効です（認証エラー）', null, corsHeaders);
    }

    // 期限
    const expiry = parseDate(expiryStr);
    const now = new Date();
    const expired = (expiry < now);

    // KV参照
    let kvKey = 'lic:' + key;
    let rec = null;
    if (env.LICENSE_DB) {
        try {
            const raw = await env.LICENSE_DB.get(kvKey);
            if (raw) rec = JSON.parse(raw);
        } catch (e) {}
    }

    // 状態判定
    if (rec && rec.status === 'revoked') {
        return verifyResp(false, 'ライセンスは無効化されています' + (rec.revokedReason ? '（理由: ' + rec.revokedReason + '）' : ''), {
            plan, expiry: expiryStr, companyCode, status: 'revoked'
        }, corsHeaders);
    }
    if (expired) {
        return verifyResp(false, 'ライセンスの有効期限が切れています（' + formatDate(expiry) + '）', {
            plan, expiry: expiryStr, companyCode, status: 'expired', expired: true
        }, corsHeaders);
    }

    // 利用統計を更新（KV PUTは非同期で済ます）
    if (env.LICENSE_DB) {
        const updated = rec || {
            plan, expiry: expiryStr, companyCode,
            version: prefix === 'RC2' ? 'v2' : 'v1',
            status: 'active', issuedAt: null, issuedBy: 'unknown',
            customer: {}, devices: []
        };
        updated.lastAccess = new Date().toISOString();
        if (device) {
            const existing = (updated.devices || []).find(d => d.id === device);
            if (existing) {
                existing.lastSeen = updated.lastAccess;
            } else {
                updated.devices = (updated.devices || []).concat([{ id: device, firstSeen: updated.lastAccess, lastSeen: updated.lastAccess }]);
            }
        }
        // expirationTtl は期限+30日
        const expTtl = Math.max(60, Math.floor((expiry.getTime() + 30*24*60*60*1000 - Date.now())/1000));
        try { await env.LICENSE_DB.put(kvKey, JSON.stringify(updated), { expirationTtl: expTtl }); } catch(e) {}
    }

    const features = PLAN_FEATURES[plan];
    const daysLeft = Math.ceil((expiry - now) / (1000*60*60*24));
    return verifyResp(true, features.name + 'プラン（残り' + daysLeft + '日）', {
        plan, planName: features.name, maxUsers: features.maxUsers,
        expiry: expiry.toISOString(), expiryStr: formatDate(expiry),
        companyCode, daysLeft, status: 'active'
    }, corsHeaders);
}

function verifyResp(valid, message, extra, corsHeaders) {
    const body = { valid, message };
    if (extra) Object.assign(body, extra);
    return new Response(JSON.stringify(body), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// =====================================================================
// /admin/* - 管理者API（ADMIN_TOKEN必須）
// =====================================================================
function checkAdmin(request, env) {
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return false;
    return true;
}

async function handleIssue(request, env, corsHeaders) {
    if (!checkAdmin(request, env)) return jsonError(401, 'Unauthorized', corsHeaders);
    let body;
    try { body = await request.json(); } catch (e) { return jsonError(400, 'Invalid JSON', corsHeaders); }
    const plan = String(body.plan || 'STD');
    const expiryDate = String(body.expiryDate || '');
    const companyCode = String(body.companyCode || '').toUpperCase();
    const customer = body.customer || {};

    if (!PLAN_FEATURES[plan]) return jsonError(400, 'invalid plan', corsHeaders);
    if (!/^\d{8}$/.test(expiryDate)) return jsonError(400, '有効期限はYYYYMMDD形式', corsHeaders);
    if (!/^[A-Z0-9]{4}$/.test(companyCode)) return jsonError(400, '会社コードは英数4文字', corsHeaders);

    const payload = 'RC2-' + plan + '-' + expiryDate + '-' + companyCode;
    const hmac = await hmacSha256Hex(env.LICENSE_SEED || '', payload);
    const key = payload + '-' + hmac.slice(0, 12);

    const now = new Date().toISOString();
    const rec = {
        plan, expiry: expiryDate, companyCode, version: 'v2',
        status: 'active',
        issuedAt: now,
        issuedBy: 'admin',
        customer: {
            name: String(customer.name || '').slice(0, 200),
            email: String(customer.email || '').slice(0, 200),
            notes: String(customer.notes || '').slice(0, 1000)
        },
        devices: [],
        lastAccess: null
    };

    if (env.LICENSE_DB) {
        const expDate = parseDate(expiryDate);
        const expTtl = Math.max(60, Math.floor((expDate.getTime() + 30*24*60*60*1000 - Date.now())/1000));
        await env.LICENSE_DB.put('lic:' + key, JSON.stringify(rec), { expirationTtl: expTtl });
    }

    return new Response(JSON.stringify({ key, ...rec }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleRevoke(request, env, corsHeaders) {
    if (!checkAdmin(request, env)) return jsonError(401, 'Unauthorized', corsHeaders);
    let body;
    try { body = await request.json(); } catch (e) { return jsonError(400, 'Invalid JSON', corsHeaders); }
    const key = String(body.key || '').trim().toUpperCase();
    const reason = String(body.reason || '').slice(0, 500);
    if (!env.LICENSE_DB) return jsonError(503, 'KV not configured', corsHeaders);

    const raw = await env.LICENSE_DB.get('lic:' + key);
    if (!raw) return jsonError(404, 'license not found', corsHeaders);
    const rec = JSON.parse(raw);
    rec.status = 'revoked';
    rec.revokedAt = new Date().toISOString();
    rec.revokedReason = reason;
    await env.LICENSE_DB.put('lic:' + key, JSON.stringify(rec));
    return new Response(JSON.stringify({ ok: true, key, ...rec }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleRestore(request, env, corsHeaders) {
    if (!checkAdmin(request, env)) return jsonError(401, 'Unauthorized', corsHeaders);
    let body;
    try { body = await request.json(); } catch (e) { return jsonError(400, 'Invalid JSON', corsHeaders); }
    const key = String(body.key || '').trim().toUpperCase();
    if (!env.LICENSE_DB) return jsonError(503, 'KV not configured', corsHeaders);
    const raw = await env.LICENSE_DB.get('lic:' + key);
    if (!raw) return jsonError(404, 'license not found', corsHeaders);
    const rec = JSON.parse(raw);
    rec.status = 'active';
    delete rec.revokedAt;
    delete rec.revokedReason;
    await env.LICENSE_DB.put('lic:' + key, JSON.stringify(rec));
    return new Response(JSON.stringify({ ok: true, key, ...rec }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleList(request, env, corsHeaders) {
    if (!checkAdmin(request, env)) return jsonError(401, 'Unauthorized', corsHeaders);
    if (!env.LICENSE_DB) return jsonError(503, 'KV not configured', corsHeaders);
    const items = [];
    const list = await env.LICENSE_DB.list({ prefix: 'lic:', limit: 1000 });
    for (const k of list.keys) {
        try {
            const raw = await env.LICENSE_DB.get(k.name);
            if (raw) {
                const rec = JSON.parse(raw);
                items.push({ key: k.name.replace(/^lic:/, ''), ...rec });
            }
        } catch (e) {}
    }
    items.sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
    return new Response(JSON.stringify({ count: items.length, items }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function handleStats(request, env, corsHeaders) {
    if (!checkAdmin(request, env)) return jsonError(401, 'Unauthorized', corsHeaders);
    if (!env.LICENSE_DB) return jsonError(503, 'KV not configured', corsHeaders);
    const stats = {
        total: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        byPlan: { TRL: 0, STD: 0, PRO: 0 },
        thisMonth: 0
    };
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const list = await env.LICENSE_DB.list({ prefix: 'lic:', limit: 1000 });
    for (const k of list.keys) {
        const raw = await env.LICENSE_DB.get(k.name);
        if (!raw) continue;
        const rec = JSON.parse(raw);
        stats.total++;
        if (rec.status === 'revoked') stats.revoked++;
        else if (rec.expiry && parseDate(rec.expiry) < now) stats.expired++;
        else stats.active++;
        if (stats.byPlan[rec.plan] !== undefined) stats.byPlan[rec.plan]++;
        if (rec.issuedAt && rec.issuedAt.startsWith(ym)) stats.thisMonth++;
    }
    return new Response(JSON.stringify(stats), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// =====================================================================
// 暗号化ヘルパー
// =====================================================================
async function hmacSha256Hex(seed, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(seed),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
}

function computeChecksumV1(seed, payload) {
    const combined = seed + ':' + payload + ':' + seed;
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash + combined.charCodeAt(i)) & 0xFFFFFFFF;
    }
    let hash2 = 0x811C9DC5;
    for (let i = 0; i < combined.length; i++) {
        hash2 ^= combined.charCodeAt(i);
        hash2 = (hash2 * 0x01000193) & 0xFFFFFFFF;
    }
    const hex1 = ((hash >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
    const hex2 = ((hash2 >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
    return hex1 + hex2;
}

function parseDate(str) {
    if (!/^\d{8}$/.test(str)) return new Date(0);
    const y = parseInt(str.substring(0, 4));
    const m = parseInt(str.substring(4, 6)) - 1;
    const d = parseInt(str.substring(6, 8));
    const date = new Date(y, m, d);
    date.setHours(23, 59, 59, 999);
    return date;
}
function formatDate(date) {
    return date.getFullYear() + '/' +
        String(date.getMonth() + 1).padStart(2, '0') + '/' +
        String(date.getDate()).padStart(2, '0');
}

function buildCorsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function jsonError(status, message, corsHeaders) {
    return new Response(JSON.stringify({ error: message }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
