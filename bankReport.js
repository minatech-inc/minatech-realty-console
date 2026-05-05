/**
 * 銀行担保評価レポート生成（B-5）
 *
 * 目的:
 *   金融機関（地銀・信金・ノンバンク）の担保評価部が社内稟議で
 *   使用する「不動産担保物件調査報告書」書式に近い形式でPDF出力する。
 *
 * 参考フォーマット:
 *   - 全国銀行協会「不動産担保評価の標準的手順」
 *   - 日本不動産鑑定士協会連合会「担保評価実務指針」
 *   - 主要地銀の稟議書様式（積算評価・収益還元・掛け目の3層構造）
 *
 * 構成:
 *   1. 物件概要（所在地・構造・面積・築年）
 *   2. 積算評価（土地・建物内訳、維持管理補正、掛け目80%）
 *   3. 収益還元評価（NOI、Cap Rate、還元価格）
 *   4. 担保評価額（積算×80% と 収益還元×90% の低い方）
 *   5. 想定融資条件（LTV・期間・金利・DSCR）
 *   6. 定性評価（ハザード・耐震・用途地域）
 *   7. 総合所見と稟議上の留意点
 */
var BankReport = (function() {
    'use strict';

    function fmt(n) {
        if (n === null || n === undefined || isNaN(n)) return '-';
        return Number(n).toLocaleString('ja-JP');
    }

    function buildHTML(p) {
        var title = p['物件名'] || '(物件名未記載)';
        var addr = p['所在地'] || '-';
        var structure = p['構造'] || '-';
        var age = p['築年数'] || '-';
        var builtYear = (typeof age === 'number') ? (new Date().getFullYear() - age) : '-';
        var totalArea = p['建物面積(㎡)'] || p['面積(㎡)'] || '-';
        var landArea = p['土地面積(㎡)'] || '-';
        var price = parseFloat(p['価格(万円)']) || 0;

        var appVal = parseFloat(p['積算価格(万円)']) || 0;
        var landVal = parseFloat(p['土地積算(万円)']) || 0;
        var bldgVal = parseFloat(p['建物積算(万円)']) || 0;
        var ratio = p['積算比(%)'] || 0;
        var maintFactor = p['維持管理補正'];
        var maintLabel = p['維持管理要因'] || '';

        // 担保掛け目: 積算×80%、収益還元×90%、低い方を採用
        var appCollateral = Math.round(appVal * 0.8);
        var incVal = parseFloat(p['収益還元価格(万円)']) || 0;
        var incCollateral = Math.round(incVal * 0.9);
        var collateralVal = 0;
        var collateralBasis = '';
        if (appCollateral && incCollateral) {
            collateralVal = Math.min(appCollateral, incCollateral);
            collateralBasis = (appCollateral <= incCollateral) ? '積算×80%' : '収益還元×90%';
        } else if (appCollateral) {
            collateralVal = appCollateral; collateralBasis = '積算×80%';
        } else if (incCollateral) {
            collateralVal = incCollateral; collateralBasis = '収益還元×90%';
        }

        var collRatio = price > 0 ? Math.round(collateralVal / price * 100) : 0;

        var fin = p['__financing'] || {};
        var noi = p['NOI(万円/年)'] || '-';
        var dscr = p['DSCR'] || fin.dscr || '-';
        var rank = p['評価ランク'] || '-';
        var priority = p['優先度'] || '-';

        // ハザード/耐震
        var t = p['ハザード津波'], f = p['ハザード洪水'], l = p['ハザード土砂'];
        var lvl = function(v) { return ['低','中','高'][v] || '-'; };
        var shintai = (typeof age === 'number' && builtYear !== '-')
            ? (builtYear >= 1981 ? '新耐震' : '旧耐震') : '-';

        var css =
            '<style>' +
            '.bank-report{font-family:"MS Gothic","Yu Gothic",sans-serif;color:#000;max-width:780px;margin:0 auto;padding:20px;background:#fff;font-size:11px;line-height:1.5}' +
            '.bank-report h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px}' +
            '.bank-report h2{font-size:13px;background:#e8e8e8;border-left:5px solid #333;padding:4px 8px;margin:14px 0 6px}' +
            '.bank-report table{width:100%;border-collapse:collapse;margin-bottom:8px}' +
            '.bank-report th,.bank-report td{border:1px solid #666;padding:4px 6px;font-size:11px;vertical-align:top}' +
            '.bank-report th{background:#f0f0f0;width:140px;text-align:left;font-weight:bold}' +
            '.bank-report .summary-table th{width:180px}' +
            '.bank-report .amount{text-align:right;font-weight:bold}' +
            '.bank-report .big{font-size:14px;font-weight:bold}' +
            '.bank-report .verdict-box{border:2px solid #000;padding:8px 12px;margin-top:10px;background:#fffde7}' +
            '.bank-report .footer{margin-top:16px;font-size:9px;color:#666;border-top:1px solid #999;padding-top:6px}' +
            '.bank-report .two-col{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
            '</style>';

        var html = css + '<div class="bank-report">';
        html += '<h1>不動産担保物件調査報告書</h1>';
        html += '<div style="text-align:right;font-size:10px;">調査日: ' + new Date().toLocaleDateString('ja-JP') + '　作成: MinaTech REINS Analyzer</div>';

        // 1. 物件概要
        html += '<h2>1. 物件概要</h2><table class="summary-table">';
        html += '<tr><th>物件名称</th><td>' + escapeHtml(title) + '</td></tr>';
        html += '<tr><th>所在地</th><td>' + escapeHtml(addr) + '</td></tr>';
        html += '<tr><th>構造・規模</th><td>' + escapeHtml(structure) + '</td></tr>';
        html += '<tr><th>建築年</th><td>' + builtYear + '年（築' + age + '年） ' + shintai + '</td></tr>';
        html += '<tr><th>土地面積</th><td>' + landArea + ' ㎡</td></tr>';
        html += '<tr><th>建物面積</th><td>' + totalArea + ' ㎡</td></tr>';
        html += '<tr><th>売出価格</th><td class="amount big">' + fmt(price) + ' 万円</td></tr>';
        html += '<tr><th>物件種別</th><td>' + (p['カテゴリ'] || '-') + '</td></tr>';
        html += '</table>';

        // 2. 積算評価
        html += '<h2>2. 積算評価（原価法）</h2><table class="summary-table">';
        html += '<tr><th>土地積算価格</th><td class="amount">' + fmt(landVal) + ' 万円</td></tr>';
        html += '<tr><th>　土地単価</th><td>' + (p['土地単価(万円/㎡)'] || '-') + ' 万円/㎡ （' + (p['地価出典'] || '-') + '）</td></tr>';
        html += '<tr><th>建物積算価格</th><td class="amount">' + fmt(bldgVal) + ' 万円</td></tr>';
        if (maintFactor !== undefined && maintFactor !== 1.0) {
            html += '<tr><th>　維持管理補正</th><td>×' + Number(maintFactor).toFixed(2) + ' （' + escapeHtml(maintLabel) + '）</td></tr>';
        }
        html += '<tr><th>積算価格合計</th><td class="amount big">' + fmt(appVal) + ' 万円</td></tr>';
        html += '<tr><th>積算比（積算/売出）</th><td class="amount">' + ratio + ' %</td></tr>';
        html += '<tr><th>担保評価額（積算×80%）</th><td class="amount big">' + fmt(appCollateral) + ' 万円</td></tr>';
        html += '</table>';

        // 3. 収益還元評価
        if (incVal) {
            html += '<h2>3. 収益還元評価（直接還元法）</h2><table class="summary-table">';
            html += '<tr><th>NOI（純収益）</th><td class="amount">' + fmt(noi) + ' 万円/年</td></tr>';
            html += '<tr><th>還元利回り（Cap Rate）</th><td>' + (p['還元利回り(%)'] || '-') + ' %</td></tr>';
            html += '<tr><th>収益還元価格</th><td class="amount">' + fmt(incVal) + ' 万円</td></tr>';
            html += '<tr><th>収益還元比</th><td class="amount">' + (p['収益還元比(%)'] || '-') + ' %</td></tr>';
            html += '<tr><th>担保評価額（収益還元×90%）</th><td class="amount big">' + fmt(incCollateral) + ' 万円</td></tr>';
            html += '</table>';
        }

        // 4. 担保評価額決定
        html += '<h2>4. 採用担保評価額</h2><table class="summary-table">';
        html += '<tr><th>採用評価額</th><td class="amount big">' + fmt(collateralVal) + ' 万円</td></tr>';
        html += '<tr><th>算定根拠</th><td>' + collateralBasis + '（積算・収益還元の低位採用）</td></tr>';
        html += '<tr><th>売出価格比</th><td class="amount">' + collRatio + ' %</td></tr>';
        html += '</table>';

        // 5. 融資条件
        if (fin.loanYears) {
            html += '<h2>5. 想定融資条件</h2><table class="summary-table">';
            html += '<tr><th>融資期間</th><td>' + fin.loanYears + ' 年（残存耐用' + fin.remainYears + '年・上限35年）</td></tr>';
            html += '<tr><th>想定金利</th><td>' + fin.rate + ' %（投資用中央値）</td></tr>';
            html += '<tr><th>LTV（担保掛目）</th><td>' + fin.ltv + ' %</td></tr>';
            html += '<tr><th>想定融資額</th><td class="amount">' + fmt(fin.loanAmount) + ' 万円</td></tr>';
            html += '<tr><th>年間返済額</th><td class="amount">' + fmt(fin.annualPayment) + ' 万円（月額 ' + fmt(fin.monthlyPayment) + ' 万円）</td></tr>';
            html += '<tr><th>DSCR</th><td class="amount big">' + dscr + '</td></tr>';
            html += '<tr><th>融資判定</th><td>' + (fin.verdict || '-') + '</td></tr>';
            html += '</table>';
        }

        // 6. 定性評価
        html += '<h2>6. 定性評価</h2><table class="summary-table">';
        html += '<tr><th>エリア評価</th><td>' + (p['エリア評価'] || '-') + '</td></tr>';
        if (t !== undefined) {
            html += '<tr><th>ハザードリスク</th><td>津波:' + lvl(t) + '　洪水:' + lvl(f) + '　土砂:' + lvl(l) + '</td></tr>';
        }
        if (p['用途地域']) html += '<tr><th>用途地域</th><td>' + escapeHtml(p['用途地域']) + '</td></tr>';
        if (p['将来価値スコア'] !== undefined) {
            html += '<tr><th>将来価値スコア</th><td>' + p['将来価値スコア'] + ' / 10　（人口推計2050: ' + (p['人口推計2050(%)'] || '-') + '%）</td></tr>';
        }
        html += '</table>';

        // 7. 総合所見
        html += '<h2>7. 総合所見</h2>';
        html += '<div class="verdict-box">';
        html += '<div class="big">判定ランク: ' + rank + '　／　優先度: ' + priority + '</div>';
        html += '<div style="margin-top:6px;">加減点根拠: ' + escapeHtml(p['判断根拠'] || '') + '</div>';
        html += '</div>';

        // 稟議上の留意点
        var cautions = buildCautions(p, ratio, dscr, collRatio);
        if (cautions.length) {
            html += '<h2>8. 稟議上の留意点</h2><ul style="margin:4px 0 4px 20px;padding:0;">';
            cautions.forEach(function(c) { html += '<li>' + escapeHtml(c) + '</li>'; });
            html += '</ul>';
        }

        html += '<div class="footer">※本報告書は国交省公示地価・不動産鑑定評価基準・各種ガイドラインを基に自動生成された机上評価です。実際の融資可否は金融機関の内部基準・借主属性により異なります。正式な担保評価は不動産鑑定士または金融機関査定部門にご依頼ください。</div>';
        html += '</div>';
        return html;
    }

    function buildCautions(p, ratio, dscr, collRatio) {
        var list = [];
        if (ratio < 60) list.push('積算比が60%未満のため、アパートローンでの担保充足が困難。現金購入または大幅頭金が前提。');
        else if (ratio < 80) list.push('積算比80%未満のため、プロパーローンまたはノンバンク融資が中心となる。金利上振れに注意。');
        if (dscr !== '-' && dscr !== null && !isNaN(parseFloat(dscr))) {
            var d = parseFloat(dscr);
            if (d < 1.1) list.push('DSCRが1.1未満。空室率・金利上昇に対する耐性が低く、返済原資不足リスク。');
            else if (d < 1.3) list.push('DSCRが1.3未満のため、金融機関により謝絶される可能性あり。自己資金厚めの投入を推奨。');
        }
        if (collRatio && collRatio < 70) list.push('担保評価額が売出価格の70%未満。不足分を共同担保または現金で補填する必要あり。');
        if (p['ハザード津波'] >= 2 || p['ハザード洪水'] >= 2 || p['ハザード土砂'] >= 2) {
            list.push('高リスクハザード該当。水災補償付帯必須、金融機関によっては融資減額判定。');
        }
        var age = p['築年数'];
        if (typeof age === 'number' && age >= 30) {
            var builtY = new Date().getFullYear() - age;
            if (builtY < 1981) list.push('旧耐震基準。耐震診断・補強工事の実施状況を追加確認のうえ稟議に添付すること。');
        }
        if (p['管理組合借入金(万円)'] > 0) list.push('管理組合に借入金残高あり。長期修繕計画の精査と将来の積立金増額リスクを稟議書に明記。');
        if (p['滞納世帯率(%)'] >= 5) list.push('滞納率5%超。管理組合財務の健全性に懸念あり。直近3期分の収支報告書を徴求推奨。');
        return list;
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 単一物件の銀行評価PDFを出力
    function exportPDF(prop) {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            throw new Error('PDFライブラリ未読込');
        }
        var container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '800px';
        container.innerHTML = buildHTML(prop);
        document.body.appendChild(container);

        var jsPDF = window.jspdf.jsPDF;
        var pdf = new jsPDF('p', 'mm', 'a4');
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var margin = 10;

        return window.html2canvas(container.firstElementChild || container, {
            scale: 2, backgroundColor: '#ffffff', logging: false
        }).then(function(canvas) {
            var imgW = pageW - margin * 2;
            var imgH = canvas.height * imgW / canvas.width;
            var imgData = canvas.toDataURL('image/png');
            if (imgH <= pageH - margin * 2) {
                pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
            } else {
                // 複数ページに分割
                var usableH = pageH - margin * 2;
                var pageCount = Math.ceil(imgH / usableH);
                for (var i = 0; i < pageCount; i++) {
                    if (i > 0) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, margin - (usableH * i), imgW, imgH);
                }
            }
            var name = (prop['物件名'] || 'property').replace(/[\\/:*?"<>|]/g, '_');
            pdf.save('担保評価_' + name + '_' + new Date().toISOString().slice(0,10) + '.pdf');
            document.body.removeChild(container);
        }).catch(function(e) {
            document.body.removeChild(container);
            throw e;
        });
    }

    return {
        buildHTML: buildHTML,
        exportPDF: exportPDF
    };
})();
