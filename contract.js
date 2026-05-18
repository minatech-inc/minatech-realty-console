/**
 * 売買契約書（売買契約書 / 不動産売買契約書）下書きジェネレータ
 *
 * 重説（disclosure.js）と同じプロパティ・契約条件・特約を共有し、二重入力を排除する。
 * 重要な免責: 本書は下書きであり、最終的な契約書面化と署名・押印は宅地建物取引士・
 * 司法書士・弁護士の確認を経た上で行うこと。
 *
 * 対応書式（6種）:
 *   sale_land           土地（個人売主）
 *   sale_landhouse      土地建物（個人売主）
 *   sale_condo          区分所有建物（個人売主）
 *   sale_land_biz       土地（宅建業者売主）
 *   sale_landhouse_biz  土地建物（宅建業者売主）
 *   sale_condo_biz      区分所有建物（宅建業者売主）
 *
 * 賃貸契約書は別途 rental-contract.js で対応予定。
 */
var Contract = (function() {
    'use strict';

    var FORMATS = {
        'sale_land':            { asset:'land',      sellerBiz:false, label:'土地売買契約書' },
        'sale_landhouse':       { asset:'landhouse', sellerBiz:false, label:'土地建物売買契約書' },
        'sale_condo':           { asset:'condo',     sellerBiz:false, label:'区分所有建物売買契約書' },
        'sale_land_biz':        { asset:'land',      sellerBiz:true,  label:'土地売買契約書（宅建業者売主）' },
        'sale_landhouse_biz':   { asset:'landhouse', sellerBiz:true,  label:'土地建物売買契約書（宅建業者売主）' },
        'sale_condo_biz':       { asset:'condo',     sellerBiz:true,  label:'区分所有建物売買契約書（宅建業者売主）' }
    };

    function fmt(n) {
        if (n === null || n === undefined || n === '' || isNaN(n)) return '-';
        return Number(n).toLocaleString('ja-JP');
    }
    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function getFormats() { return Object.assign({}, FORMATS); }

    /**
     * 売買契約書HTML生成
     * @param {Object} prop - 物件データ
     * @param {Object} opts -
     *   formatKey: 'sale_condo' 等
     *   seller: { name, address, tel }
     *   buyer:  { name, address, tel }
     *   broker: 業者情報
     *   contract: { price, deposit, paymentDate, deliveryDate, loanCondition }
     *   special: 特約
     */
    function buildHTML(prop, opts) {
        opts = opts || {};
        var formatKey = opts.formatKey || 'sale_condo';
        var fmtDef = FORMATS[formatKey] || FORMATS.sale_condo;
        var seller = opts.seller || {};
        var buyer = opts.buyer || {};
        var broker = opts.broker || {};
        var contract = opts.contract || {};
        var special = opts.special || {};

        var isCondo = (fmtDef.asset === 'condo');
        var isLand = (fmtDef.asset === 'land');
        var isLandHouse = (fmtDef.asset === 'landhouse');
        var isSellerBiz = !!fmtDef.sellerBiz;

        var title = prop['物件名'] || '(物件名未記載)';
        var addr = prop['所在地'] || '-';
        var price = parseFloat(prop['価格(万円)'] || prop['価格']) || 0;
        var totalArea = prop['建物面積(㎡)'] || prop['面積(㎡)'] || prop['専有面積'] || '-';
        var landArea = prop['土地面積(㎡)'] || '-';
        var structure = prop['構造'] || prop['建物構造'] || '-';
        var builtAt = prop['築年月'] || prop['築年'] || '-';

        // 手付金等の計算（売買契約書では金額を明記）
        var priceYen = price * 10000;
        var deposit = parseInt(String(contract.deposit || '').replace(/[^\d]/g, '')) || 0;
        var depositYen = deposit < 10000 ? deposit * 10000 : deposit; // 万円表記なら×10000

        var css = renderCSS();
        var html = '<div class="contract">';
        html += '<div class="draft-watermark">下書き / DRAFT</div>';
        html += '<h1>' + esc(fmtDef.label) + '</h1>';
        html += '<div class="subtitle">作成日: ' + new Date().toLocaleDateString('ja-JP') + ' / 物件番号: ' + esc(prop.id || '－') + '</div>';

        html += '<div class="legal-warn"><strong>本書は下書きです。</strong> 実際の契約締結には宅地建物取引業者・司法書士・弁護士による最終確認、当事者の記名押印が必要です。本書の自動生成は当事者の法的責任を免除しません。</div>';

        // 前文
        html += '<div class="preamble">';
        html += '売主 ' + esc(seller.name || '＿＿＿＿＿') + '（以下「甲」という）と、買主 ' + esc(buyer.name || '＿＿＿＿＿') + '（以下「乙」という）は、後記表示の不動産（以下「本物件」という）について、次の条項により売買契約を締結する。';
        html += '</div>';

        // 物件表示
        html += '<h2>物件の表示</h2>';
        html += '<table>';
        html += '<tr><th>物件名称</th><td>' + esc(title) + '</td></tr>';
        html += '<tr><th>所在地</th><td>' + esc(addr) + '</td></tr>';
        if (isCondo) {
            html += '<tr><th>建物の名称</th><td>' + esc(prop['建物名称'] || title) + '</td></tr>';
            html += '<tr><th>専有部分の番号</th><td>' + esc(prop['部屋番号'] || '-') + '</td></tr>';
            html += '<tr><th>専有面積</th><td>' + fmt(totalArea) + ' ㎡（壁芯 / 登記簿）</td></tr>';
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>建築年月</th><td>' + esc(builtAt) + '</td></tr>';
            html += '<tr><th>敷地権の種類・割合</th><td>' + esc(special.condoLandRight || '※登記簿で確認') + '</td></tr>';
        } else if (isLandHouse) {
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿）</td></tr>';
            html += '<tr><th>建物面積</th><td>' + fmt(totalArea) + ' ㎡（登記簿）</td></tr>';
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>建築年月</th><td>' + esc(builtAt) + '</td></tr>';
        } else if (isLand) {
            html += '<tr><th>地番</th><td>' + esc(prop['地番'] || '※登記簿で確認') + '</td></tr>';
            html += '<tr><th>地目</th><td>' + esc(prop['地目'] || '※登記簿で確認') + '</td></tr>';
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿）</td></tr>';
        }
        html += '</table>';

        // 第1条 売買代金
        html += '<h2>第1条（売買代金）</h2>';
        html += '<p>本物件の売買代金は、金 ' + fmt(priceYen) + ' 円（うち消費税相当額 ' + esc(special.taxAmount || '－') + ' 円）とする。</p>';

        // 第2条 手付金
        html += '<h2>第2条（手付金）</h2>';
        html += '<p>乙は甲に対し、本契約締結と同時に手付金として金 ' + fmt(depositYen) + ' 円を支払う。手付金は売買代金に充当する。</p>';

        // 第3条 残代金
        html += '<h2>第3条（残代金の支払）</h2>';
        html += '<p>乙は甲に対し、売買代金から第2条の手付金を控除した残代金 金 ' + fmt(priceYen - depositYen) + ' 円を、' + esc(contract.paymentDate || '＿年＿月＿日') + ' までに支払う。</p>';

        // 第4条 引渡し
        html += '<h2>第4条（所有権移転・引渡し）</h2>';
        html += '<p>甲は乙に対し、残代金の受領と引換えに、本物件の所有権を移転し、その引渡しを ' + esc(contract.deliveryDate || '＿年＿月＿日') + ' に行う。</p>';

        // 第5条 所有権移転登記
        html += '<h2>第5条（所有権移転登記）</h2>';
        html += '<p>甲は、第4条の引渡しと同時に、乙の費用負担にて所有権移転登記の申請手続きに必要な書類を乙に交付する。登記申請費用（登録免許税・司法書士報酬等）は乙の負担とする。</p>';

        // 第6条 抵当権等の抹消
        html += '<h2>第6条（抵当権等の抹消）</h2>';
        html += '<p>甲は、第4条の引渡しまでに、本物件に設定されている抵当権・根抵当権その他所有権の行使を阻害する一切の権利を、甲の費用と責任において抹消するものとする。</p>';

        // 第7条 公租公課の精算
        html += '<h2>第7条（公租公課等の精算）</h2>';
        html += '<p>本物件にかかる固定資産税・都市計画税' + (isCondo ? '・管理費・修繕積立金' : '') + '等は、第4条の引渡日を基準として日割計算により当事者間で精算する（起算日：' + esc(special.taxStartDate || '1月1日') + '）。</p>';

        // 第8条 危険負担
        html += '<h2>第8条（危険負担）</h2>';
        html += '<p>本物件の引渡し前に、甲乙双方の責に帰すべからざる事由により本物件が滅失または毀損した場合、乙は本契約を解除することができる。この場合、甲は受領済の金員を無利息にて乙に返還する。</p>';

        // 第9条 契約不適合責任
        html += '<h2>第9条（契約不適合責任）</h2>';
        if (isSellerBiz) {
            html += '<p>本物件に契約の内容に適合しない隠れたる不適合があるときは、乙は引渡しから2年以内に甲に対し履行の追完、代金減額、損害賠償又は契約解除を請求することができる（宅地建物取引業法第40条による最低期間）。</p>';
        } else {
            html += '<p>本物件に契約の内容に適合しない不適合があるときは、乙は引渡しから ' + esc(special.warrantyMonths || '3') + ' ヶ月以内に甲に通知することにより、履行の追完、代金減額、損害賠償又は契約解除を請求することができる。</p>';
        }
        html += '<p>※前項にかかわらず、雨漏り、シロアリ被害、給排水管の故障、構造耐力上主要な部分の腐食については、引渡しから ' + esc(special.warrantyStructure || '3ヶ月') + ' を限度として責任を負う。</p>';

        // 第10条 手付解除
        html += '<h2>第10条（手付解除）</h2>';
        html += '<p>甲は乙に対し、手付金の倍額を現実に提供することにより、乙は甲に対し手付金を放棄することにより、本契約を解除することができる。ただし、相手方が本契約の履行に着手した後は、解除することができない。手付解除の期限は ' + esc(special.handDepositDeadline || contract.paymentDate || '残代金支払期日') + ' とする。</p>';

        // 第11条 違約金
        html += '<h2>第11条（契約違反による解除・違約金）</h2>';
        if (isSellerBiz) {
            html += '<p>当事者の一方が本契約に違反したときは、相手方は相当の期間を定めて履行を催告し、その期間内に履行されないときは本契約を解除することができる。この場合、違反した当事者は、相手方に対し違約金として売買代金の20%相当額を支払う（宅地建物取引業法第38条の上限）。</p>';
        } else {
            html += '<p>当事者の一方が本契約に違反したときは、相手方は相当の期間を定めて履行を催告し、その期間内に履行されないときは本契約を解除することができる。この場合、違反した当事者は、相手方に対し違約金として売買代金の20%相当額を支払う。</p>';
        }

        // 第12条 ローン特約
        if (contract.loanCondition && contract.loanCondition.indexOf('有') >= 0) {
            html += '<h2>第12条（ローン特約）</h2>';
            html += '<p>乙が ' + esc(special.loanLender || '金融機関') + ' に対し金 ' + esc(special.loanAmount || '＿') + ' 万円の融資申込みをしたが、' + esc(special.loanApprovalDate || contract.paymentDate || '残代金支払期日の前日') + ' までに承認が得られなかったときは、乙は本契約を解除することができ、甲は受領済の金員を無利息にて乙に返還する。</p>';
        }

        // 宅建業者売主の追加条項
        if (isSellerBiz) {
            html += '<h2>第13条（クーリングオフ）</h2>';
            html += '<p>乙が本契約を、宅地建物取引業者である甲の事務所等以外の場所で締結した場合、乙は本契約の書面の交付を受けた日から起算して8日を経過するまで、無条件で本契約を解除することができる（宅地建物取引業法第37条の2）。乙が宅地建物取引業者である場合は本条の適用はない。</p>';

            html += '<h2>第14条（手付金等の保全措置）</h2>';
            html += '<p>甲は、宅地建物取引業法第41条・第41条の2に基づき、手付金等について次の保全措置を講じる：' + esc(special.depositProtection || '＿＿＿＿（保証委託契約／保証保険契約／指定保管機関）') + '。</p>';
        }

        // 反社条項
        html += '<h2>第' + (isSellerBiz ? '15' : '13') + '条（反社会的勢力の排除）</h2>';
        html += '<p>甲及び乙は、自己及び自己の役員・従業員・関係者が反社会的勢力に該当しないこと、本契約締結後も該当しないことを表明し保証する。当事者の一方が前項に反することが判明したときは、相手方は無催告で本契約を解除することができ、解除された当事者は何らの請求もできず、相手方に対し損害賠償を求めることもできない。</p>';

        // 特約事項
        html += '<h2>第' + (isSellerBiz ? '16' : '14') + '条（特約事項）</h2>';
        html += '<ol>';
        if (special.leftovers) html += '<li>残置物について：' + esc(special.leftovers) + '</li>';
        if (special.otherSpecial) html += '<li>その他：' + esc(special.otherSpecial) + '</li>';
        html += '<li>本契約に定めのない事項及び本契約条項の解釈について疑義が生じたときは、甲乙誠意をもって協議し解決する。</li>';
        html += '<li>本契約に関する紛争については、本物件所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。</li>';
        html += '</ol>';

        // 末尾
        html += '<div class="closing">';
        html += '<p>本契約締結の証として本契約書を2通作成し、甲乙各1通を保有する。</p>';
        html += '<p style="text-align:right;">' + new Date().getFullYear() + '年　　月　　日</p>';
        html += '</div>';

        // 当事者署名欄
        html += '<div class="signature-area">';
        html += '<div class="signature-row">';
        html += '<div class="signature-box">';
        html += '<div style="font-weight:700;margin-bottom:6px;">売　主（甲）</div>';
        html += '<div>住所：' + esc(seller.address || '＿＿＿＿＿') + '</div>';
        html += '<div style="margin-top:6px;">氏名：' + esc(seller.name || '＿＿＿＿＿') + '<span style="margin-left:30px;">印</span></div>';
        html += '<div style="margin-top:6px;font-size:10px;color:#666;">TEL: ' + esc(seller.tel || '') + '</div>';
        html += '</div>';
        html += '<div class="signature-box">';
        html += '<div style="font-weight:700;margin-bottom:6px;">買　主（乙）</div>';
        html += '<div>住所：' + esc(buyer.address || '＿＿＿＿＿') + '</div>';
        html += '<div style="margin-top:6px;">氏名：' + esc(buyer.name || '＿＿＿＿＿') + '<span style="margin-left:30px;">印</span></div>';
        html += '<div style="margin-top:6px;font-size:10px;color:#666;">TEL: ' + esc(buyer.tel || '') + '</div>';
        html += '</div>';
        html += '</div>';

        // 仲介業者署名
        html += '<div class="signature-row" style="margin-top:14px;">';
        html += '<div class="signature-box" style="background:#fafafa;">';
        html += '<div style="font-weight:700;margin-bottom:6px;">媒介業者</div>';
        html += '<div>商号：' + esc(broker.name || '') + '</div>';
        html += '<div>免許番号：' + esc(broker.license || '') + '</div>';
        html += '<div>住所：' + esc(broker.address || '') + '</div>';
        html += '<div>TEL：' + esc(broker.tel || '') + '</div>';
        html += '<div style="margin-top:6px;">宅地建物取引士：' + esc(broker.agentName || '') + '（登録番号 ' + esc(broker.agentLicense || '') + '）<span style="margin-left:14px;">印</span></div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        html += '<div class="note">本書は MinaTech Realty Console v' + (window.RC_VERSION || '20260518') + ' で自動生成された下書きです。重要事項説明書と内容の整合性を必ず確認してください。</div>';
        html += '</div>';

        return css + html;
    }

    function renderCSS() {
        return '<style>' +
            '.contract{font-family:"MS Mincho","Yu Mincho",serif;color:#000;max-width:780px;margin:0 auto;padding:24px;background:#fff;font-size:11px;line-height:1.85}' +
            '.contract .draft-watermark{position:absolute;top:30px;right:30px;color:#dc2626;border:2px solid #dc2626;padding:4px 14px;font-weight:700;font-size:13px;transform:rotate(-8deg);opacity:0.6}' +
            '.contract h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px;letter-spacing:0.1em}' +
            '.contract .subtitle{text-align:center;font-size:10.5px;color:#444;margin-bottom:14px}' +
            '.contract h2{font-size:12px;background:#e8e8e8;border-left:4px solid #333;padding:4px 8px;margin:14px 0 6px;page-break-after:avoid}' +
            '.contract .preamble{padding:8px 0;border-bottom:1px solid #ccc;margin-bottom:10px}' +
            '.contract p{margin:4px 0 8px;text-indent:1em}' +
            '.contract table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10.5px}' +
            '.contract th{background:#f5f5f5;border:1px solid #333;padding:5px 8px;text-align:left;font-weight:700;width:32%;vertical-align:top}' +
            '.contract td{border:1px solid #333;padding:5px 8px;vertical-align:top}' +
            '.contract ol{padding-left:24px;margin:6px 0 10px}' +
            '.contract ol li{margin-bottom:4px}' +
            '.contract .legal-warn{font-size:10px;color:#7f1d1d;background:#fef2f2;border:1px solid #dc2626;border-radius:4px;padding:8px 12px;margin:10px 0;line-height:1.6}' +
            '.contract .closing{margin-top:14px;padding-top:10px;border-top:1px solid #ccc}' +
            '.contract .signature-area{margin-top:16px}' +
            '.contract .signature-row{display:flex;gap:14px;font-size:10.5px}' +
            '.contract .signature-box{flex:1;border:1px solid #666;padding:10px;min-height:90px}' +
            '.contract .note{font-size:9.5px;color:#666;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin-top:14px;line-height:1.6}' +
            '@media print {.contract .draft-watermark{opacity:0.4}}' +
            '</style>';
    }

    function exportPDF(prop, opts) {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            throw new Error('PDFライブラリ未読込');
        }
        opts = opts || {};
        var formatKey = opts.formatKey || 'sale_condo';
        var fmtDef = FORMATS[formatKey] || FORMATS.sale_condo;

        var container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '800px';
        container.innerHTML = buildHTML(prop, opts);
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
                var usableH = pageH - margin * 2;
                var pageCount = Math.ceil(imgH / usableH);
                for (var i = 0; i < pageCount; i++) {
                    if (i > 0) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, margin - (usableH * i), imgW, imgH);
                }
            }
            var name = (prop['物件名'] || 'property').replace(/[\\/:*?"<>|]/g, '_');
            var fmtLabel = fmtDef.label.replace(/[（）()\/]/g, '_');
            pdf.save('売買契約書下書き_' + fmtLabel + '_' + name + '_' + new Date().toISOString().slice(0,10) + '.pdf');
            document.body.removeChild(container);
        }).catch(function(e) {
            document.body.removeChild(container);
            throw e;
        });
    }

    return {
        FORMATS: FORMATS,
        getFormats: getFormats,
        buildHTML: buildHTML,
        exportPDF: exportPDF
    };
})();
