# license-server Cloudflare Workers デプロイ手順

ライセンスキーのサーバー検証 + 発行/失効管理用Workers。**所要時間：約10〜15分**。

---

## 1. KV ネームスペース作成

```powershell
cd C:\Users\MinaTech株式会社\MinaTech-RealtyConsole\worker
wrangler kv namespace create LICENSE_DB --config license-server.toml
```

出力された `id = "..."` の文字列をコピー → `license-server.toml` の `REPLACE_WITH_KV_NAMESPACE_ID` を書き換え。

---

## 2. シード Secret を登録（既存 license.js と同一シード）

```powershell
wrangler secret put LICENSE_SEED --config license-server.toml
```

プロンプトに **`MinaTech-REINS-2026-ShZ9xK4p`** を入力（コピペ）。

> ※既存 license.js でクライアント側検証に使っているシードと**完全一致**させないと、v1/v2 キーがサーバー検証で弾かれます。

---

## 3. ADMIN_TOKEN を生成・登録

```powershell
# ランダム文字列生成（Git Bashで openssl が使える場合）
openssl rand -hex 32
# または PowerShell の場合
[System.Web.Security.Membership]::GeneratePassword(64, 0)
```

生成された文字列を**メモに保存**（管理者UIで使用）し：

```powershell
wrangler secret put ADMIN_TOKEN --config license-server.toml
```

プロンプトで先ほど生成した文字列を貼り付け。

---

## 4. デプロイ

```powershell
wrangler deploy --config license-server.toml
```

出力に Worker URL が表示される（例：`https://license.minatech1210.com`）。

---

## 5. クライアント側設定

### a) license.js にエンドポイントを設定

ブラウザのアドレスバーで `https://realty.minatech1210.com/?owner=minatech` を開き、**F12** で開発者ツールを開き、Console タブに：

```js
localStorage.setItem('rc_license_endpoint', 'https://license.minatech1210.com/verify');
```

を入力して Enter。以降、license.js は v2キー検証時にこのエンドポイントを経由します。

### b) 管理者UIにアクセス

`https://realty.minatech1210.com/admin-licenses.html?owner=minatech` を開く（オーナーモード必須）。

- 初回アクセス時、ADMIN_TOKEN の入力を求められる
- 入力後は localStorage に保存され、ブラウザ閉じても残る
- 別端末で管理する場合は再入力

---

## 6. 動作確認

### a) 検証エンドポイント
```powershell
curl -X POST https://license.minatech1210.com/verify `
  -H "Content-Type: application/json" `
  -H "Origin: https://realty.minatech1210.com" `
  -d '{"key":"RA-PRO-20271231-MNTH-ca0d2b0c"}'
```
→ 既存 v1 PRO キーが「valid: true」で返れば成功

### b) 管理者 一覧
```powershell
curl https://license.minatech1210.com/admin/list `
  -H "X-Admin-Token: あなたのADMIN_TOKEN"
```
→ 発行済みキー一覧（最初は空）

### c) 管理者 新規発行
```powershell
curl -X POST https://license.minatech1210.com/admin/issue `
  -H "Content-Type: application/json" `
  -H "X-Admin-Token: あなたのADMIN_TOKEN" `
  -d '{"plan":"STD","expiryDate":"20271231","companyCode":"M001","customer":{"name":"テスト株式会社","email":"test@example.com"}}'
```
→ 新規 RC2 キーが発行される

---

## 7. コスト

- Workers: 無料枠 10万リクエスト/日 → ライセンス検証なら年数千件で余裕
- KV: 無料枠 10万 reads / 1,000 writes per day
  → 100社契約 × 1日10回ログイン = 月3万 reads、書き込みは月1,000writes 以内

実コストはほぼゼロ運用可能。

---

## 8. セキュリティ注意

- **ADMIN_TOKEN は絶対に外部に漏らさない**（チャットへの貼付NG）
- 万が一漏れた場合：`wrangler secret put ADMIN_TOKEN` で即時ローテート → 再ログイン
- license.js の `_seed()` は難読化済みだが、本質的にはクライアント側秘密。Workers側 LICENSE_SEED と同じ値が必要
- Origin ヘッダーで弾く CORS チェックは UA偽装で回避可能だが、ADMIN_TOKEN を持たない限り発行操作はできない

---

## 9. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 401 Unauthorized (admin) | ADMIN_TOKEN 不一致 | Secret再登録 + localStorage の token更新 |
| 検証時に既存v1キーが弾かれる | LICENSE_SEED が違う | Secret を再登録（"MinaTech-REINS-2026-ShZ9xK4p"） |
| 検証で valid:false (revoked) | KVで revoke 状態 | /admin/restore で復活可能 |
| KV未設定でクォータ管理されない | KV ID 未設定 | toml 確認 + 再デプロイ |
| プリフライト失敗 | Origin が ALLOWED_ORIGINS に未登録 | license-server.js を更新して再デプロイ |
