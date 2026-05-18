/**
 * Cloudflare Workers: MinaTech AIチャットボット プロキシ
 *
 * 役割:
 *   1. ブラウザ → Anthropic API の中継（API キーをサーバー側 Secret として保持）
 *   2. CORS / Origin ホワイトリスト
 *   3. プラン別レート制限（Cloudflare KV または in-memory で問数管理）
 *      - public  (LP)        : IPごと 50問/月（CAC投資扱い、上限到達でブロック）
 *      - standard            : ライセンスキーごと 100問/月
 *      - professional        : ライセンスキーごと 500問/月
 *   4. プロンプトキャッシュを使った安価運用（Haiku 4.5 + cache control）
 *   5. システムプロンプトに chat-knowledge.md を埋め込み
 *
 * デプロイ手順:
 *   $ wrangler secret put ANTHROPIC_API_KEY        # プロンプトで sk-ant-... を入力
 *   $ wrangler kv:namespace create CHAT_QUOTA      # KV作成、IDをwrangler.toml に追記
 *   $ wrangler deploy worker/chat-proxy.js --name chat-proxy
 *
 * 利用（クライアント側）:
 *   POST https://chat-proxy.<subdomain>.workers.dev/chat
 *   Body: { "tier": "public" | "standard" | "professional", "license": "<key>", "message": "...", "history": [...] }
 */

const ALLOWED_ORIGINS = [
    'https://realty.minatech1210.com',
    'https://realestate.minatech1210.com',
    'https://dashboard.minatech1210.com',
    'https://minatech-inc.github.io',
    'http://127.0.0.1:8765',
    'http://localhost:8765'
];

const QUOTA_BY_TIER = {
    public:       50,    // LP 訪問者（IPごと）
    standard:     100,   // Standard ライセンス（ライセンスキーごと）
    professional: 500    // Professional ライセンス（ライセンスキーごと）
};

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;

