/**
 * テスト結果HTMLレポート生成器
 * Playwright の JSON 出力（tests/reports/last-run.json）を読み、
 * 経営者・非エンジニアでも一目で状況が分かるレポートを生成する。
 *
 * 出力先:
 *   1) tests/reports/RealtyConsole-テストレポート_YYYY-MM-DD.html
 *   2) デスクトップ/MinaTech-Reports/（存在すれば）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const JSON_PATH = path.join(REPORTS_DIR, 'last-run.json');

const CATEGORY_LABEL = {
    'コアロジック': { desc: '物件解析・スコアリング・契約書類生成・DBなど中核ロジックの動作確認', order: 1 },
    'UI基盤': { desc: 'ライセンス認証・サイドバー・テーマ切替など画面基盤の確認', order: 2 },
    '物件評価分析フロー': { desc: 'サンプル投入から解析・結果表示までの一連の操作確認', order: 3 },
    '出力機能': { desc: 'CSV/Excel/JSON/PDF/銀行評価書/SUUMO入稿シートの出力確認', order: 4 },
    '契約書類': { desc: '重説・売買契約書・賃貸借契約書の画面生成確認', order: 5 },
    '業務支援': { desc: '役所調査・ポータルチェック・画像処理の起動確認', order: 6 },
    'マスタ管理・履歴': { desc: '物件マスタDB保存・解析履歴の保存/表示確認', order: 7 },
    '静的ページ': { desc: '製品紹介・採点基準・利用規約ページの配信確認', order: 8 },
    '重い機能': { desc: 'PDF/マイソクのOCR解析・画像リサイズとマスキング（週次のみ）', order: 9 },
    '本番スモーク': { desc: '本番サイトとCloudflare Workers（チャット/ライセンス/国交省API）の死活確認', order: 10 }
};

function flattenSuites(suites, ancestors, out) {
    (suites || []).forEach((s) => {
        const chain = s.title ? ancestors.concat([s.title]) : ancestors;
        (s.specs || []).forEach((spec) => {
            (spec.tests || []).forEach((t) => {
                const results = t.results || [];
                const last = results[results.length - 1] || {};
                out.push({
                    category: chain[0] || path.basename(spec.file || ''),
                    title: spec.title,
                    status: t.status || last.status || 'unknown', // expected/unexpected/flaky/skipped
                    duration: results.reduce((a, r) => a + (r.duration || 0), 0),
                    retries: Math.max(0, results.length - 1),
                    error: last.status === 'failed' || t.status === 'unexpected'
                        ? String((last.error && (last.error.message || last.error.value)) || '').replace(/\[[0-9;]*m/g, '').slice(0, 800)
                        : ''
                });
            });
        });
        flattenSuites(s.suites, chain, out);
    });
}

function fmtDur(ms) {
    if (ms < 1000) return Math.round(ms) + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + '秒';
    return Math.floor(ms / 60000) + '分' + Math.round((ms % 60000) / 1000) + '秒';
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICON = {
    pass: '<svg viewBox="0 0 20 20" class="ti ti-pass"><circle cx="10" cy="10" r="9"/><polyline points="6 10.5 9 13.5 14.5 7.5"/></svg>',
    fail: '<svg viewBox="0 0 20 20" class="ti ti-fail"><circle cx="10" cy="10" r="9"/><line x1="7" y1="7" x2="13" y2="13"/><line x1="13" y1="7" x2="7" y2="13"/></svg>',
    flaky: '<svg viewBox="0 0 20 20" class="ti ti-flaky"><circle cx="10" cy="10" r="9"/><line x1="10" y1="6" x2="10" y2="11"/><circle cx="10" cy="14.2" r="0.8" fill="currentColor" stroke="none"/></svg>',
    skip: '<svg viewBox="0 0 20 20" class="ti ti-skip"><circle cx="10" cy="10" r="9"/><line x1="6.5" y1="10" x2="13.5" y2="10"/></svg>'
};

function statusInfo(t) {
    if (t.status === 'expected') return t.retries > 0
        ? { key: 'flaky', label: '合格（再試行）', cls: 'flaky' }
        : { key: 'pass', label: '合格', cls: 'pass' };
    if (t.status === 'flaky') return { key: 'flaky', label: '合格（再試行）', cls: 'flaky' };
    if (t.status === 'skipped') return { key: 'skip', label: 'スキップ', cls: 'skip' };
    return { key: 'fail', label: '失敗', cls: 'fail' };
}

function donutSVG(passed, flaky, failed, skipped) {
    const total = Math.max(1, passed + flaky + failed + skipped);
    const C = 2 * Math.PI * 52;
    let offset = 0;
    const seg = (n, color) => {
        const len = (n / total) * C;
        const s = `<circle cx="70" cy="70" r="52" fill="none" stroke="${color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
        offset += len;
        return n > 0 ? s : '';
    };
    const rate = Math.round(((passed + flaky) / total) * 100);
    return `<svg viewBox="0 0 140 140" class="donut">
        <circle cx="70" cy="70" r="52" fill="none" stroke="#e5e9f0" stroke-width="16"/>
        ${seg(passed, '#10b981')}${seg(flaky, '#f59e0b')}${seg(failed, '#ef4444')}${seg(skipped, '#9ca3af')}
        <text x="70" y="66" text-anchor="middle" class="donut-num">${rate}%</text>
        <text x="70" y="84" text-anchor="middle" class="donut-lbl">成功率</text>
    </svg>`;
}

function build() {
    if (!fs.existsSync(JSON_PATH)) {
        console.error('[report] last-run.json が見つかりません: ' + JSON_PATH);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    const tests = [];
    flattenSuites(raw.suites, [], tests);

    const passed = tests.filter((t) => statusInfo(t).key === 'pass').length;
    const flaky = tests.filter((t) => statusInfo(t).key === 'flaky').length;
    const failed = tests.filter((t) => statusInfo(t).key === 'fail').length;
    const skipped = tests.filter((t) => statusInfo(t).key === 'skip').length;
    const totalDuration = raw.stats ? raw.stats.duration : tests.reduce((a, t) => a + t.duration, 0);
    const startTime = raw.stats && raw.stats.startTime ? new Date(raw.stats.startTime) : new Date();
    const allOk = failed === 0;

    // カテゴリ別グループ
    const byCat = new Map();
    tests.forEach((t) => {
        if (!byCat.has(t.category)) byCat.set(t.category, []);
        byCat.get(t.category).push(t);
    });
    const cats = [...byCat.entries()].sort((a, b) =>
        ((CATEGORY_LABEL[a[0]] || {}).order || 99) - ((CATEGORY_LABEL[b[0]] || {}).order || 99));

    const dateStr = startTime.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fileDate = startTime.toISOString().slice(0, 10);

    // 成果物（重説・契約書・帳票等）: artifacts/ 配下の最新日付フォルダを対象
    const artifactsRoot = path.join(REPORTS_DIR, 'artifacts');
    let artifactDate = '';
    let artifactFiles = [];
    if (fs.existsSync(artifactsRoot)) {
        const dirs = fs.readdirSync(artifactsRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        if (dirs.length) {
            artifactDate = dirs[dirs.length - 1];
            artifactFiles = fs.readdirSync(path.join(artifactsRoot, artifactDate)).sort();
        }
    }

    const catRows = cats.map(([cat, list]) => {
        const catFailed = list.filter((t) => statusInfo(t).key === 'fail').length;
        const meta = CATEGORY_LABEL[cat] || { desc: '' };
        const rows = list.map((t) => {
            const st = statusInfo(t);
            return `<tr class="row-${st.cls}">
                <td class="td-icon">${ICON[st.key]}</td>
                <td class="td-name">${esc(t.title)}${t.error ? `<div class="err">${esc(t.error)}</div>` : ''}</td>
                <td class="td-status"><span class="badge badge-${st.cls}">${st.label}</span></td>
                <td class="td-dur">${fmtDur(t.duration)}</td>
            </tr>`;
        }).join('\n');
        return `<section class="cat">
            <div class="cat-head">
                <div>
                    <h2>${esc(cat)}<span class="cat-count">${list.length}項目${catFailed ? ` ／ <span class="cat-fail">${catFailed}件失敗</span>` : ' ／ 全て合格'}</span></h2>
                    <p class="cat-desc">${esc(meta.desc)}</p>
                </div>
            </div>
            <table><tbody>${rows}</tbody></table>
        </section>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Realty Console テストレポート ${fileDate}</title>
<style>
    :root{--ink:#1a2233;--sub:#5b6675;--line:#e5e9f0;--bg:#f4f6fa;--card:#ffffff;
        --green:#10b981;--green-soft:#ecfdf5;--red:#ef4444;--red-soft:#fef2f2;
        --amber:#f59e0b;--amber-soft:#fffbeb;--gray:#9ca3af;--gray-soft:#f3f4f6;--blue:#3b82f6;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter','Noto Sans JP','Hiragino Kaku Gothic ProN',Meiryo,sans-serif;
        background:var(--bg);color:var(--ink);line-height:1.65;padding:36px 20px 60px;-webkit-font-smoothing:antialiased;}
    .wrap{max-width:920px;margin:0 auto;}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:22px;}
    .head h1{font-size:22px;font-weight:700;letter-spacing:-0.01em;}
    .head .sub{color:var(--sub);font-size:13px;margin-top:4px;}
    .verdict{display:inline-flex;align-items:center;gap:9px;font-size:15px;font-weight:700;
        padding:10px 22px;border-radius:999px;white-space:nowrap;}
    .verdict svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
    .verdict.ok{background:var(--green-soft);color:#047857;border:1px solid #a7f3d0;}
    .verdict.ng{background:var(--red-soft);color:#b91c1c;border:1px solid #fecaca;}
    .summary{display:grid;grid-template-columns:170px repeat(4,1fr);gap:14px;margin-bottom:28px;}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;}
    .donut-card{display:flex;align-items:center;justify-content:center;grid-row:span 1;}
    .donut{width:120px;height:120px;}
    .donut-num{font-size:26px;font-weight:700;fill:var(--ink);font-family:inherit;}
    .donut-lbl{font-size:10px;fill:var(--sub);font-family:inherit;}
    .stat .num{font-size:30px;font-weight:700;letter-spacing:-0.02em;}
    .stat .lbl{font-size:12px;color:var(--sub);margin-top:2px;}
    .stat.pass .num{color:var(--green);}
    .stat.fail .num{color:${'${'}failed>0?"var(--red)":"var(--ink)"};}
    .cat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:16px;}
    .cat h2{font-size:15.5px;font-weight:700;}
    .cat-count{font-size:12px;color:var(--sub);font-weight:400;margin-left:10px;}
    .cat-fail{color:var(--red);font-weight:700;}
    .cat-desc{font-size:12px;color:var(--sub);margin:2px 0 12px;}
    table{width:100%;border-collapse:collapse;}
    td{padding:9px 8px;border-top:1px solid var(--line);font-size:13.5px;vertical-align:top;}
    .td-icon{width:30px;}
    .ti{width:19px;height:19px;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;margin-top:2px;}
    .ti-pass{stroke:var(--green);}
    .ti-fail{stroke:var(--red);}
    .ti-flaky{stroke:var(--amber);}
    .ti-skip{stroke:var(--gray);}
    .td-status{width:120px;text-align:right;}
    .td-dur{width:76px;text-align:right;color:var(--sub);font-size:12px;font-variant-numeric:tabular-nums;}
    .badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;}
    .badge-pass{background:var(--green-soft);color:#047857;}
    .badge-fail{background:var(--red-soft);color:#b91c1c;}
    .badge-flaky{background:var(--amber-soft);color:#b45309;}
    .badge-skip{background:var(--gray-soft);color:#4b5563;}
    .err{margin-top:6px;background:var(--red-soft);border:1px solid #fecaca;border-radius:8px;
        padding:9px 12px;font-size:11.5px;color:#7f1d1d;white-space:pre-wrap;word-break:break-word;
        font-family:'JetBrains Mono',Consolas,monospace;max-height:180px;overflow:auto;}
    .foot{color:var(--sub);font-size:11.5px;text-align:center;margin-top:28px;line-height:2;}
    @media(max-width:720px){.summary{grid-template-columns:1fr 1fr;}.donut-card{grid-column:span 2;}}
</style>
</head>
<body>
<div class="wrap">
    <div class="head">
        <div>
            <h1>Realty Console 全項目テストレポート</h1>
            <p class="sub">実行日時：${dateStr} ／ 対象：realty.minatech1210.com（全${tests.length}項目）</p>
        </div>
        <span class="verdict ${allOk ? 'ok' : 'ng'}">
            ${allOk
                ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16.5 9.5"/></svg>すべて正常'
                : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="7.5" x2="12" y2="13.5"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/></svg>要対応 ${failed}件`}
        </span>
    </div>

    <div class="summary">
        <div class="card donut-card">${donutSVG(passed, flaky, failed, skipped)}</div>
        <div class="card stat pass"><div class="num">${passed + flaky}</div><div class="lbl">合格${flaky ? `（うち再試行 ${flaky}）` : ''}</div></div>
        <div class="card stat fail"><div class="num">${failed}</div><div class="lbl">失敗</div></div>
        <div class="card stat"><div class="num">${skipped}</div><div class="lbl">スキップ</div></div>
        <div class="card stat"><div class="num" style="font-size:22px;padding-top:5px;">${fmtDur(totalDuration)}</div><div class="lbl">実行時間</div></div>
    </div>

    ${catRows}

    ${artifactFiles.length ? `<section class="cat">
        <div class="cat-head"><div>
            <h2>テストで生成された成果物<span class="cat-count">${artifactFiles.length}ファイル</span></h2>
            <p class="cat-desc">重説・契約書・帳票などの実生成物。ファイル名をクリックすると内容を確認できます（サンプル物件データ使用・実務利用不可）。</p>
        </div></div>
        <table><tbody>
        ${artifactFiles.map((f) => `<tr>
            <td class="td-icon"><svg viewBox="0 0 20 20" class="ti" style="stroke:var(--blue);"><path d="M12 2H5a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 5 18h10a1.5 1.5 0 0 0 1.5-1.5V6.5z"/><polyline points="12 2 12 6.5 16.5 6.5"/></svg></td>
            <td class="td-name"><a href="artifacts/${esc(artifactDate)}/${encodeURIComponent(f)}" style="color:var(--blue);text-decoration:none;">${esc(f)}</a></td>
            <td class="td-status"></td><td class="td-dur"></td>
        </tr>`).join('\n')}
        </tbody></table>
    </section>` : ''}

    <p class="foot">
        MinaTech Realty Console 自動テスト ／ Playwright + Chromium（実ブラウザ検証）<br>
        このレポートは自動生成されています。失敗項目がある場合はエラー内容を添えて開発担当へ連携してください。
    </p>
</div>
</body>
</html>`;

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const outName = `RealtyConsole-テストレポート_${fileDate}.html`;
    const outPath = path.join(REPORTS_DIR, outName);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log('[report] 生成: ' + outPath);

    // デスクトップの MinaTech-Reports にも複製（レポート + 成果物）
    const desktopDir = path.join(os.homedir(), 'Desktop', 'MinaTech-Reports');
    if (fs.existsSync(desktopDir)) {
        const dest = path.join(desktopDir, outName);
        fs.copyFileSync(outPath, dest);
        console.log('[report] 複製: ' + dest);
        if (artifactFiles.length) {
            const srcDir = path.join(artifactsRoot, artifactDate);
            const dstDir = path.join(desktopDir, 'artifacts', artifactDate);
            fs.mkdirSync(dstDir, { recursive: true });
            artifactFiles.forEach((f) => fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f)));
            console.log('[report] 成果物複製: ' + dstDir + '（' + artifactFiles.length + 'ファイル）');
        }
    }

    console.log(`[report] 合格 ${passed + flaky} ／ 失敗 ${failed} ／ スキップ ${skipped}（成功率 ${Math.round(((passed + flaky) / Math.max(1, tests.length)) * 100)}%）`);
    return allOk ? 0 : 2;
}

process.exit(build());
