# Reinfolib Proxy (Cloudflare Workers)

国交省 不動産情報ライブラリ API のブラウザCORS回避 + APIキー秘匿用プロキシ。

## 初回セットアップ

```bash
# 1. wrangler CLI インストール
npm install -g wrangler

# 2. Cloudflare ログイン
wrangler login

# 3. このディレクトリに移動
cd website/reins-analyzer/worker

# 4. reinfolib APIキーを Secret として登録
wrangler secret put REINFOLIB_API_KEY
# → プロンプトに国交省のAPIキーを貼り付け

# 5. デプロイ
wrangler deploy
```

デプロイ成功すると `https://reinfolib-proxy.<your-subdomain>.workers.dev` が発行されます。

## クライアント側設定

ツール画面の「API設定」モーダルで **プロキシURL** 欄に発行された URL を貼り付けてください。
以降、reinfolib API 呼び出しはすべてこのプロキシ経由になります：

- 取引価格情報 (XIT001)
- 地価公示 (XCT001)

## 使用上の注意

- 許可オリジンは `ALLOWED_ORIGINS` で制限（minatech1210.com と localhost）
- IP単位 60req/min のレートリミット
- 上流レスポンスは 24h キャッシュ
- Workers 無料枠: 10万req/日

## コスト

Workers 無料枠内ならゼロ円。月10万リクエスト超過で $5/月。
100物件 × 30日解析でも3000req/月なので当面無料で収まります。
