# 重説テンプレート格納フォルダ

このフォルダは `.gitignore` で git 管理対象外。
業界書式PDF（協会テンプレ、神奈川県宅建協会標準書式等）と、宅建業者情報を含む書式を保管する。

## 推奨ファイル命名

| 用途 | ファイル名（例） |
|---|---|
| 売買（個人売主） | `disclosure_baibai.pdf` |
| 売買（宅建業者売主） | `disclosure_takken_seller.pdf` |
| 賃貸 | `disclosure_chintai.pdf` |
| 土地売買 | `disclosure_tochi.pdf` |
| 中古マンション売買 | `disclosure_chuko_mansion.pdf` |
| 新築戸建売買 | `disclosure_shinchiku_kodate.pdf` |

複数バージョン管理する場合は日付サフィックス：
`disclosure_baibai_2026-05.pdf`

## 利用フロー

1. ここにPDFを保管
2. Claude（私）が disclosure.js の書式を協会版に寄せる作業時に、必要に応じて手動でPDFを開いて項目を確認
3. 一度書式を寄せ込んでしまえば、以降はPDFを参照する必要なし

## バックアップ推奨

このフォルダは git 同期されないため、別端末で同期したい場合は：
- Google Drive / Dropbox / OneDrive 等の手動同期
- 社内 NAS 共有

## 公開しないこと

- 協会テンプレには著作権がある
- 宅建業者の業者票事項を含む書式はプライバシー上も非公開
- このフォルダ全体を git に push しない設定済（`.gitignore` で `templates/` を除外）
