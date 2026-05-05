# MinaTech Realty Console

**不動産仲介業務統合プラットフォーム** — MinaTech株式会社

[![Live](https://img.shields.io/badge/Live-realty.minatech1210.com-3b82f6)](https://realty.minatech1210.com/)

物件評価・SUUMO入稿支援・画像処理・物件マスタ管理・銀行担保評価書作成を一画面で行う、宅建業者向け統合ツール。

## 主要機能

| カテゴリ | 機能 |
|---|---|
| 物件評価 | 10点満点スコアリング・SAB ランク判定・実需/投資モード切替 |
| データ取込 | レインズコピペ／PDF/マイソク自動解析（pdf.js + Tesseract OCR + Vision API任意） |
| 国交省API統合 | 不動産情報ライブラリ 28空間API（取引価格／地価公示／ハザード11／都市計画7／生活環境10／将来人口） |
| 銀行担保評価書 | 積算×80% / 収益還元×90% の低位採用、PDF出力 |
| SUUMO入稿支援 | 入稿規定2025.12版準拠、特徴項目180種自動判定、コンプライアンスチェッカー、入稿シート生成 |
| 物件マスタDB | IndexedDB永続化、9ステータス管理、タグ・メモ、CSV出力 |
| 画像処理 | SUUMO規格3プロファイルへリサイズ、4MB圧縮、face-api.jsで顔自動マスキング、Tesseractでナンバープレート検知 |
| デザイン | ライト既定/ダーク切替、Inter+Noto Sans JP、glassmorphism、MinaTech Dashboardと共通 design tokens |

## 技術スタック

- フロントエンド: Vanilla JavaScript（ビルドレス）、HTML/CSS3
- データ永続化: IndexedDB
- 外部ライブラリ: pdf.js / Tesseract.js / face-api.js / jsPDF / html2canvas
- 国交省API中継: Cloudflare Workers (`reinfolib-proxy`)
- ホスティング: GitHub Pages + Cloudflare DNS

## ライセンス

社内利用ツール。配布・改変は MinaTech株式会社 の事前承諾が必要。

## 連絡先

- isoya.h@minatech1210.com
