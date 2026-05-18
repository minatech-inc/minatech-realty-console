# chat-proxy Cloudflare Workers デプロイ手順

AIチャットボットのバックエンド（Anthropic API 中継）を Cloudflare Workers に配置する手順。
**所要時間：約10分**。Cloudflare アカウントと Anthropic API キーが事前に必要。

---

## 0. 事前準備

### Cloudflare アカウント
- 既存の minatech1210.com を管理しているアカウントを使う
- Workers 無料プラン（10万リクエスト/日）で当面は十分

### Anthropic API キー
- https://console.anthropic.com/ にログイン
- API Keys → Create Key で発行（`sk-ant-api03-...` で始まる文字列）
- Haiku 4.5 を使うので **クレジット課金有効** にしておく（最低 $5 課金推奨、自動チャージ設定可）

### wrangler CLI
```bash
npm install -g wrangler
wrangler login   # ブラウザでCloudflare認証
```

---

## 1. KV ネームスペース作成（クォータ管理用）

問数カウントを保存するKVを作成：

```bash
cd C:\Users\MinaTech株式会社\MinaTech-RealtyConsole\worker
wrangler kv namespace create CHAT_QUOTA --config chat-proxy.toml
```

出力例：
```
✨ Successfully created KV namespace "CHAT_QUOTA"
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "CHAT_QUOTA"
id = "abc123def456..."
```

→ `chat-proxy.toml` 内の `id = "REPLACE_WITH_KV_NAMESPACE_ID"` を、上記で発行された ID に書き換える。

---

## 2. Anthropic API キーを Secret として登録

```bash
wrangler secret put ANTHROPIC_API_KEY --config chat-proxy.toml
```

プロンプトで `sk-ant-api03-...` を貼り付けてEnter。

---

## 3. デプロイ

```bash
wrangler deploy --config chat-proxy.toml
```

出力に Workers の URL が表示される：
```
Published chat-proxy (1.23 sec)
  https://chat-proxy.minatech-inc.workers.dev
```

このURLが `landing.html` および `index.html` の `data-endpoint` で参照されている。
URLが異なる場合は、両ファイルの `data-endpoint` 値を書き換えて再プッシュ。

---

## 4. 動作確認

### 4.1 curl テスト

```bash
curl -X POST https://chat-proxy.minatech-inc.workers.dev/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://realty.minatech1210.com" \
  -d '{"tier":"public","message":"料金プランを教えて"}'
```

返答 JSON：
```json
{
  "reply": "MinaTech Realty Console には3つのプランがあります...",
  "usage": { "input_tokens": ..., "output_tokens": ..., "cache_creation_input_tokens": ..., "cache_read_input_tokens": ... },
  "tier": "public",
  "quotaUsed": 1,
  "quotaLimit": 50
}
```

### 4.2 ブラウザテスト

1. https://realty.minatech1210.com/landing.html を開く
2. 右下のチャットボタン（青紫グラデの丸ボタン）をクリック
3. 「料金プランを教えて」とサジェストをクリック
4. 数秒で回答が返る → 正常

### 4.3 クォータ確認

```bash
curl "https://chat-proxy.minatech-inc.workers.dev/quota?tier=public"
```

---

## 5. コスト監視

### Anthropic Console
- https://console.anthropic.com/usage で日次の使用料を確認
- Haiku 4.5 + プロンプトキャッシュON で **1問あたり約0.2-0.9円**
- 100契約者 × 月30問 = 月900〜2,700円程度の見込み

### Cloudflare Workers
- 無料枠 10万リクエスト/日 → チャット利用量的に当面無料圏内
- KV: 無料枠 10万 reads/day、1,000 writes/day → 1日1,000問でも writes は 余裕

---

## 6. クォータ上限の調整

`chat-proxy.js` の `QUOTA_BY_TIER` を編集して再デプロイ：

```js
const QUOTA_BY_TIER = {
    public:       50,    // LP閲覧者 IPごと月50問
    standard:     100,   // Standard ライセンスごと月100問
    professional: 500    // Pro ライセンスごと月500問
};
```

変更後：`wrangler deploy --config chat-proxy.toml`

---

## 7. ナレッジ更新

`chat-proxy.js` 内の `KNOWLEDGE_TEXT` 定数を編集すれば、AIの応答内容が変わる。
料金改定や機能追加時にはここを更新して再デプロイ。

将来的には Cloudflare Workers AI の Vector DB に切り出して、より大規模なナレッジに対応可能。

---

## 8. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 403 Origin not allowed | リクエスト元が ALLOWED_ORIGINS に未登録 | `chat-proxy.js` を更新して再デプロイ |
| 429 上限到達 | 月間問数を超えた | 来月までブロック、または上限を上げる |
| 502 Upstream API error | Anthropic API キー無効 or クレジット切れ | Anthropic Console で確認 |
| KV未設定でクォータ管理されない | KVバインディング忘れ | `wrangler.toml` を確認、KV IDを設定して再デプロイ |
| 応答が遅い（5秒以上） | プロンプトキャッシュが効いていない（初回） | 2回目以降は速くなる、それでも遅ければ Haiku → Haiku 4.5 確認 |

---

## 9. ロールバック手順

問題発生時は Workers を停止してウィジェットをHTML側でコメントアウト：

```bash
wrangler delete chat-proxy
```

または、`landing.html` / `index.html` の `<script src="chat-widget.js" ...>` をコメントアウトして再プッシュ。
