/**
 * 重要事項説明書（重説）下書きジェネレータ
 *
 * 宅地建物取引業法 第35条 に基づく重要事項説明書の下書きを HTML/PDF で生成する。
 *
 * 重要な免責:
 *   本機能は「下書き作成支援ツール」であり、宅建業法上の説明責任を免除しない。
 *   発行された下書きは、宅地建物取引士による対面/IT重説での説明・記名押印を経て初めて法的効力を持つ。
 *   各項目の最終的な事実確認・記載責任は宅建士本人にある。
 *
 * 対応:
 *   - 売買版（中古マンション・中古戸建・土地）
 *   - 区分マンション特有事項
 *   - IT重説対応情報（ビデオ通話URL、説明日時、録画方針）
 *
 * 参考フォーマット:
 *   - 国土交通省「重要事項説明書様式（住宅売買・中古版）」
 *   - 全国宅地建物取引業協会連合会の標準書式
 *
 * データソース:
 *   - 物件マスタDB（prop オブジェクト）
 *   - 国交省 不動産情報ライブラリ API（用途地域・ハザード）
 *   - ユーザー入力（特約・残置物・IT重説URL等）
 */
var Disclosure = (function() {
    'use strict';

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

    /**
     * 重説下書きHTML生成
     * @param {Object} prop - 物件データ
     * @param {Object} opts - 追加情報
     *   broker: { name, license, address, tel, agentName, agentLicense }
     *   itDisclosure: { enabled, meetingUrl, datetime, recording, software }
     *   contract: { price, deposit, paymentDate, deliveryDate, loanCondition }
     *   special: { ... 特約 ... }
     */
    function buildHTML(prop, opts) {
        opts = opts || {};
        var broker = opts.broker || {};
        var it = opts.itDisclosure || {};
        var contract = opts.contract || {};
        var special = opts.special || {};

        var category = prop['物件カテゴリ'] || prop.category || 'apartment';
        var isCondo = (category === 'condo');
        var isLand = (category === 'land');
        var isHouse = (category === 'house');

        var title = prop['物件名'] || '(物件名未記載)';
        var addr = prop['所在地'] || prop['address'] || '-';
        var price = parseFloat(prop['価格(万円)'] || prop['価格']) || 0;
        var totalArea = prop['建物面積(㎡)'] || prop['面積(㎡)'] || prop['専有面積'] || '-';
        var landArea = prop['土地面積(㎡)'] || '-';
        var structure = prop['構造'] || prop['建物構造'] || '-';
        var builtAt = prop['築年月'] || prop['築年'] || '-';

        // 用途地域・容積率・建蔽率（reinfolib由来）
        var youto = prop['用途地域'] || '-';
        var kenpei = prop['建蔽率'] || '-';
        var youseki = prop['容積率'] || '-';

        // ハザード
        var hzT = prop['ハザード津波'], hzF = prop['ハザード洪水'], hzL = prop['ハザード土砂'];
        var hzLevel = function(v) { return ['低','中','高'][v] || '-'; };

        // 耐震
        var ageNum = parseInt(prop['築年数']);
        var builtYear = !isNaN(ageNum) ? (new Date().getFullYear() - ageNum) : null;
        var shintai = builtYear ? (builtYear >= 1981 ? '新耐震基準（昭和56年6月以降）' : '旧耐震基準（昭和56年5月以前）') : '-';

        // CSS
        var css =
            '<style>' +
            '.disclosure{font-family:"MS Mincho","Yu Mincho",serif;color:#000;max-width:780px;margin:0 auto;padding:24px;background:#fff;font-size:11px;line-height:1.7}' +
            '.disclosure .draft-watermark{position:absolute;top:30px;right:30px;color:#dc2626;border:2px solid #dc2626;padding:4px 14px;font-weight:700;font-size:13px;transform:rotate(-8deg);opacity:0.6}' +
            '.disclosure h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px;letter-spacing:0.1em}' +
            '.disclosure .subtitle{text-align:center;font-size:11px;color:#444;margin-bottom:18px}' +
            '.disclosure h2{font-size:12px;background:#e8e8e8;border-left:4px solid #333;padding:4px 8px;margin:14px 0 6px;page-break-after:avoid}' +
            '.disclosure table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10.5px}' +
            '.disclosure th{background:#f5f5f5;border:1px solid #333;padding:5px 8px;text-align:left;font-weight:700;width:32%;vertical-align:top}' +
            '.disclosure td{border:1px solid #333;padding:5px 8px;vertical-align:top}' +
            '.disclosure .check{font-family:monospace;font-size:10px}' +
            '.disclosure .note{font-size:10px;color:#444;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin:8px 0;line-height:1.6}' +
            '.disclosure .legal-warn{font-size:10px;color:#7f1d1d;background:#fef2f2;border:1px solid #dc2626;border-radius:4px;padding:8px 12px;margin:10px 0;line-height:1.6}' +
            '.disclosure .signature-area{margin-top:20px;padding:14px;border:1px solid #999;background:#fafafa}' +
            '.disclosure .signature-row{display:flex;justify-content:space-between;margin-top:10px;gap:12px;font-size:10px}' +
            '.disclosure .signature-box{flex:1;border:1px solid #666;padding:8px;min-height:60px}' +
            '.disclosure .it-disclosure-block{border:2px solid #3b82f6;background:#eff6ff;padding:10px 14px;border-radius:6px;margin:10px 0}' +
            '.disclosure .it-disclosure-block h3{margin:0 0 6px;font-size:11px;color:#1e40af}' +
            '@media print {.disclosure .draft-watermark{opacity:0.4}}' +
            '</style>';

        var html = '<div class="disclosure">';
        html += '<div class="draft-watermark">下書き / DRAFT</div>';
        html += '<h1>重要事項説明書（売買）</h1>';
        html += '<div class="subtitle">宅地建物取引業法 第35条 / 物件番号: ' + esc(prop.id || '－') + ' / 作成日: ' + new Date().toLocaleDateString('ja-JP') + '</div>';

        html += '<div class="legal-warn"><strong>下書きとしての位置づけ：</strong> 本書は MinaTech Realty Console によって自動生成された下書きであり、宅地建物取引業法第35条に基づく説明責任は本書をもって免除されません。実際の重要事項説明は、宅地建物取引士が対面又はIT重説により行い、本書面に取引士本人が記名押印（書面） / 電子署名（IT重説）した上で初めて法的効力を持ちます。記載内容の真正性・完全性は宅地建物取引士の最終確認義務に属します。</div>';

        // 1. 取引物件
        html += '<h2>1. 取引対象物件</h2>';
        html += '<table>';
        html += '<tr><th>物件名称</th><td>' + esc(title) + '</td></tr>';
        html += '<tr><th>所在地</th><td>' + esc(addr) + '</td></tr>';
        if (isCondo) {
            html += '<tr><th>専有面積</th><td>' + fmt(totalArea) + ' ㎡（壁芯 / 登記簿表示 確認要）</td></tr>';
            html += '<tr><th>所在階 / 階建</th><td>' + esc(prop['所在階'] || '-') + '</td></tr>';
            html += '<tr><th>バルコニー面積</th><td>' + esc(prop['バルコニー面積'] || '-') + '</td></tr>';
        } else if (isHouse) {
            html += '<tr><th>建物面積</th><td>' + fmt(totalArea) + ' ㎡（登記簿確認要）</td></tr>';
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿確認要）</td></tr>';
        } else if (isLand) {
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿確認要）</td></tr>';
        }
        html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
        html += '<tr><th>築年月</th><td>' + esc(builtAt) + '（耐震基準：' + esc(shintai) + '）</td></tr>';
        html += '</table>';

        // 2. 登記簿に記載された事項
        html += '<h2>2. 登記簿に記載された事項</h2>';
        html += '<table>';
        html += '<tr><th>所有者</th><td>' + esc(special.owner || '※登記簿謄本を取得し記載してください') + '</td></tr>';
        html += '<tr><th>所有権以外の権利</th><td>' + esc(special.otherRights || '※抵当権・地役権・賃借権等の有無を登記簿で確認') + '</td></tr>';
        html += '<tr><th>差押・仮処分</th><td>' + esc(special.attachment || '※登記簿で確認') + '</td></tr>';
        html += '<tr><th>抵当権抹消の見込み</th><td>' + esc(special.mortgageRelease || '※引渡し前に抹消予定の場合は記載') + '</td></tr>';
        html += '</table>';

        // 3. 法令上の制限
        html += '<h2>3. 法令に基づく制限の概要</h2>';
        html += '<table>';
        html += '<tr><th>都市計画区分</th><td>' + esc(prop['都市計画区分'] || '※市区町村役場で確認') + '</td></tr>';
        html += '<tr><th>用途地域</th><td>' + esc(youto) + '</td></tr>';
        html += '<tr><th>建蔽率 / 容積率</th><td>' + esc(kenpei) + ' / ' + esc(youseki) + '</td></tr>';
        html += '<tr><th>防火地域</th><td>' + esc(prop['防火地域'] || '※都市計画図で確認') + '</td></tr>';
        html += '<tr><th>その他法令制限</th><td>' + esc(special.otherRestrictions || '※宅地造成等規制法、急傾斜地、農地法、文化財保護法等の該当有無を要確認') + '</td></tr>';
        html += '</table>';

        // 4. 私道負担
        html += '<h2>4. 私道に関する負担</h2>';
        html += '<table>';
        html += '<tr><th>私道負担の有無</th><td>' + esc(special.privateRoad || '<span class="check">[ ] 有  [ ] 無  [ ] 不明</span>') + '</td></tr>';
        html += '<tr><th>負担割合・面積</th><td>' + esc(special.privateRoadShare || '※有の場合、持分割合・対象面積を記載') + '</td></tr>';
        html += '<tr><th>復元義務・通行掘削同意</th><td>' + esc(special.privateRoadConsent || '※近隣との取り決めを確認') + '</td></tr>';
        html += '</table>';

        // 5. 設備（インフラ）
        html += '<h2>5. 飲用水・電気・ガスの供給及び排水のための施設の整備状況</h2>';
        html += '<table>';
        html += '<tr><th>飲用水</th><td>' + esc(special.water || '<span class="check">[ ] 公営  [ ] 私営  [ ] 井戸  本管 / 引込み: ___mm</span>') + '</td></tr>';
        html += '<tr><th>下水</th><td>' + esc(special.sewage || '<span class="check">[ ] 公共下水  [ ] 浄化槽（人槽: ___）  [ ] 汲取り</span>') + '</td></tr>';
        html += '<tr><th>電気</th><td>' + esc(special.electricity || '東京電力 / その他 ___') + '</td></tr>';
        html += '<tr><th>ガス</th><td>' + esc(special.gas || '<span class="check">[ ] 都市ガス  [ ] プロパン  [ ] 未整備</span>') + '</td></tr>';
        html += '</table>';

        // 6. 区分マンション特有事項
        if (isCondo) {
            html += '<h2>6. 区分所有建物に関する事項</h2>';
            html += '<table>';
            html += '<tr><th>専有部分の用途制限</th><td>' + esc(special.condoUsage || '※管理規約で確認（住居専用、ペット可否等）') + '</td></tr>';
            html += '<tr><th>共用部分に関する規約</th><td>' + esc(special.condoCommon || '※管理規約で確認（バルコニー使用、ベランダ規定等）') + '</td></tr>';
            html += '<tr><th>管理費</th><td>' + esc(prop['管理費'] || '※月額記載') + '</td></tr>';
            html += '<tr><th>修繕積立金</th><td>' + esc(prop['修繕積立金'] || '※月額記載') + '</td></tr>';
            html += '<tr><th>修繕積立基金（一時金）</th><td>' + esc(prop['修繕積立基金'] || '※購入時一時金の有無') + '</td></tr>';
            html += '<tr><th>滞納額</th><td>' + esc(special.condoArrears || '※有の場合、買主負担となるか売主精算か明記') + '</td></tr>';
            html += '<tr><th>管理形態</th><td>' + esc(special.condoMgmt || '※全部委託 / 一部委託 / 自主管理') + '</td></tr>';
            html += '<tr><th>管理会社</th><td>' + esc(special.condoMgmtCo || '※社名・連絡先') + '</td></tr>';
            html += '<tr><th>修繕計画・大規模修繕履歴</th><td>' + esc(special.condoRepairPlan || '※長期修繕計画書を確認') + '</td></tr>';
            html += '</table>';
        }

        // 7. ハザード・耐震・既存不適格
        html += '<h2>' + (isCondo ? '7' : '6') + '. 災害警戒区域・耐震・既存不適格</h2>';
        html += '<table>';
        html += '<tr><th>津波災害警戒区域</th><td>' + (hzT !== undefined ? hzLevel(hzT) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>洪水浸水想定区域</th><td>' + (hzF !== undefined ? hzLevel(hzF) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>土砂災害警戒区域</th><td>' + (hzL !== undefined ? hzLevel(hzL) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>耐震診断の有無</th><td>' + esc(special.shintaiTest || '<span class="check">[ ] 実施済  [ ] 未実施</span>') + '</td></tr>';
        html += '<tr><th>石綿（アスベスト）使用調査</th><td>' + esc(special.asbestos || '<span class="check">[ ] 調査結果あり  [ ] 調査未実施</span>') + '</td></tr>';
        html += '<tr><th>既存不適格・違反建築</th><td>' + esc(special.nonConforming || '※建ぺい率・容積率超過、用途違反の有無を確認') + '</td></tr>';
        html += '</table>';

        // 8. 取引条件
        html += '<h2>' + (isCondo ? '8' : '7') + '. 取引条件</h2>';
        html += '<table>';
        html += '<tr><th>売買代金</th><td>' + fmt(price) + ' 万円（消費税 別途／込み 要明記）</td></tr>';
        html += '<tr><th>手付金</th><td>' + esc(contract.deposit || '※売買代金の5〜10%が目安') + '</td></tr>';
        html += '<tr><th>残代金支払期日</th><td>' + esc(contract.paymentDate || '※契約日から1〜3ヶ月以内が一般的') + '</td></tr>';
        html += '<tr><th>物件引渡期日</th><td>' + esc(contract.deliveryDate || '※残代金支払と同時が原則') + '</td></tr>';
        html += '<tr><th>ローン特約</th><td>' + esc(contract.loanCondition || '<span class="check">[ ] 有（融資金額___万円、融資承認期日___）  [ ] 無</span>') + '</td></tr>';
        html += '<tr><th>固定資産税等の精算</th><td>' + esc(contract.taxProration || '引渡日を基準に日割精算') + '</td></tr>';
        html += '</table>';

        // 9. 契約解除
        html += '<h2>' + (isCondo ? '9' : '8') + '. 契約の解除に関する事項</h2>';
        html += '<table>';
        html += '<tr><th>手付解除</th><td>' + esc(special.handDeposit || '相手方が契約履行に着手する前まで、買主は手付放棄、売主は手付倍返しで解除可能（民法557条）') + '</td></tr>';
        html += '<tr><th>契約違反による解除</th><td>' + esc(special.breachClause || '相当の期間を定めて履行を催告し、その期間内に履行されないとき、相手方は契約を解除できる（民法541条）') + '</td></tr>';
        html += '<tr><th>ローン特約解除</th><td>' + esc(special.loanCancelClause || 'ローン承認が得られない場合、買主は無条件で契約解除可能（手付金返還）') + '</td></tr>';
        html += '<tr><th>反社会的勢力排除条項</th><td>反社会的勢力に該当する場合、相手方は無催告で契約解除可能</td></tr>';
        html += '</table>';

        // 10. 損害賠償・違約金
        html += '<h2>' + (isCondo ? '10' : '9') + '. 損害賠償の予定又は違約金</h2>';
        html += '<table>';
        html += '<tr><th>違約金の額</th><td>' + esc(special.penalty || '売買代金の20%（業界慣行）') + '</td></tr>';
        html += '</table>';

        // 11. 手付金等の保全
        html += '<h2>' + (isCondo ? '11' : '10') + '. 手付金等の保全措置</h2>';
        html += '<table>';
        html += '<tr><th>保全措置の要否</th><td>' + esc(special.depositProtection || '※宅建業者が売主の場合、手付金が代金の5%超または1,000万円超で保全措置義務（宅建業法41条）') + '</td></tr>';
        html += '</table>';

        // 12. 特約事項
        html += '<h2>' + (isCondo ? '12' : '11') + '. 特約事項</h2>';
        html += '<table>';
        html += '<tr><th>残置物の取り扱い</th><td>' + esc(special.leftovers || '※エアコン、照明器具、カーテン等の残置／撤去を明記') + '</td></tr>';
        html += '<tr><th>契約不適合責任</th><td>' + esc(special.warranty || '※引渡後の瑕疵対応期間（3ヶ月／半年等）を明記') + '</td></tr>';
        html += '<tr><th>その他特約</th><td>' + esc(special.otherSpecial || '') + '</td></tr>';
        html += '</table>';

        // IT重説対応情報
        if (it.enabled) {
            html += '<div class="it-disclosure-block">';
            html += '<h3>IT重要事項説明 実施情報</h3>';
            html += '<table>';
            html += '<tr><th>説明日時</th><td>' + esc(it.datetime || '※年月日 時刻を記載') + '</td></tr>';
            html += '<tr><th>使用ソフトウェア</th><td>' + esc(it.software || 'Zoom / Google Meet / Microsoft Teams 等') + '</td></tr>';
            html += '<tr><th>ビデオ通話URL</th><td style="word-break:break-all;">' + esc(it.meetingUrl || '') + '</td></tr>';
            html += '<tr><th>録画の有無</th><td>' + esc(it.recording || '※録画する場合、買主の同意取得を別途記録') + '</td></tr>';
            html += '<tr><th>本人確認方法</th><td>運転免許証等の身分証明書を画面越しに提示確認</td></tr>';
            html += '</table>';
            html += '<div class="note">IT重説は国土交通省「ITを活用した重要事項説明に係るマニュアル」に従い、説明開始前の通信状態確認、本人確認、書面到達確認を実施してください。</div>';
            html += '</div>';
        }

        // 署名欄
        html += '<div class="signature-area">';
        html += '<h2 style="margin:0 0 8px;">宅地建物取引士の記名押印</h2>';
        html += '<div class="signature-row">';
        html += '<div class="signature-box">';
        html += '<div>取引士氏名：' + esc(broker.agentName || '') + '</div>';
        html += '<div>登録番号：' + esc(broker.agentLicense || '') + '</div>';
        html += '<div style="margin-top:30px;text-align:right;">印</div>';
        html += '</div>';
        html += '<div class="signature-box">';
        html += '<div>宅建業者：' + esc(broker.name || '') + '</div>';
        html += '<div>免許番号：' + esc(broker.license || '') + '</div>';
        html += '<div>住所：' + esc(broker.address || '') + '</div>';
        html += '<div>TEL：' + esc(broker.tel || '') + '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        html += '<div class="note" style="margin-top:20px;">本書はMinaTech Realty Console v' + (window.RC_VERSION || '20260518') + ' で自動生成された下書きです。最終的な記載内容・事実確認・取引士の説明責任は宅地建物取引業法に基づき宅建業者本人にあります。</div>';

        html += '</div>';
        return css + html;
    }

    // PDF出力
    function exportPDF(prop, opts) {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            throw new Error('PDFライブラリ未読込（jsPDF + html2canvas が必要）');
        }
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
            pdf.save('重説下書き_' + name + '_' + new Date().toISOString().slice(0,10) + '.pdf');
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
