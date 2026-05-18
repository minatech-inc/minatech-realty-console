/**
 * 重要事項説明書（重説）下書きジェネレータ - 9パターン対応版
 *
 * 宅地建物取引業法 第35条 / 第35条の3 に基づく重要事項説明書の下書きを HTML/PDF で生成。
 *
 * 対応書式（9種）:
 *   売買・交換:
 *     - 土地（個人売主） / 土地（宅建業者売主）
 *     - 土地建物（個人売主） / 土地建物（宅建業者売主）
 *     - 区分所有建物（個人売主） / 区分所有建物（宅建業者売主）
 *   賃貸:
 *     - 住宅用建物賃借
 *     - 事業用建物賃借
 *     - 土地建物賃借（土地のみ等）
 *
 * 重要な免責:
 *   本機能は下書き作成支援に限定。宅建業法上の説明責任は宅建士の対面/IT重説による説明と
 *   記名押印（書面）/電子署名（IT重説）で初めて発生。記載内容の真正性は宅建士の最終確認義務に属する。
 */
var Disclosure = (function() {
    'use strict';

    // 書式パターン定義
    var FORMATS = {
        // 売買 - 個人売主
        'sale_land':                { type:'sale',  asset:'land',     sellerBiz:false, label:'土地（売買・交換）' },
        'sale_landhouse':           { type:'sale',  asset:'landhouse',sellerBiz:false, label:'土地建物（売買・交換）' },
        'sale_condo':               { type:'sale',  asset:'condo',    sellerBiz:false, label:'区分所有建物（売買・交換）' },
        // 売買 - 宅建業者売主（第35条 + 第35条の3 / 業者間取引の追加条項）
        'sale_land_biz':            { type:'sale',  asset:'land',     sellerBiz:true,  label:'土地（売買・交換／宅建業者売主）' },
        'sale_landhouse_biz':       { type:'sale',  asset:'landhouse',sellerBiz:true,  label:'土地建物（売買・交換／宅建業者売主）' },
        'sale_condo_biz':           { type:'sale',  asset:'condo',    sellerBiz:true,  label:'区分所有建物（売買・交換／宅建業者売主）' },
        // 賃貸
        'rent_residential':         { type:'rent',  asset:'residential', sellerBiz:false, label:'住宅用建物（賃借）' },
        'rent_commercial':          { type:'rent',  asset:'commercial',  sellerBiz:false, label:'事業用建物（賃借）' },
        'rent_landhouse':           { type:'rent',  asset:'landhouse',   sellerBiz:false, label:'土地建物（賃借）' }
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
     * 重説下書きHTML生成
     * @param {Object} prop - 物件データ
     * @param {Object} opts - 追加情報
     *   formatKey: 'sale_condo' 等。未指定の場合は物件カテゴリから推定
     *   broker, itDisclosure, contract, special: 各種入力値
     */
    function buildHTML(prop, opts) {
        opts = opts || {};
        var broker = opts.broker || {};
        var it = opts.itDisclosure || {};
        var contract = opts.contract || {};
        var special = opts.special || {};
        var formatKey = opts.formatKey || inferFormatKey(prop);
        var fmtDef = FORMATS[formatKey] || FORMATS.sale_condo;

        var isSale = (fmtDef.type === 'sale');
        var isRent = (fmtDef.type === 'rent');
        var isCondo = (fmtDef.asset === 'condo');
        var isLand = (fmtDef.asset === 'land');
        var isLandHouse = (fmtDef.asset === 'landhouse');
        var isResidential = (fmtDef.asset === 'residential');
        var isCommercial = (fmtDef.asset === 'commercial');
        var isSellerBiz = !!fmtDef.sellerBiz;

        var title = prop['物件名'] || '(物件名未記載)';
        var addr = prop['所在地'] || prop['address'] || '-';
        var price = parseFloat(prop['価格(万円)'] || prop['価格']) || 0;
        var rent = parseFloat(prop['賃料(円/月)'] || prop['賃料']) || 0;
        var totalArea = prop['建物面積(㎡)'] || prop['面積(㎡)'] || prop['専有面積'] || '-';
        var landArea = prop['土地面積(㎡)'] || '-';
        var structure = prop['構造'] || prop['建物構造'] || '-';
        var builtAt = prop['築年月'] || prop['築年'] || '-';
        var youto = prop['用途地域'] || '-';
        var kenpei = prop['建蔽率'] || '-';
        var youseki = prop['容積率'] || '-';
        var hzT = prop['ハザード津波'], hzF = prop['ハザード洪水'], hzL = prop['ハザード土砂'];
        var hzLevel = function(v) { return ['低','中','高'][v] || '-'; };
        var ageNum = parseInt(prop['築年数']);
        var builtYear = !isNaN(ageNum) ? (new Date().getFullYear() - ageNum) : null;
        var shintai = builtYear ? (builtYear >= 1981 ? '新耐震基準（昭和56年6月以降）' : '旧耐震基準（昭和56年5月以前）') : '-';

        var css = renderCSS();
        var html = '<div class="disclosure">';
        html += '<div class="draft-watermark">下書き / DRAFT</div>';

        // タイトル
        var docTitle = '重要事項説明書（' + fmtDef.label + '）';
        html += '<h1>' + esc(docTitle) + '</h1>';
        html += '<div class="subtitle">宅地建物取引業法 第35条' + (isSellerBiz ? '・第35条の3' : '') + ' / 物件番号: ' + esc(prop.id || '－') + ' / 作成日: ' + new Date().toLocaleDateString('ja-JP') + '</div>';

        // 法的免責
        html += '<div class="legal-warn"><strong>下書きとしての位置づけ：</strong> 本書は MinaTech Realty Console により自動生成された下書きです。宅地建物取引業法第35条に基づく説明責任は本書をもって免除されません。実際の重要事項説明は宅地建物取引士が対面又はIT重説により行い、本書面に記名押印（書面）／電子署名（IT重説）した上で初めて法的効力を持ちます。記載内容の真正性・完全性は宅地建物取引士の最終確認義務に属します。</div>';

        // ===== 1. 取引対象物件 =====
        html += '<h2>1. 取引対象物件</h2>';
        html += '<table>';
        html += '<tr><th>物件名称</th><td>' + esc(title) + '</td></tr>';
        html += '<tr><th>所在地</th><td>' + esc(addr) + '</td></tr>';
        if (isCondo) {
            html += '<tr><th>建物の名称</th><td>' + esc(prop['建物名称'] || title) + '</td></tr>';
            html += '<tr><th>専有部分の番号</th><td>' + esc(prop['部屋番号'] || '-') + '</td></tr>';
            html += '<tr><th>専有面積</th><td>' + fmt(totalArea) + ' ㎡（壁芯 / 登記簿表示 確認要）</td></tr>';
            html += '<tr><th>所在階 / 階建</th><td>' + esc(prop['所在階'] || '-') + '</td></tr>';
            html += '<tr><th>バルコニー面積</th><td>' + esc(prop['バルコニー面積'] || '-') + '</td></tr>';
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>築年月</th><td>' + esc(builtAt) + '（' + esc(shintai) + '）</td></tr>';
        } else if (isLandHouse) {
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿確認要）</td></tr>';
            html += '<tr><th>建物面積</th><td>' + fmt(totalArea) + ' ㎡（登記簿確認要）</td></tr>';
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>築年月</th><td>' + esc(builtAt) + '（' + esc(shintai) + '）</td></tr>';
        } else if (isLand) {
            html += '<tr><th>土地面積</th><td>' + fmt(landArea) + ' ㎡（登記簿確認要）</td></tr>';
            html += '<tr><th>地目</th><td>' + esc(prop['地目'] || '※登記簿で確認') + '</td></tr>';
            html += '<tr><th>境界明示</th><td>' + esc(special.boundary || '※境界確定済か未確定か明記') + '</td></tr>';
        } else if (isResidential || isCommercial) {
            html += '<tr><th>専有/賃貸面積</th><td>' + fmt(totalArea) + ' ㎡</td></tr>';
            html += '<tr><th>建物構造</th><td>' + esc(structure) + '</td></tr>';
            html += '<tr><th>築年月</th><td>' + esc(builtAt) + '（' + esc(shintai) + '）</td></tr>';
            html += '<tr><th>用途</th><td>' + (isCommercial ? '事業用' : '居住用') + '</td></tr>';
        }
        html += '</table>';

        // ===== 2. 登記事項 =====
        html += '<h2>2. 登記簿に記載された事項</h2>';
        html += '<table>';
        html += '<tr><th>所有者</th><td>' + esc(special.owner || '※登記簿謄本（甲区）を取得し記載') + '</td></tr>';
        if (isSale) {
            html += '<tr><th>所有権以外の権利</th><td>' + esc(special.otherRights || '※抵当権・根抵当権・地役権・賃借権・配偶者居住権の有無を乙区で確認') + '</td></tr>';
            html += '<tr><th>差押・仮処分</th><td>' + esc(special.attachment || '※登記簿で確認') + '</td></tr>';
            html += '<tr><th>抵当権抹消の見込み</th><td>' + esc(special.mortgageRelease || '※引渡前に抹消予定の場合は記載') + '</td></tr>';
        } else if (isRent) {
            html += '<tr><th>所有権以外の権利</th><td>' + esc(special.otherRights || '※登記簿上の所有権以外の権利（賃借人にとっての対抗可能性）を確認') + '</td></tr>';
            html += '<tr><th>賃貸借契約の権利関係</th><td>' + esc(special.tenancyRights || '※借地借家法上の保護内容を明記') + '</td></tr>';
        }
        html += '</table>';

        // ===== 3. 法令上の制限 =====
        html += '<h2>3. 法令に基づく制限の概要</h2>';
        html += '<table>';
        html += '<tr><th>都市計画区分</th><td>' + esc(prop['都市計画区分'] || '※市区町村役場で確認') + '</td></tr>';
        html += '<tr><th>用途地域</th><td>' + esc(youto) + '</td></tr>';
        if (!isCondo) {
            html += '<tr><th>建蔽率 / 容積率</th><td>' + esc(kenpei) + ' / ' + esc(youseki) + '</td></tr>';
            html += '<tr><th>防火地域 / 準防火地域</th><td>' + esc(prop['防火地域'] || '※都市計画図で確認') + '</td></tr>';
            html += '<tr><th>高度地区・風致地区</th><td>' + esc(special.heightDistrict || '※都市計画図で確認') + '</td></tr>';
        }
        if (isLand || isLandHouse) {
            html += '<tr><th>宅地造成等規制法</th><td>' + esc(special.landGrading || '※造成工事規制区域該当の有無を要確認') + '</td></tr>';
            html += '<tr><th>急傾斜地崩壊危険区域</th><td>' + esc(special.steepSlope || '※指定の有無を確認') + '</td></tr>';
            html += '<tr><th>農地法・森林法</th><td>' + esc(special.agriRestrictions || '※該当する場合は転用許可要') + '</td></tr>';
        }
        if (isCondo) {
            html += '<tr><th>区分所有建物特有の制限</th><td>' + esc(special.condoRestrictions || '※管理規約・使用細則による用途・ペット等の制限を確認') + '</td></tr>';
        }
        html += '<tr><th>その他法令制限</th><td>' + esc(special.otherRestrictions || '※文化財保護法、土壌汚染対策法等、該当有無を要確認') + '</td></tr>';
        html += '</table>';

        // ===== 4. 私道負担 =====
        if (!isCondo) {  // 区分所有では原則なし
            html += '<h2>4. 私道に関する負担</h2>';
            html += '<table>';
            html += '<tr><th>私道負担の有無</th><td>' + esc(special.privateRoad || '<span class="check">[ ] 有  [ ] 無  [ ] 不明</span>') + '</td></tr>';
            html += '<tr><th>負担割合・面積</th><td>' + esc(special.privateRoadShare || '※有の場合、持分割合・対象面積を記載') + '</td></tr>';
            html += '<tr><th>復元義務・通行掘削同意</th><td>' + esc(special.privateRoadConsent || '※近隣との取り決めを確認') + '</td></tr>';
            html += '</table>';
        }

        // ===== 5. インフラ =====
        var sectInfra = isCondo ? 4 : 5;
        html += '<h2>' + sectInfra + '. 飲用水・電気・ガスの供給及び排水のための施設の整備状況</h2>';
        html += '<table>';
        html += '<tr><th>飲用水</th><td>' + esc(special.water || '<span class="check">[ ] 公営  [ ] 私営  [ ] 井戸  本管 / 引込み: ___mm</span>') + '</td></tr>';
        html += '<tr><th>下水</th><td>' + esc(special.sewage || '<span class="check">[ ] 公共下水  [ ] 浄化槽（人槽:___）  [ ] 汲取り</span>') + '</td></tr>';
        html += '<tr><th>電気</th><td>' + esc(special.electricity || '東京電力 / その他 ___ ／ 引込み有無') + '</td></tr>';
        html += '<tr><th>ガス</th><td>' + esc(special.gas || '<span class="check">[ ] 都市ガス  [ ] プロパン  [ ] 未整備</span>') + '</td></tr>';
        if (isCondo) {
            html += '<tr><th>給湯方式</th><td>' + esc(special.hotwater || '※ガス／電気／灯油 等を記載') + '</td></tr>';
        }
        html += '</table>';

        // ===== 6. 区分所有特有事項 =====
        if (isCondo) {
            html += '<h2>5. 区分所有建物に関する事項</h2>';
            html += '<table>';
            html += '<tr><th>専有部分の用途制限</th><td>' + esc(special.condoUsage || '※管理規約で確認（住居専用・ペット可否・SOHO等）') + '</td></tr>';
            html += '<tr><th>共用部分の共有関係</th><td>' + esc(special.condoCommon || '※共用部分・敷地権の共有持分を記載') + '</td></tr>';
            html += '<tr><th>専用使用権（バルコニー等）</th><td>' + esc(special.condoBalcony || '※バルコニー、専用庭、駐車場専用使用権を記載') + '</td></tr>';
            html += '<tr><th>管理費</th><td>' + esc(prop['管理費'] || '※月額記載') + '</td></tr>';
            html += '<tr><th>修繕積立金</th><td>' + esc(prop['修繕積立金'] || '※月額記載') + '</td></tr>';
            html += '<tr><th>修繕積立基金（一時金）</th><td>' + esc(prop['修繕積立基金'] || '※購入時一時金の有無') + '</td></tr>';
            html += '<tr><th>その他金銭授受</th><td>' + esc(special.condoOtherFee || '※自治会費・町会費等') + '</td></tr>';
            html += '<tr><th>滞納額・滞納処分</th><td>' + esc(special.condoArrears || '※有の場合、買主負担／売主精算を明記') + '</td></tr>';
            html += '<tr><th>管理形態</th><td>' + esc(special.condoMgmt || '※全部委託 / 一部委託 / 自主管理') + '</td></tr>';
            html += '<tr><th>管理会社</th><td>' + esc(special.condoMgmtCo || '※社名・連絡先') + '</td></tr>';
            html += '<tr><th>長期修繕計画</th><td>' + esc(special.condoRepairPlan || '※長期修繕計画書の有無と内容') + '</td></tr>';
            html += '<tr><th>大規模修繕履歴</th><td>' + esc(special.condoRepairHistory || '※過去の大規模修繕実施年・内容') + '</td></tr>';
            html += '</table>';
        }

        // ===== 7. 災害警戒・耐震・既存不適格 =====
        var sectHazard = isCondo ? 6 : 6;
        html += '<h2>' + sectHazard + '. 災害警戒区域・耐震・既存不適格</h2>';
        html += '<table>';
        html += '<tr><th>津波災害警戒区域</th><td>' + (hzT !== undefined ? hzLevel(hzT) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>洪水浸水想定区域</th><td>' + (hzF !== undefined ? hzLevel(hzF) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>土砂災害警戒区域</th><td>' + (hzL !== undefined ? hzLevel(hzL) : '※自治体ハザードマップで確認') + '</td></tr>';
        html += '<tr><th>高潮浸水想定区域</th><td>' + esc(special.tideMap || '※自治体ハザードマップで確認') + '</td></tr>';
        if (!isLand) {
            html += '<tr><th>耐震診断の有無</th><td>' + esc(special.shintaiTest || '<span class="check">[ ] 実施済（年___月）  [ ] 未実施</span>') + '</td></tr>';
            html += '<tr><th>石綿（アスベスト）調査</th><td>' + esc(special.asbestos || '<span class="check">[ ] 調査結果あり  [ ] 調査未実施</span>') + '</td></tr>';
        }
        if (isSale) {
            html += '<tr><th>既存不適格・違反建築</th><td>' + esc(special.nonConforming || '※建蔽率・容積率超過、用途違反の有無を要確認') + '</td></tr>';
        }
        html += '</table>';

        // ===== 売買固有: 取引条件・解除・損害賠償・手付保全 =====
        if (isSale) {
            html += '<h2>7. 取引条件</h2>';
            html += '<table>';
            html += '<tr><th>売買代金</th><td>' + fmt(price) + ' 万円（消費税 別途／込み 要明記）</td></tr>';
            html += '<tr><th>手付金</th><td>' + esc(contract.deposit || '※売買代金の5〜10%が目安') + '</td></tr>';
            html += '<tr><th>残代金支払期日</th><td>' + esc(contract.paymentDate || '※契約日から1〜3ヶ月以内が一般的') + '</td></tr>';
            html += '<tr><th>物件引渡期日</th><td>' + esc(contract.deliveryDate || '※残代金支払と同時が原則') + '</td></tr>';
            html += '<tr><th>ローン特約</th><td>' + esc(contract.loanCondition || '<span class="check">[ ] 有（融資金額___万円、融資承認期日___）  [ ] 無</span>') + '</td></tr>';
            html += '<tr><th>固定資産税等の精算</th><td>' + esc(contract.taxProration || '引渡日を基準に日割精算') + '</td></tr>';
            if (isCondo) {
                html += '<tr><th>管理費・修繕積立金の精算</th><td>' + esc(contract.condoFeeProration || '引渡日を基準に日割精算') + '</td></tr>';
            }
            html += '</table>';

            html += '<h2>8. 契約の解除に関する事項</h2>';
            html += '<table>';
            html += '<tr><th>手付解除</th><td>' + esc(special.handDeposit || '相手方が契約履行に着手する前まで、買主は手付放棄、売主は手付倍返しで解除可能（民法557条）') + '</td></tr>';
            html += '<tr><th>契約違反による解除</th><td>' + esc(special.breachClause || '相当の期間を定めて履行を催告し、その期間内に履行されない場合、相手方は契約を解除できる（民法541条）') + '</td></tr>';
            html += '<tr><th>ローン特約解除</th><td>' + esc(special.loanCancelClause || 'ローン承認が得られない場合、買主は無条件で契約解除可能（手付金返還）') + '</td></tr>';
            html += '<tr><th>反社会的勢力排除条項</th><td>反社会的勢力に該当する場合、相手方は無催告で契約解除可能</td></tr>';
            html += '</table>';

            html += '<h2>9. 損害賠償の予定又は違約金</h2>';
            html += '<table>';
            html += '<tr><th>違約金の額</th><td>' + esc(special.penalty || '売買代金の20%（業界慣行）') + '</td></tr>';
            html += '</table>';

            // 宅建業者売主特有: 手付金保全（必須）+ 自ら売主規制
            html += '<h2>10. 手付金等の保全措置</h2>';
            html += '<table>';
            if (isSellerBiz) {
                html += '<tr><th>保全措置の要否</th><td>宅地建物取引業者が自ら売主となる本取引では、手付金等が代金の5%超または1,000万円超の場合、宅地建物取引業法第41条・第41条の2に基づき<b>必ず</b>保全措置を講じます。</td></tr>';
                html += '<tr><th>保全措置の内容</th><td>' + esc(special.depositProtection || '<span class="check">[ ] 保証委託契約（保証会社：___）  [ ] 保証保険契約  [ ] 指定保管機関</span>') + '</td></tr>';
                html += '<tr><th>保全実施時期</th><td>' + esc(special.depositProtectionTiming || '手付金等の受領前') + '</td></tr>';
            } else {
                html += '<tr><th>保全措置の要否</th><td>' + esc(special.depositProtection || '※宅建業者が売主の場合、手付金が代金の5%超または1,000万円超で保全措置義務（宅建業法第41条）。個人売主の場合は対象外。') + '</td></tr>';
            }
            html += '</table>';

            // 宅建業者売主特有: 自ら売主の規制（八つ規制）
            if (isSellerBiz) {
                html += '<h2>11. 宅地建物取引業者が自ら売主となる場合の規制（宅建業法 第33条の2〜第43条）</h2>';
                html += '<table>';
                html += '<tr><th>自己所有でない物件の売買契約の制限（33条の2）</th><td>本物件は<span class="check">[ ] 当社所有 [ ] 取得契約済 [ ] その他___</span></td></tr>';
                html += '<tr><th>クーリングオフ（37条の2）</th><td>事務所等以外で買受申込・契約締結した場合、書面交付から8日間は無条件解除可能（買主が宅建業者の場合は除く）</td></tr>';
                html += '<tr><th>損害賠償額の予定等の制限（38条）</th><td>違約金・損害賠償の予定額の合計は代金の20%を超えない</td></tr>';
                html += '<tr><th>手付の額の制限等（39条）</th><td>手付金は代金の20%以下</td></tr>';
                html += '<tr><th>契約不適合責任の特約制限（40条）</th><td>引渡から2年以上の期間を確保（宅建業法上の最低期間）</td></tr>';
                html += '<tr><th>割賦販売の場合の所有権留保等の制限（43条）</th><td>該当する場合のみ記載</td></tr>';
                html += '</table>';
            }

            // 特約事項
            var sectSpecial = isSellerBiz ? 12 : 11;
            html += '<h2>' + sectSpecial + '. 特約事項</h2>';
            html += '<table>';
            html += '<tr><th>残置物の取り扱い</th><td>' + esc(special.leftovers || '※エアコン・照明器具・カーテン等の残置／撤去を明記') + '</td></tr>';
            html += '<tr><th>契約不適合責任</th><td>' + esc(special.warranty || (isSellerBiz ? '引渡から2年（宅建業法第40条による最低期間）' : '※引渡後の瑕疵対応期間を明記')) + '</td></tr>';
            html += '<tr><th>その他特約</th><td>' + esc(special.otherSpecial || '') + '</td></tr>';
            html += '</table>';
        }

        // ===== 賃貸固有: 賃料・契約期間・更新料・敷金 =====
        if (isRent) {
            html += '<h2>7. 賃貸借契約の条件</h2>';
            html += '<table>';
            html += '<tr><th>賃料（月額）</th><td>' + (rent ? fmt(rent) + ' 円' : (esc(contract.rent || '※月額記載'))) + '</td></tr>';
            html += '<tr><th>共益費・管理費</th><td>' + esc(contract.commonFee || '※月額記載') + '</td></tr>';
            html += '<tr><th>敷金</th><td>' + esc(contract.deposit || '※賃料の___ヶ月分') + '</td></tr>';
            html += '<tr><th>礼金</th><td>' + esc(contract.keyMoney || '※賃料の___ヶ月分') + '</td></tr>';
            html += '<tr><th>仲介手数料</th><td>' + esc(contract.commission || '賃料の1ヶ月分（税別）以内、宅建業法上限') + '</td></tr>';
            html += '<tr><th>契約期間</th><td>' + esc(contract.term || '※___年（普通借家／定期借家 要明記）') + '</td></tr>';
            html += '<tr><th>契約類型</th><td>' + esc(contract.contractType || '<span class="check">[ ] 普通借家契約（借地借家法第26条以下）  [ ] 定期借家契約（借地借家法第38条）</span>') + '</td></tr>';
            html += '<tr><th>更新料</th><td>' + esc(contract.renewalFee || '※有の場合、賃料の___ヶ月分') + '</td></tr>';
            html += '<tr><th>更新事務手数料</th><td>' + esc(contract.renewalFeeFee || '※有の場合、___円') + '</td></tr>';
            html += '<tr><th>禁止事項</th><td>' + esc(special.rentRestrictions || '※ペット・楽器・喫煙・転貸等の禁止有無を記載') + '</td></tr>';
            if (isCommercial) {
                html += '<tr><th>使用用途</th><td>' + esc(special.commercialUse || '※具体的な使用業種を明記') + '</td></tr>';
                html += '<tr><th>看板・サイン設置</th><td>' + esc(special.signage || '※外壁・道路面の看板設置可否、サイズ制限') + '</td></tr>';
                html += '<tr><th>原状回復範囲</th><td>' + esc(special.restoration || '※事業用は原則テナント負担、範囲を明記') + '</td></tr>';
            }
            html += '</table>';

            html += '<h2>8. 契約の解除に関する事項</h2>';
            html += '<table>';
            html += '<tr><th>賃借人による解約</th><td>' + esc(special.tenantCancel || '※___ヶ月前予告制が一般的') + '</td></tr>';
            html += '<tr><th>賃貸人による解約</th><td>' + esc(special.landlordCancel || '※借地借家法第28条（正当事由）が必要') + '</td></tr>';
            html += '<tr><th>定期借家の場合の終了通知</th><td>' + esc(special.fixedTermNotice || '※契約期間1年以上の場合、満了の6〜12ヶ月前に通知必要') + '</td></tr>';
            html += '<tr><th>賃料滞納時の対応</th><td>' + esc(special.rentArrears || '※2ヶ月以上の滞納で催告・解除可能（信頼関係破壊）') + '</td></tr>';
            html += '</table>';

            html += '<h2>9. 損害賠償の予定又は違約金</h2>';
            html += '<table>';
            html += '<tr><th>違約金</th><td>' + esc(special.penalty || '※定期借家の中途解約特約、原状回復義務違反等') + '</td></tr>';
            html += '</table>';

            html += '<h2>10. 特約事項</h2>';
            html += '<table>';
            html += '<tr><th>原状回復ガイドライン</th><td>国土交通省「原状回復をめぐるトラブルとガイドライン」に準拠</td></tr>';
            html += '<tr><th>連帯保証人 / 保証会社</th><td>' + esc(special.guarantor || '※連帯保証人の要否、保証会社利用の要否') + '</td></tr>';
            html += '<tr><th>その他特約</th><td>' + esc(special.otherSpecial || '') + '</td></tr>';
            html += '</table>';
        }

        // ===== IT重説対応情報 =====
        if (it.enabled) {
            html += '<div class="it-disclosure-block">';
            html += '<h3>IT重要事項説明 実施情報</h3>';
            html += '<table>';
            html += '<tr><th>説明日時</th><td>' + esc(it.datetime || '※年月日 時刻を記載') + '</td></tr>';
            html += '<tr><th>使用ソフトウェア</th><td>' + esc(it.software || 'Zoom / Google Meet / Microsoft Teams 等') + '</td></tr>';
            html += '<tr><th>ビデオ通話URL</th><td style="word-break:break-all;">' + esc(it.meetingUrl || '') + '</td></tr>';
            html += '<tr><th>録画の有無</th><td>' + esc(it.recording || '※録画する場合、相手方の同意取得を別途記録') + '</td></tr>';
            html += '<tr><th>本人確認方法</th><td>運転免許証等の身分証明書を画面越しに提示確認</td></tr>';
            html += '</table>';
            html += '<div class="note">IT重説は国土交通省「ITを活用した重要事項説明に係るマニュアル」に従い、説明開始前の通信状態確認、本人確認、書面到達確認を実施してください。</div>';
            html += '</div>';
        }

        // ===== 署名欄 =====
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

        html += '<div class="note" style="margin-top:20px;">本書は MinaTech Realty Console v' + (window.RC_VERSION || '20260518') + ' で自動生成された下書きです。最終的な記載内容・事実確認・取引士の説明責任は宅地建物取引業法に基づき宅地建物取引業者本人にあります。</div>';
        html += '</div>';

        return css + html;
    }

    // 物件カテゴリから書式キーを推定
    function inferFormatKey(prop) {
        var cat = (prop['物件カテゴリ'] || prop.category || '').toLowerCase();
        if (cat === 'condo') return 'sale_condo';
        if (cat === 'house') return 'sale_landhouse';
        if (cat === 'land')  return 'sale_land';
        if (cat === 'rent' || cat === 'rental' || cat === 'chintai') return 'rent_residential';
        if (cat === 'tenant') return 'rent_commercial';
        return 'sale_condo'; // 既定
    }

    function renderCSS() {
        return '<style>' +
            '.disclosure{font-family:"MS Mincho","Yu Mincho",serif;color:#000;max-width:780px;margin:0 auto;padding:24px;background:#fff;font-size:11px;line-height:1.7}' +
            '.disclosure .draft-watermark{position:absolute;top:30px;right:30px;color:#dc2626;border:2px solid #dc2626;padding:4px 14px;font-weight:700;font-size:13px;transform:rotate(-8deg);opacity:0.6}' +
            '.disclosure h1{font-size:18px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px;letter-spacing:0.05em}' +
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
    }

    // PDF出力
    function exportPDF(prop, opts) {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            throw new Error('PDFライブラリ未読込（jsPDF + html2canvas が必要）');
        }
        opts = opts || {};
        var formatKey = opts.formatKey || inferFormatKey(prop);
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
            pdf.save('重説下書き_' + fmtLabel + '_' + name + '_' + new Date().toISOString().slice(0,10) + '.pdf');
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
        exportPDF: exportPDF,
        inferFormatKey: inferFormatKey
    };
})();
