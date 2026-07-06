/**
 * テスト成果物（重説・契約書・帳票等）の保存ヘルパー
 * 保存先: tests/reports/artifacts/YYYY-MM-DD/
 * 実行後、make-report.js がデスクトップの MinaTech-Reports へ複製する。
 */
const fs = require('fs');
const path = require('path');

const DATE = new Date().toISOString().slice(0, 10);
const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'reports', 'artifacts', DATE);

function ensureDir() {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    return ARTIFACTS_DIR;
}

/** 生成HTML（重説・契約書など）を単体で開けるHTMLファイルとして保存 */
function saveHTML(name, bodyHTML, title) {
    ensureDir();
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${title || name}</title>
<style>
    body{font-family:'Noto Sans JP','Hiragino Kaku Gothic ProN',Meiryo,sans-serif;
        margin:40px auto;max-width:900px;padding:0 20px;line-height:1.8;color:#1a2233;}
    table{border-collapse:collapse;width:100%;}
    th,td{border:1px solid #94a3b8;padding:6px 10px;font-size:13px;text-align:left;}
    th{background:#f1f5f9;}
    .artifact-note{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;
        padding:10px 16px;font-size:12px;color:#92400e;margin-bottom:24px;}
</style>
</head>
<body>
<div class="artifact-note">自動テストで生成された下書きサンプルです（サンプル物件データ使用）。実務利用不可。生成日: ${DATE}</div>
${bodyHTML}
</body>
</html>`;
    const file = path.join(ARTIFACTS_DIR, name);
    fs.writeFileSync(file, html, 'utf8');
    return file;
}

/** Playwright の download オブジェクトを保存 */
async function saveDownload(download, prefix) {
    ensureDir();
    const name = (prefix ? prefix + '_' : '') + download.suggestedFilename();
    const file = path.join(ARTIFACTS_DIR, name);
    await download.saveAs(file);
    return file;
}

module.exports = { ARTIFACTS_DIR, ensureDir, saveHTML, saveDownload, DATE };
