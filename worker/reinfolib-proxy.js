/**
 * Cloudflare Workers: 国交省 不動産情報ライブラリ API プロキシ
 *
 * 役割:
 *   1. ブラウザからの fetch を受け、サーバー側から reinfolib API を呼び出す（CORS回避）
 *   2. APIキーをサーバー側 Secret として保持（ブラウザに露出させない）
 *   3. 許可オリジンのみ受け付け（CORS/Origin ホワイトリスト）
 *   4. 簡易レートリミット（IPごと 60req/min）
 *
 * デプロイ手順:
 *   $ npm install -g wrangler
 *   $ wrangler login
 *   $ wrangler secret put REINFOLIB_API_KEY   # プロンプトでAPIキー入力
 *   $ wrangler deploy worker/reinfolib-proxy.js --name reinfolib-proxy
 *
 * 利用:
 *   https://reinfolib-proxy.<your-subdomain>.workers.dev/XIT001?year=2024&area=14&city=14205
 *   https://reinfolib-proxy.<your-subdomain>.workers.dev/XCT001?year=2024&administrative_area_code=14205&z=13
 *
 * クライアント側は localStorage['reinfolib_proxy_url'] にこの URL を設定する。
 */

const ALLOWED_ORIGINS = [
    'https://minatech1210.com',
    'https://www.minatech1210.com',
    'https://realestate.minatech1210.com',
    'https://web.minatech1210.com',
    'https://sora.minatech1210.com',
    'https://minatech-inc.github.io',
    'http://127.0.0.1:8765',
    'http://localhost:8765'
];

// 採用している reinfolib エンドポイント一覧
//  XIT001: 取引価格情報, XPT002: 地価公示・地価調査ポイント
//  XKT001-030系: 都市計画/ハザード/生活環境等の国土数値情報
//  XGT001: 指定緊急避難場所, XST001: 災害履歴
//  XCT001/XCT002/XPT001 は後方互換のため残置
const ALLOWED_ENDPOINTS = [
    'XIT001', 'XPT002',
    'XCT001', 'XCT002', 'XPT001',
    'XKT001', 'XKT002', 'XKT003', 'XKT004', 'XKT005', 'XKT006', 'XKT007',
    'XKT010', 'XKT011', 'XKT013', 'XKT014', 'XKT015', 'XKT016', 'XKT017',
    'XKT018', 'XKT020', 'XKT021', 'XKT022', 'XKT023', 'XKT024', 'XKT025',
    'XKT026', 'XKT027', 'XKT028', 'XKT029', 'XKT030', 'XKT031',
    'XGT001', 'XST001'
];

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const corsHeaders = buildCorsHeaders(origin);

        // プリフライト
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // GETのみ許可
        if (request.method !== 'GET') {
            return jsonError(405, 'Method not allowed', corsHeaders);
        }

        // エンドポイント抽出（パスの最初のセグメント）
        const endpoint = url.pathname.replace(/^\//, '').split('/')[0];
        if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
            return jsonError(400, 'Unsupported endpoint: ' + endpoint, corsHeaders);
        }

        // レートリミット（IPベース、KVなしのシンプル実装: Cache API利用）
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateOk = await checkRateLimit(ip, env);
        if (!rateOk) {
            return jsonError(429, 'Rate limit exceeded (60 req/min)', corsHeaders);
        }

        // 上流URL構築
        const upstreamUrl = 'https://www.reinfolib.mlit.go.jp/ex-api/external/' +
                            endpoint + url.search;

        try {
            const upstream = await fetch(upstreamUrl, {
                headers: {
                    'Ocp-Apim-Subscription-Key': env.REINFOLIB_API_KEY,
                    'Accept': 'application/json'
                },
                cf: {
                    cacheTtl: 86400, // 24時間キャッシュ
                    cacheEverything: true
                }
            });

            const body = await upstream.text();
            return new Response(body, {
                status: upstream.status,
                headers: {
                    ...corsHeaders,
                    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
                    'Cache-Control': 'public, max-age=86400'
                }
            });
        } catch (e) {
            return jsonError(502, 'Upstream error: ' + e.message, corsHeaders);
        }
    }
};

function buildCorsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function jsonError(status, message, headers) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}

// Cache API ベースの簡易レートリミット
async function checkRateLimit(ip, env) {
    try {
        const cache = caches.default;
        const key = new Request('https://ratelimit.local/' + ip);
        const cached = await cache.match(key);
        let count = 0;
        if (cached) count = parseInt(await cached.text()) || 0;
        if (count >= 60) return false;
        const res = new Response(String(count + 1), {
            headers: { 'Cache-Control': 'max-age=60' }
        });
        await cache.put(key, res);
        return true;
    } catch (e) {
        return true; // レートリミット失敗時は通す
    }
}
