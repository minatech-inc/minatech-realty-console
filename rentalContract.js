/**
 * 賃貸借契約書 下書きジェネレータ
 *
 * 重説（disclosure.js 賃貸版）と同じデータを共有し、二重入力を排除する。
 *
 * 対応書式（3種 × 普通/定期借家）:
 *   rent_residential   住宅用建物賃貸借契約書
 *   rent_commercial    事業用建物賃貸借契約書
 *   rent_landhouse     土地建物賃貸借契約書（土地のみ含む）
 *
 * 借地借家法に準拠。普通借家（民法+借地借家法第26条以下）と
 * 定期借家（借地借家法第38条）で構成を切替。
 *
 * 重要な免責: 本書は下書きであり、最終的な契約締結には宅地建物取引業者・
 * 弁護士の最終確認、当事者の記名押印が必要です。
 */
var RentalContract = (function() {
    'use strict';

    var FORMATS = {
        'rent_residential': { asset:'residential', label:'住宅用建物賃貸借契約書' },
        'rent_commercial':  { asset:'commercial',  label:'事業用建物賃貸借契約書' },
        'rent_landhouse':   { asset:'landhouse',   label:'土地建物賃貸借契約書' }
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
     * @param {Object} prop - 物件データ
     * @param {Object} opts -
     *   formatKey: 'rent_residential' 等
     *   contractType: 'normal'（普通借家） | 'fixed'（定期借家）
     *   landlord: { name, address, tel }
     *   tenant:   { name, address, tel, dob, occupation, employer }
     *   guarantor: { name, address, tel, relation } または 保証会社
     *   broker: 業者情報
     *   contract: { rent, commonFee, deposit, keyMoney, renewalFee, termStart, termEnd, paymentDay }
     *   special: 特約
     */
    function buildHTML(prop, opts) {
        opts = opts || {};
        var formatKey = opts.formatKey || 'rent_residential';
        var fmtDef = FORMATS[formatKey] || FORMATS.rent_residential;
        var contractType = opts.contractType || 'normal'; // 'normal' or 'fixed'
        var isFixed = (contractType === 'fixed');
        var landlord = opts.landlord || {};
        var tenant = opts.tenant || {};
        var guarantor = opts.guarantor || {};
        var broker = opts.broker || {};
        var contract = opts.contract || {};
        var special = opts.special || {};

        var isCommercial = (fmtDef.asset === 'commercial');
        var isLandHouse = (fmtDef.asset === 'landhouse');

        var title = prop['物件名'] || '(物件名未記載)';
        var addr = prop['所在地'] || '-';
        var totalArea = prop['建物面積(㎡)'] || prop['面積(㎡)'] || prop['専有面積'] || '-';
        var structure = prop['構造'] || prop['建物構造'] || '-';

        var rentYen = parseInt(String(contract.rent || '').replace(/[^\d]/g, '')) || 0;
        var commonFeeYen = parseInt(String(contract.commonFee || '').replace(/[^\d]/g, '')) || 0;
        var depositMonths = parseInt(String(contract.depositMonths || '').replace(/[^\d]/g, '')) || 0;
        var keyMoneyMonths = parseInt(String(contract.keyMoneyMonths || '').replace(/[^\d]/g, '')) || 0;

        var docTitle = fmtDef.label + (isFixed ? '（定期借家）' : '');

        var css = renderCSS();
        var html = '<div class="rental-contract">';
        html += '<div class="draft-watermark">下書き / DRAFT</div>';
        html += '<h1>' + esc(docTitle) + '</h1>';
        html += '<div class="subtitle">作成日: ' + new Date().toLocaleDateString('ja-JP') + ' / 物件番号: ' + esc(prop.id || '－') + '</div>';

        html += '<div class="legal-warn"><strong>本書は下書きです。</strong> 実際の契約締結には、宅地建物取引業者・弁護士による最終確認、当事者の記名押印が必要です。' + (isFixed ? '<br>定期借家契約は<u>公正証書等の書面または電磁的記録による契約</u>が借地借家法第38条で必須です。本下書きを使用される場合、公証役場での公正証書化または電磁的記録要件を満たした上で締結してください。' : '') + '</div>';

        // 前文
        html += '<div class="preamble">';
        html += '賃貸人 ' + esc(landlord.name || '＿＿＿＿＿') + '（以下「甲」という）と、賃借人 ' + esc(tenant.name || '＿＿＿＿＿') + '（以下「乙」という）は、後記表示の物件（以下「本物件」という）について、次の条項により' + (isFixed ? '定期建物賃貸借' : '建物賃貸借') + '契約を締結する。';
        html += '</div>';

        // 物件表示
        html += '<h2>物件の表示</h2>';
        html += '<table>';
        html += '<tr><th>物件名称</th><td>' + esc(title) + '</td></tr>';
        html += '<tr><th>所在地</th><td>' + esc(addr) + '</td></tr>';
        if (!isLandHouse) {
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>専有/賃貸面積</th><td>' + fmt(totalArea) + ' ㎡</td></tr>';
            html += '<tr><th>所在階</th><td>' + esc(prop['所在階'] || '-') + '</td></tr>';
        } else {
            html += '<tr><th>土地面積</th><td>' + fmt(prop['土地面積(㎡)'] || '-') + ' ㎡</td></tr>';
            html += '<tr><th>建物面積（建物がある場合）</th><td>' + fmt(totalArea) + ' ㎡</td></tr>';
        }
        html += '<tr><th>使用目的</th><td>' + esc(special.usagePurpose || (isCommercial ? '事業用（具体的用途：＿＿＿＿）' : '居住用')) + '</td></tr>';
        html += '</table>';

        // 第1条 契約期間
        html += '<h2>第1条（契約期間）</h2>';
        if (isFixed) {
            html += '<p>本契約の期間は、' + esc(contract.termStart || '＿年＿月＿日') + 'から' + esc(contract.termEnd || '＿年＿月＿日') + 'まで（' + esc(contract.termYears || '＿') + '年間）の確定期間とし、本契約は借地借家法第38条に基づく定期建物賃貸借契約とする。本契約は更新がなく、期間満了により終了する。</p>';
            html += '<p>甲は乙に対し、本契約の締結前に、本契約が定期建物賃貸借契約であって更新がない旨を記載した書面（契約期間満了により終了することの説明書）を交付し、当該書面に基づき口頭にて説明した。乙は説明を受けた上で、本契約を締結することに同意する。</p>';
        } else {
            html += '<p>本契約の期間は、' + esc(contract.termStart || '＿年＿月＿日') + 'から' + esc(contract.termEnd || '＿年＿月＿日') + 'まで（' + esc(contract.termYears || '2') + '年間）とする。本契約は借地借家法に基づく普通建物賃貸借契約であり、期間満了時に当事者の合意により更新できる。</p>';
        }

        // 第2条 賃料
        html += '<h2>第2条（賃料）</h2>';
        html += '<p>本物件の賃料は月額 金 ' + fmt(rentYen) + ' 円（消費税' + esc(special.taxIncluded || '別途／込み') + '）とし、乙は甲に対し、毎月 ' + esc(contract.paymentDay || '末') + ' 日までに翌月分の賃料を、甲の指定する銀行口座に振り込んで支払う。振込手数料は乙の負担とする。</p>';
        if (commonFeeYen > 0) {
            html += '<p>共益費（管理費）は月額 金 ' + fmt(commonFeeYen) + ' 円とし、賃料と同様の方法で支払う。</p>';
        }

        // 第3条 敷金
        html += '<h2>第3条（敷金）</h2>';
        var depositYen = depositMonths * rentYen;
        html += '<p>乙は甲に対し、本契約締結時に敷金として 金 ' + fmt(depositYen) + ' 円（賃料の' + depositMonths + 'ヶ月分相当）を預託する。敷金は本契約終了時、乙が本物件を原状回復して甲に明け渡したときに、乙の債務（未払賃料、原状回復費用等）を控除したうえで返還される。敷金には利息を付さない。</p>';

        // 第4条 礼金
        if (keyMoneyMonths > 0) {
            html += '<h2>第4条（礼金）</h2>';
            var keyMoneyYen = keyMoneyMonths * rentYen;
            html += '<p>乙は甲に対し、本契約締結時に礼金として 金 ' + fmt(keyMoneyYen) + ' 円（賃料の' + keyMoneyMonths + 'ヶ月分相当）を支払う。礼金は本契約終了時に返還しない。</p>';
        }

        // 更新料・契約更新
        var sectNext = keyMoneyMonths > 0 ? 5 : 4;
        if (!isFixed) {
            html += '<h2>第' + sectNext + '条（契約更新）</h2>';
            html += '<p>本契約の更新については、借地借家法の定めるところによる。当事者が更新を合意するときは、乙は甲に対し更新料として 金 ' + esc(contract.renewalFee || '＿') + ' 円（賃料の' + esc(contract.renewalFeeMonths || '1') + 'ヶ月分相当）を支払う。なお、更新事務手数料として ' + esc(contract.renewalAdminFee || '＿') + ' 円を、媒介業者または管理会社に支払う場合がある。</p>';
            sectNext++;
        }

        // 用途
        html += '<h2>第' + sectNext + '条（使用目的）</h2>';
        if (isCommercial) {
            html += '<p>乙は本物件を ' + esc(special.usagePurpose || '【具体的事業用途】') + ' の用に供するものとし、甲の書面による事前承諾なくして用途を変更してはならない。</p>';
        } else {
            html += '<p>乙は本物件を居住の用に供するものとし、それ以外の用途に使用してはならない。乙は本物件を、自己および乙と同居する家族のために使用するものとし、転貸または賃借権の譲渡をしてはならない。</p>';
        }
        sectNext++;

        // 禁止事項
        html += '<h2>第' + sectNext + '条（禁止事項）</h2>';
        html += '<p>乙は次の行為をしてはならない。甲の書面による事前承諾を得ない限り：</p>';
        html += '<ol>';
        html += '<li>本物件の全部または一部の転貸、賃借権の譲渡または担保提供</li>';
        html += '<li>本物件の改造、増築、模様替え、内装変更</li>';
        if (!isCommercial) {
            html += '<li>' + esc(special.petRule || 'ペット（犬・猫等の動物）の飼育') + '</li>';
            html += '<li>' + esc(special.musicRule || '楽器の演奏（電子楽器を含む）') + '</li>';
        }
        if (isCommercial) {
            html += '<li>看板・サイン・広告物の外壁または共用部への設置（' + esc(special.signageRule || '事前協議の上、書面承諾必須') + '）</li>';
        }
        html += '<li>本物件における危険物・引火物・悪臭発生物の保管</li>';
        html += '<li>近隣に著しい迷惑を及ぼす行為</li>';
        html += '<li>反社会的勢力との関係維持または反社会的勢力による本物件使用</li>';
        html += '</ol>';
        sectNext++;

        // 修繕
        html += '<h2>第' + sectNext + '条（修繕）</h2>';
        html += '<p>本物件の使用に必要な修繕は甲の負担とする。ただし、乙の故意または過失による損傷、消耗品の交換（電球・パッキン・カートリッジ等の軽微なもの）、および乙の責による設備故障については、乙の負担とする。乙は修繕の必要を生じたときは速やかに甲に通知する。</p>';
        sectNext++;

        // 原状回復
        html += '<h2>第' + sectNext + '条（原状回復）</h2>';
        html += '<p>乙は本契約終了時、本物件を契約締結時の原状に復して甲に明け渡す。原状回復の範囲は、' + (isCommercial ? '事業用建物のため、内装・設備の撤去を含めて乙の負担で原状回復を行う' : '国土交通省「原状回復をめぐるトラブルとガイドライン」に準拠し、通常損耗および経年変化は甲の負担とし、乙の故意・過失・善管注意義務違反による損耗のみ乙の負担') + 'とする。具体的な負担区分は別紙（' + esc(special.restorationSchedule || '原状回復負担区分表') + '）による。</p>';
        sectNext++;

        // 連帯保証人/保証会社
        html += '<h2>第' + sectNext + '条（連帯保証人・保証会社）</h2>';
        if (guarantor.useCompany) {
            html += '<p>乙は本契約から生じる賃料その他一切の債務について、家賃保証会社 ' + esc(guarantor.companyName || '＿＿＿＿') + ' との保証委託契約を締結する。乙は当該保証会社に対し、別途定める保証委託料を支払う。</p>';
        } else {
            html += '<p>連帯保証人 ' + esc(guarantor.name || '＿＿＿＿') + '（以下「丙」という）は、乙が本契約から生じる賃料その他一切の債務について、乙と連帯して履行の責を負う。連帯保証の極度額は 金 ' + esc(guarantor.maxAmount || (rentYen * 24)) + ' 円とする（民法第465条の2に基づく極度額の定め）。</p>';
        }
        sectNext++;

        // 解約
        html += '<h2>第' + sectNext + '条（解約）</h2>';
        if (isFixed) {
            html += '<p>本契約は期間満了により終了し、原則として中途解約することができない。ただし、乙が転勤・療養・親族の介護等やむを得ない事情により本物件を使用することが困難となったときは、解約申入れの日から1ヶ月の経過により本契約を解約することができる（借地借家法第38条第7項）。</p>';
            html += '<p>甲は、契約期間満了の1年前から6ヶ月前までの間に、乙に対し期間満了により本契約が終了する旨を通知する（同条第6項）。</p>';
        } else {
            html += '<p>乙は、本契約期間中といえども、甲に対し ' + esc(contract.noticeMonths || '1ヶ月') + ' 前までに書面により予告することにより、本契約を解約することができる。</p>';
            html += '<p>甲は、借地借家法第28条に基づき、正当事由がある場合に限り、6ヶ月前までに書面により乙に通知することにより本契約を解約することができる。</p>';
        }
        sectNext++;

        // 契約解除
        html += '<h2>第' + sectNext + '条（契約違反による解除）</h2>';
        html += '<p>乙が次の各号のいずれかに該当したときは、甲は催告なくして本契約を解除することができる。</p>';
        html += '<ol>';
        html += '<li>賃料、共益費を' + esc(special.arrearsMonths || '2ヶ月分以上') + '滞納したとき</li>';
        html += '<li>第' + (sectNext - 4) + '条の禁止事項に違反したとき</li>';
        html += '<li>乙または乙の関係者が反社会的勢力に該当することが判明したとき</li>';
        html += '<li>乙が本契約に違反し、相当の催告にもかかわらず是正されないとき</li>';
        html += '<li>乙の信用状態が著しく悪化したとき</li>';
        html += '</ol>';
        sectNext++;

        // 反社条項
        html += '<h2>第' + sectNext + '条（反社会的勢力の排除）</h2>';
        html += '<p>甲、乙および連帯保証人は、自己および自己の役員・関係者が反社会的勢力に該当しないこと、本契約締結後も該当しないことを表明し保証する。違反が判明した場合、相手方は無催告で本契約を解除することができ、解除された当事者は何らの請求もできず、相手方の損害を賠償する責を負う。</p>';
        sectNext++;

        // 特約事項
        html += '<h2>第' + sectNext + '条（特約事項）</h2>';
        html += '<ol>';
        if (isCommercial && special.signageDetail) html += '<li>看板等の設置について：' + esc(special.signageDetail) + '</li>';
        if (special.parkingArrangement) html += '<li>駐車場：' + esc(special.parkingArrangement) + '</li>';
        if (special.utilities) html += '<li>光熱費等：' + esc(special.utilities) + '</li>';
        if (special.insurance) html += '<li>火災保険：' + esc(special.insurance) + '</li>';
        else html += '<li>火災保険：乙は本物件について、本契約締結時に火災保険等の住宅総合保険に加入し、契約期間中継続して加入する。</li>';
        if (special.otherSpecial) html += '<li>その他：' + esc(special.otherSpecial) + '</li>';
        html += '<li>本契約に定めのない事項及び本契約条項の解釈について疑義が生じたときは、甲乙誠意をもって協議し解決する。</li>';
        html += '<li>本契約に関する紛争については、本物件所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。</li>';
        html += '</ol>';

        // 末尾
        html += '<div class="closing">';
        html += '<p>本契約締結の証として本契約書を' + (guarantor.useCompany ? '2' : '3') + '通作成し、甲乙' + (guarantor.useCompany ? '' : '丙') + '各1通を保有する。</p>';
        html += '<p style="text-align:right;">' + new Date().getFullYear() + '年　　月　　日</p>';
        html += '</div>';

        // 当事者署名
        html += '<div class="signature-area">';
        html += '<div class="signature-row">';
        html += '<div class="signature-box">';
        html += '<div style="font-weight:700;margin-bottom:6px;">賃貸人（甲）</div>';
        html += '<div>住所：' + esc(landlord.address || '＿＿＿＿＿') + '</div>';
        html += '<div style="margin-top:6px;">氏名：' + esc(landlord.name || '＿＿＿＿＿') + '<span style="margin-left:30px;">印</span></div>';
        html += '<div style="margin-top:6px;font-size:10px;color:#666;">TEL: ' + esc(landlord.tel || '') + '</div>';
        html += '</div>';
        html += '<div class="signature-box">';
        html += '<div style="font-weight:700;margin-bottom:6px;">賃借人（乙）</div>';
        html += '<div>住所：' + esc(tenant.address || '＿＿＿＿＿') + '</div>';
        html += '<div style="margin-top:6px;">氏名：' + esc(tenant.name || '＿＿＿＿＿') + '<span style="margin-left:30px;">印</span></div>';
        html += '<div style="margin-top:6px;font-size:10px;color:#666;">TEL: ' + esc(tenant.tel || '') + '</div>';
        if (tenant.dob) html += '<div style="font-size:10px;color:#666;">生年月日: ' + esc(tenant.dob) + '</div>';
        if (tenant.occupation) html += '<div style="font-size:10px;color:#666;">職業/勤務先: ' + esc(tenant.occupation) + ' / ' + esc(tenant.employer || '') + '</div>';
        html += '</div>';
        html += '</div>';

        // 連帯保証人/保証会社
        if (!guarantor.useCompany) {
            html += '<div class="signature-row" style="margin-top:14px;">';
            html += '<div class="signature-box">';
            html += '<div style="font-weight:700;margin-bottom:6px;">連帯保証人（丙）</div>';
            html += '<div>住所：' + esc(guarantor.address || '＿＿＿＿＿') + '</div>';
            html += '<div style="margin-top:6px;">氏名：' + esc(guarantor.name || '＿＿＿＿＿') + '<span style="margin-left:30px;">印</span></div>';
            html += '<div style="margin-top:6px;font-size:10px;color:#666;">TEL: ' + esc(guarantor.tel || '') + '</div>';
            html += '<div style="margin-top:6px;font-size:10px;color:#666;">乙との関係：' + esc(guarantor.relation || '') + '</div>';
            html += '</div>';
            html += '<div class="signature-box" style="background:#fafafa;">';
            html += '<div style="font-weight:700;margin-bottom:6px;">媒介業者</div>';
            html += '<div>商号：' + esc(broker.name || '') + '</div>';
            html += '<div>免許番号：' + esc(broker.license || '') + '</div>';
            html += '<div>住所：' + esc(broker.address || '') + '</div>';
            html += '<div>TEL：' + esc(broker.tel || '') + '</div>';
            html += '<div style="margin-top:6px;">宅地建物取引士：' + esc(broker.agentName || '') + '（登録番号 ' + esc(broker.agentLicense || '') + '）<span style="margin-left:14px;">印</span></div>';
            html += '</div>';
            html += '</div>';
        } else {
            // 保証会社利用時は媒介業者のみ
            html += '<div class="signature-row" style="margin-top:14px;">';
            html += '<div class="signature-box" style="background:#fafafa;">';
            html += '<div style="font-weight:700;margin-bottom:6px;">媒介業者</div>';
            html += '<div>商号：' + esc(broker.name || '') + '</div>';
            html += '<div>免許番号：' + esc(broker.license || '') + '</div>';
            html += '<div>住所：' + esc(broker.address || '') + '</div>';
            html += '<div>TEL：' + esc(broker.tel || '') + '</div>';
            html += '<div style="margin-top:6px;">宅地建物取引士：' + esc(broker.agentName || '') + '（登録番号 ' + esc(broker.agentLicense || '') + '）<span style="margin-left:14px;">印</span></div>';
            html += '<div style="margin-top:6px;font-size:10px;color:#666;">保証会社：' + esc(guarantor.companyName || '') + '</div>';
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';

        html += '<div class="note">本書は MinaTech Realty Console v' + (window.RC_VERSION || '20260518') + ' で自動生成された下書きです。重要事項説明書と内容の整合性を必ず確認してください。' + (isFixed ? '<br>定期借家契約には、契約期間満了により終了する旨を記載した事前説明書面の交付が必須です。' : '') + '</div>';
        html += '</div>';

        return css + html;
    }

    function renderCSS() {
        return '<style>' +
            '.rental-contract{font-family:"MS Mincho","Yu Mincho",serif;color:#000;max-width:780px;margin:0 auto;padding:24px;background:#fff;font-size:11px;line-height:1.85}' +
            '.rental-contract .draft-watermark{position:absolute;top:30px;right:30px;color:#dc2626;border:2px solid #dc2626;padding:4px 14px;font-weight:700;font-size:13px;transform:rotate(-8deg);opacity:0.6}' +
            '.rental-contract h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px;letter-spacing:0.1em}' +
            '.rental-contract .subtitle{text-align:center;font-size:10.5px;color:#444;margin-bottom:14px}' +
            '.rental-contract h2{font-size:12px;background:#e8e8e8;border-left:4px solid #333;padding:4px 8px;margin:14px 0 6px;page-break-after:avoid}' +
            '.rental-contract .preamble{padding:8px 0;border-bottom:1px solid #ccc;margin-bottom:10px}' +
            '.rental-contract p{margin:4px 0 8px;text-indent:1em}' +
            '.rental-contract table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10.5px}' +
            '.rental-contract th{background:#f5f5f5;border:1px solid #333;padding:5px 8px;text-align:left;font-weight:700;width:32%;vertical-align:top}' +
            '.rental-contract td{border:1px solid #333;padding:5px 8px;vertical-align:top}' +
            '.rental-contract ol{padding-left:24px;margin:6px 0 10px}' +
            '.rental-contract ol li{margin-bottom:4px}' +
            '.rental-contract .legal-warn{font-size:10px;color:#7f1d1d;background:#fef2f2;border:1px solid #dc2626;border-radius:4px;padding:8px 12px;margin:10px 0;line-height:1.6}' +
            '.rental-contract .closing{margin-top:14px;padding-top:10px;border-top:1px solid #ccc}' +
            '.rental-contract .signature-area{margin-top:16px}' +
            '.rental-contract .signature-row{display:flex;gap:14px;font-size:10.5px}' +
            '.rental-contract .signature-box{flex:1;border:1px solid #666;padding:10px;min-height:90px}' +
            '.rental-contract .note{font-size:9.5px;color:#666;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin-top:14px;line-height:1.6}' +
            '@media print {.rental-contract .draft-watermark{opacity:0.4}}' +
            '</style>';
    }

    function exportPDF(prop, opts) {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            throw new Error('PDFライブラリ未読込');
        }
        opts = opts || {};
        var formatKey = opts.formatKey || 'rent_residential';
        var fmtDef = FORMATS[formatKey] || FORMATS.rent_residential;
        var contractType = opts.contractType || 'normal';

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
            var fmtLabel = fmtDef.label.replace(/[（）()\/]/g, '_') + (contractType === 'fixed' ? '_定期借家' : '');
            pdf.save('賃貸借契約書下書き_' + fmtLabel + '_' + name + '_' + new Date().toISOString().slice(0,10) + '.pdf');
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