// System Prompt（chat-knowledge.md の内容を直書き：プロンプトキャッシュ対象）
// このBlockに cache_control: ephemeral を付けると、5分以内の連続リクエストで input トークン料金が 1/10 になる
const KNOWLEDGE_TEXT = `あなたは MinaTech 株式会社（神奈川県藤沢市の宅地建物取引業者、神奈川県知事(1)第32624号）が提供する「MinaTech Realty Console」というSaaS製品のサポートAIです。宅建業者向けの不動産仲介業務統合プラットフォームについて、丁寧かつ正確に答えてください。

【製品概要】
公開URL: https://realty.minatech1210.com/
採点基準: https://realty.minatech1210.com/scoring.html
利用規約: https://realty.minatech1210.com/terms.html

【主要機能 7つ】
1. 物件評価スコアリング: レインズコピペで10点満点自動評価。S(7+, 即日)/A(5-6, 今週)/B(3-4, 今月)/C(2-, 見送り)
2. SUUMO入稿支援: 入稿規定2025.12版準拠、特徴項目180種自動判定
3. 画像処理: SUUMO規格3プロファイル、顔/ナンバープレート自動マスキング、4MB圧縮
4. 物件マスタDB: 9ステータス管理、IndexedDB永続化、JSONバックアップ
5. ポータル横断チェッカー: 物件名で SUUMO/atホーム/HOMES 即特定
6. 銀行担保評価書: 積算80% / 収益還元90% の低位採用でPDF自動生成
7. 国交省API統合: 不動産情報ライブラリ28空間API

【スコアリング配点（10点満点）】
- エリア市場性 0-3点（東京23区/政令市=3、TIER1=2、TIER2=1、TIER3=0、過疎地=減点）
- 表面利回り 0-2点（15%以上=2、10%以上=1）
- 駅距離 0-1点（10分以内=1）
- 価格帯 0-1点（500万円以下=1）
- 賃貸中 0-1点 / 構造・築年 0-1点
- 再建築不可 -3点 / 実質利回り5%未満 -2点

【料金プラン】
- Trial: 0円（14日間）、1名、CSV出力のみ、サポートなし、自動失効
- Standard: 年49,800円（月払い5,980円）、3名まで、全評価機能、メールサポート月1時間、カスタマイズ不可
- Professional: 年148,000円（月払い14,800円）、10名まで、Standard全機能+カスタマイズ年2件+メール月3時間優先対応+初回データ移行支援1回

年払いは月払いより約2ヶ月分お得。

【解約・支払規定】
- 年契約: 途中解約・返金不可
- 月払い: 当月末まで利用可、翌月から自動停止
- 滞納2週間: 自動利用停止（データ保管）
- 滞納2ヶ月: アカウント・データ削除
- 再開手数料: 3,000円

【サポート範囲】
- メールのみ。電話・チャット即時対応はなし
- 1往復=15分換算
- Trial対象外、Standard月1時間、Professional月3時間+優先
- 緊急バグ修正は全プランで最優先対応
- 機能要望: Standard以下はRoadmap登録のみ、Pro は年2件まで優先実装枠

【データの取扱い】
- 物件情報・画像はすべてブラウザ内（IndexedDB）で処理。クラウド送信なし
- JSONバックアップ/復元機能で端末移行可能
- 採点ロジックも完全公開、ブラックボックスAIではない

【コンプライアンス】
- レインズ・SUUMO・HOMES のスクレイピングは行わない
- 投資助言業者ではない（金融商品取引法）
- 投資判断の最終決定は利用者責任

【ロードマップ（未対応領域）】
- 顧客への自動連絡（メール/SMS/LINE）
- 電子契約・IT重説（重説テンプレ含む）
- 内見スケジュール管理
- 税制・法律のリファレンス（こちらは外部依存方針）

【応答ガイドライン】
- 料金は確定価格で即答する（「ASK」「お問い合わせください」は使わない）
- 解約・規約に関する質問は terms.html の該当条項を引用
- 採点基準に関する質問は scoring.html を案内
- 投資判断・税務相談・契約交渉などの個別アドバイスは「投資助言業者ではない」「税理士/司法書士に相談を」と免責を明示
- スクレイピングや自動取得要望は「規約遵守の方針上、対応していません」と回答
- 未対応機能は「Roadmap項目」または「Pro優先実装枠で個別対応可能」と案内
- 自信のない質問は憶測せず「isoya.h@minatech1210.com まで直接お問合せください」と誘導
- 回答は簡潔に、5〜7行以内を目安に
- 絵文字は使用しない。「！」など強い記号は控えめに

【連絡先】
- メール: isoya.h@minatech1210.com
- 電話: 0467-28-7603
- 所在地: 〒251-0055 神奈川県藤沢市南藤沢3-12 クリオ藤沢駅前 7階
- 代表: 磯谷 肇`;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const corsHeaders = buildCorsHeaders(origin);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (url.pathname === '/quota' && request.method === 'GET') {
            return handleQuotaCheck(request, env, corsHeaders);
        }

        if (url.pathname !== '/chat' || request.method !== 'POST') {
            return new Response('Not Found', { status: 404, headers: corsHeaders });
        }

        if (!ALLOWED_ORIGINS.includes(origin) && origin !== '') {
            return jsonError(403, 'Origin not allowed', corsHeaders);
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonError(400, 'Invalid JSON', corsHeaders);
        }

        const tier = String(body.tier || 'public').toLowerCase();
        const license = String(body.license || '');
        const message = String(body.message || '').trim();
        const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

        if (!message) return jsonError(400, 'message is required', corsHeaders);
        if (message.length > 2000) return jsonError(400, 'message too long', corsHeaders);
        if (!QUOTA_BY_TIER[tier]) return jsonError(400, 'invalid tier', corsHeaders);

        // クォータキー
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        let quotaKey;
        if (tier === 'public') {
            quotaKey = 'q:public:' + clientIp;
        } else {
            if (!license || license.length < 16) return jsonError(400, 'license key required', corsHeaders);
            quotaKey = 'q:' + tier + ':' + license;
        }

        // 月次ロールキー（YYYY-MM 単位でリセット）
        const monthKey = quotaKey + ':' + new Date().toISOString().slice(0, 7);

        // 残量チェック
        const currentCount = await getCount(env, monthKey);
        const limit = QUOTA_BY_TIER[tier];
        if (currentCount >= limit) {
            return jsonError(429, '今月のチャット利用上限（' + limit + '問）に到達しました。来月リセット、または直接 isoya.h@minatech1210.com までお問合せください。', corsHeaders);
        }

        // Anthropic API 呼び出し
        const messages = [];
        for (const h of history) {
            if (h.role === 'user' || h.role === 'assistant') {
                messages.push({ role: h.role, content: String(h.content || '').slice(0, 4000) });
            }
        }
        messages.push({ role: 'user', content: message });

        const payload = {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: [{
                type: 'text',
                text: KNOWLEDGE_TEXT,
                cache_control: { type: 'ephemeral' }  // 5分TTLプロンプトキャッシュ
            }],
            messages: messages
        };

        let apiResponse;
        try {
            apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            return jsonError(502, 'Upstream API error: ' + e.message, corsHeaders);
        }

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return jsonError(apiResponse.status, 'Anthropic API error: ' + errText.slice(0, 300), corsHeaders);
        }

        const apiData = await apiResponse.json();
        const replyText = (apiData.content || [])
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('');

        // クォータインクリメント（成功時のみ）
        await incrementCount(env, monthKey);

        return new Response(JSON.stringify({
            reply: replyText,
            usage: apiData.usage,
            tier: tier,
            quotaUsed: currentCount + 1,
            quotaLimit: limit
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

async function handleQuotaCheck(request, env, corsHeaders) {
    const url = new URL(request.url);
    const tier = url.searchParams.get('tier') || 'public';
    const license = url.searchParams.get('license') || '';
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const quotaKey = tier === 'public' ? 'q:public:' + clientIp : 'q:' + tier + ':' + license;
    const monthKey = quotaKey + ':' + new Date().toISOString().slice(0, 7);
    const currentCount = await getCount(env, monthKey);
    const limit = QUOTA_BY_TIER[tier] || 0;
    return new Response(JSON.stringify({
        tier: tier,
        used: currentCount,
        limit: limit,
        remaining: Math.max(0, limit - currentCount)
    }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

async function getCount(env, key) {
    if (!env.CHAT_QUOTA) return 0; // KV未設定なら制限スルー（開発時用、本番では必ずKV設定）
    const v = await env.CHAT_QUOTA.get(key);
    return v ? parseInt(v, 10) || 0 : 0;
}

async function incrementCount(env, key) {
    if (!env.CHAT_QUOTA) return;
    const v = await env.CHAT_QUOTA.get(key);
    const n = v ? parseInt(v, 10) || 0 : 0;
    // expirationTtl: 32日（来月でローテーション）
    await env.CHAT_QUOTA.put(key, String(n + 1), { expirationTtl: 32 * 24 * 60 * 60 });
}

function buildCorsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function jsonError(status, message, corsHeaders) {
    return new Response(JSON.stringify({ error: message }), {
        status: status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
