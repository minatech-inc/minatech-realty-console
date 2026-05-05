/**
 * 積算評価モジュール（Phase A）
 *
 * 土地積算 = 敷地面積 × 単価（公示地価ベース・万円/㎡）
 * 建物積算 = 延床面積 × 再調達単価 × (残存年数 / 法定耐用年数)
 * 積算価格 = 土地積算 + 建物積算
 * 積算比   = 積算価格 / 売出価格
 *
 * データソース:
 *   - 公示地価（国交省）令和6年 住宅地平均を市区町村・都道府県単位でバンドル
 *   - 再調達単価: 不動産鑑定評価基準の目安値
 *   - 法定耐用年数: 減価償却資産の耐用年数等に関する省令
 *
 * ※ 簡易積算のため実鑑定より誤差±20-30%を想定。融資評価の参考値用途。
 */
var Appraisal = (function() {
    'use strict';

    // 単価は 万円/㎡（住宅地平均・令和6年公示地価ベースの概算値）
    // ward/city 単位で細かく、無ければ都道府県平均でフォールバック
    var CITY_PRICE = {
        // 東京23区
        '千代田区': 400, '中央区': 280, '港区': 320, '渋谷区': 180, '新宿区': 120,
        '文京区': 110, '目黒区': 110, '品川区': 95, '世田谷区': 75, '杉並区': 70,
        '中野区': 75, '豊島区': 80, '台東区': 110, '墨田区': 65, '江東区': 65,
        '大田区': 60, '練馬区': 45, '板橋区': 50, '北区': 55, '荒川区': 60,
        '足立区': 38, '葛飾区': 38, '江戸川区': 38,
        // 東京都下
        '武蔵野市': 75, '三鷹市': 55, '調布市': 45, '国分寺市': 42, '小金井市': 45,
        '府中市': 38, '立川市': 35, '八王子市': 18, '町田市': 22,
        // 神奈川主要
        '横浜市西区': 45, '横浜市中区': 42, '横浜市神奈川区': 35, '横浜市鶴見区': 30,
        '横浜市港北区': 33, '横浜市都筑区': 30, '横浜市青葉区': 28, '横浜市緑区': 22,
        '横浜市戸塚区': 22, '横浜市南区': 28, '横浜市磯子区': 24, '横浜市金沢区': 22,
        '横浜市': 28, '川崎市中原区': 38, '川崎市高津区': 34, '川崎市宮前区': 26,
        '川崎市麻生区': 25, '川崎市多摩区': 24, '川崎市': 30,
        '鎌倉市': 28, '逗子市': 22, '葉山町': 20, '藤沢市': 20, '茅ヶ崎市': 18,
        '平塚市': 12, '大磯町': 15, '二宮町': 10, '小田原市': 10, '横須賀市': 12,
        '相模原市': 15, '厚木市': 14, '海老名市': 16, '座間市': 14,
        // 関東主要
        'さいたま市': 22, '川口市': 25, '所沢市': 18, '川越市': 15,
        '千葉市': 15, '船橋市': 17, '市川市': 22, '松戸市': 17, '浦安市': 28, '柏市': 14,
        // 関西主要
        '大阪市北区': 85, '大阪市中央区': 110, '大阪市西区': 65, '大阪市天王寺区': 55,
        '大阪市福島区': 55, '大阪市': 40, '堺市': 15,
        '京都市中京区': 75, '京都市下京区': 70, '京都市東山区': 55, '京都市': 30,
        '神戸市中央区': 55, '神戸市灘区': 28, '神戸市東灘区': 32, '神戸市': 20,
        '西宮市': 25, '芦屋市': 35, '尼崎市': 18,
        // 中部主要
        '名古屋市中区': 75, '名古屋市東区': 55, '名古屋市千種区': 30, '名古屋市': 25,
        // 福岡主要
        '福岡市中央区': 55, '福岡市博多区': 45, '福岡市早良区': 22, '福岡市': 25,
        // 北海道
        '札幌市中央区': 25, '札幌市': 10,
        // 仙台
        '仙台市青葉区': 20, '仙台市': 12
    };

    // 都道府県平均（フォールバック・住宅地）
    var PREF_PRICE = {
        '東京都': 55, '神奈川県': 18, '埼玉県': 12, '千葉県': 10,
        '大阪府': 15, '京都府': 12, '兵庫県': 12, '愛知県': 12,
        '福岡県': 7, '北海道': 4, '宮城県': 5, '広島県': 6,
        '静岡県': 7, '茨城県': 4, '栃木県': 4, '群馬県': 3.5,
        '奈良県': 7, '滋賀県': 5, '三重県': 4, '岐阜県': 4,
        '新潟県': 3.5, '長野県': 3, '山梨県': 3, '富山県': 3,
        '石川県': 4, '福井県': 3, '岡山県': 4, '山口県': 3,
        '徳島県': 3, '香川県': 3.5, '愛媛県': 3, '高知県': 3,
        '佐賀県': 2.5, '長崎県': 3, '熊本県': 4, '大分県': 3,
        '宮崎県': 3, '鹿児島県': 3, '沖縄県': 7, '青森県': 2,
        '岩手県': 2.5, '秋田県': 2, '山形県': 2, '福島県': 3, '和歌山県': 3.5
    };

    // 再調達単価（万円/㎡）: 不動産鑑定評価基準より
    var RECONSTRUCTION = { 'RC': 22, 'SRC': 24, '鉄骨': 18, '木造': 16 };

    // 法定耐用年数（年）
    var LEGAL_LIFE = { 'RC': 47, 'SRC': 47, '鉄骨': 34, '木造': 22 };

    // エリア別期待利回り（還元利回り・Cap Rate）%
    var CAP_RATE = {
        '東京23区': 4.5, '東京都下': 5.5,
        '横浜川崎': 5.0, '湘南': 5.8, '神奈川県': 6.5,
        '大阪中心': 5.0, '大阪府': 6.0,
        '名古屋中心': 5.2, '愛知県': 6.2,
        '福岡中心': 5.3, '福岡県': 6.3,
        '主力': 6.5, '準主力': 7.5, 'その他': 8.5
    };

    function getCapRate(location) {
        if (!location) return 8.0;
        var TOKYO_23 = ['千代田','中央区','港区','新宿','文京','台東','墨田','江東','品川','目黒','大田','世田谷','渋谷','中野','杉並','豊島','北区','荒川','板橋','練馬','足立','葛飾','江戸川'];
        for (var i = 0; i < TOKYO_23.length; i++) if (location.indexOf(TOKYO_23[i]) >= 0) return CAP_RATE['東京23区'];
        if (location.indexOf('東京') >= 0) return CAP_RATE['東京都下'];
        if (location.indexOf('横浜') >= 0 || location.indexOf('川崎') >= 0) return CAP_RATE['横浜川崎'];
        if (/鎌倉|藤沢|茅ヶ崎|逗子|葉山|平塚|大磯/.test(location)) return CAP_RATE['湘南'];
        if (location.indexOf('神奈川') >= 0) return CAP_RATE['神奈川県'];
        if (/大阪市(北|中央|西|天王寺|福島)/.test(location)) return CAP_RATE['大阪中心'];
        if (location.indexOf('大阪') >= 0) return CAP_RATE['大阪府'];
        if (/名古屋市(中|東|千種)/.test(location)) return CAP_RATE['名古屋中心'];
        if (location.indexOf('愛知') >= 0 || location.indexOf('名古屋') >= 0) return CAP_RATE['愛知県'];
        if (/福岡市(中央|博多)/.test(location)) return CAP_RATE['福岡中心'];
        if (location.indexOf('福岡') >= 0) return CAP_RATE['福岡県'];
        if (/埼玉|千葉|兵庫|京都/.test(location)) return CAP_RATE['主力'];
        return CAP_RATE['その他'];
    }

    function lookupLandPrice(location) {
        if (!location) return null;
        // 市区町村レベル優先
        for (var key in CITY_PRICE) {
            if (location.indexOf(key) >= 0) {
                return { pricePerSqm: CITY_PRICE[key], source: '市区町村平均(' + key + ')' };
            }
        }
        // 都道府県フォールバック
        for (var pref in PREF_PRICE) {
            if (location.indexOf(pref) >= 0) {
                return { pricePerSqm: PREF_PRICE[pref], source: '県平均(' + pref + ')' };
            }
        }
        return null;
    }

    function detectStructure(s) {
        if (!s) return null;
        if (s.indexOf('SRC') >= 0) return 'SRC';
        if (s.indexOf('RC') >= 0 || s.indexOf('鉄筋') >= 0) return 'RC';
        if (s.indexOf('鉄骨') >= 0 || s.indexOf('S造') >= 0) return '鉄骨';
        if (s.indexOf('木造') >= 0 || s.indexOf('木') >= 0) return '木造';
        return null;
    }

    function calcAge(builtStr) {
        if (!builtStr) return null;
        var year = null;
        var m = builtStr.match(/(\d{4})\s*年/);
        if (m) year = parseInt(m[1]);
        if (!year) {
            var e = builtStr.match(/(昭和|平成|令和)\s*(\d+)\s*年/);
            if (e) {
                var n = parseInt(e[2]);
                if (e[1] === '昭和') year = 1925 + n;
                else if (e[1] === '平成') year = 1988 + n;
                else if (e[1] === '令和') year = 2018 + n;
            }
        }
        return year ? (new Date().getFullYear() - year) : null;
    }

    /**
     * 建物積算の維持管理補正係数（B-3 建物積算精緻化）
     * 基礎式 bldgArea × unit × (remain/life) に対する補正倍率を算出
     *
     * 根拠:
     *   - 不動産鑑定評価基準 第6章「観察減価法」: 物理的・機能的・経済的減価を
     *     個別要因として観察し、法定減価に補正をかける
     *   - 国交省「長期優良住宅認定基準」・修繕履歴の保全効果
     *   - 実務で銀行担保評価部が用いる保守状態査定レンジ (0.80〜1.15)
     *
     * 補正要因:
     *   + リノベーション/フルリフォーム済: +15%
     *   + 直近5年内の大規模修繕: +10%
     *   + 直近15年内の大規模修繕: +5%
     *   + 修繕回数が築年数に対し標準以上(15年に1回): +3%
     *   + 長期修繕計画策定済み: +3%
     *   - 臨海・湾岸エリア(塩害): -5%
     *   - 旧耐震相当(1981年以前) かつ 大規模修繕履歴なし: -10%
     *   - 自主管理: -3%
     *   - 築30年超で修繕履歴不明: -5%
     * クランプ範囲: 0.80 〜 1.20
     */
    function computeMaintenanceFactor(prop, age) {
        var factor = 1.0;
        var parts = [];
        var notes = [];

        var bikou = (prop['備考'] || '') + ' ' + (prop['物件名'] || '');
        if (/(リノベーション|フルリフォーム|全面改装|全面リフォーム|内装一新)/.test(bikou)) {
            factor += 0.15; parts.push('リノベ済+15%');
        } else if (/(リフォーム済|改装済)/.test(bikou)) {
            factor += 0.05; parts.push('リフォーム済+5%');
        }

        var lastRepair = parseFloat(prop['大規模修繕直近年']);
        var nowY = new Date().getFullYear();
        if (!isNaN(lastRepair) && lastRepair > 0) {
            var ys = nowY - lastRepair;
            if (ys <= 5) { factor += 0.10; parts.push('大規模修繕直近+10%'); }
            else if (ys <= 15) { factor += 0.05; parts.push('大規模修繕履歴+5%'); }
        }

        var repairCount = parseFloat(prop['大規模修繕実施回数']);
        if (!isNaN(repairCount) && age && repairCount >= Math.floor(age / 15)) {
            factor += 0.03; parts.push('修繕回数標準以上+3%');
        }

        if (prop['長期修繕計画'] === 'yes') {
            factor += 0.03; parts.push('長計策定+3%');
        }

        var loc = prop['所在地'] || '';
        if (/(臨海|湾岸|沿岸|浦安|港南|江東区|品川区東品川|豊洲|勝どき|晴海|芝浦|海岸|東雲|有明)/.test(loc)) {
            factor -= 0.05; parts.push('塩害エリア-5%');
        }

        if (age !== null) {
            var builtYear = nowY - age;
            if (builtYear < 1981 && (isNaN(lastRepair) || !lastRepair)) {
                factor -= 0.10; parts.push('旧耐震かつ修繕不明-10%');
            }
            if (age > 30 && (isNaN(repairCount) || repairCount === 0) && (isNaN(lastRepair) || !lastRepair)) {
                factor -= 0.05; parts.push('築30年超修繕不明-5%');
            }
        }

        if (prop['管理形態'] === '自主管理') {
            factor -= 0.03; parts.push('自主管理-3%');
        }

        if (factor < 0.80) factor = 0.80;
        if (factor > 1.20) factor = 1.20;

        return {
            factor: factor,
            label: parts.length ? parts.join(',') : '標準',
            notes: notes
        };
    }

    function evaluate(prop, lpOverride) {
        var price = parseFloat(prop['価格(万円)']) || 0;
        var landArea = parseFloat(prop['土地面積(㎡)']) || 0;
        var bldgArea = parseFloat(prop['建物面積(㎡)']) || parseFloat(prop['面積(㎡)']) || 0;
        var lp = lpOverride || lookupLandPrice(prop['所在地'] || '');
        if (!lp || !price) return null;

        var cat = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().category : 'apartment';
        var landMode = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.evaluateLand(cat) : 'full';
        var evalBuilding = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.EVALUATE_BUILDING[cat] : true;

        var landValue = 0;
        if (landMode === 'full' && landArea > 0) {
            landValue = landArea * lp.pricePerSqm;
        } else if (landMode === 'share' && landArea > 0) {
            // 区分: 土地は総戸数で按分（不明なら1/20と仮定）
            var units = parseFloat(prop['総戸数']) || 20;
            landValue = (landArea * lp.pricePerSqm) / units;
        }

        var st = detectStructure(prop['構造'] || '');
        var age = calcAge(prop['築年月'] || '');
        var bldgValue = 0;
        var bldgNote = '';
        var maint = computeMaintenanceFactor(prop, age);
        if (evalBuilding && st && bldgArea > 0 && age !== null) {
            var unit = RECONSTRUCTION[st];
            var life = LEGAL_LIFE[st];
            var remain = Math.max(0, life - age);
            var base = bldgArea * unit * (remain / life);
            bldgValue = base * maint.factor;
            bldgNote = st + ' 残' + remain + '/' + life + '年' + (maint.factor !== 1.0 ? ' ×' + maint.factor.toFixed(2) + '(' + maint.label + ')' : '');
        } else if (evalBuilding && st && bldgArea > 0) {
            bldgValue = bldgArea * RECONSTRUCTION[st] * 0.5 * maint.factor;
            bldgNote = st + '(築年不明・50%)' + (maint.factor !== 1.0 ? ' ×' + maint.factor.toFixed(2) : '');
        }

        var total = landValue + bldgValue;
        if (total <= 0) return null;
        var ratio = total / price;

        return {
            landValue: Math.round(landValue),
            buildingValue: Math.round(bldgValue),
            totalValue: Math.round(total),
            ratio: ratio,
            ratioPct: Math.round(ratio * 100),
            pricePerSqm: lp.pricePerSqm,
            priceSource: lp.source,
            buildingNote: bldgNote,
            maintenanceFactor: maint.factor,
            maintenanceLabel: maint.label
        };
    }

    // 収益還元法（直接還元）
    // NOI = 年間満室賃料 × (1 - 空室率5% - 運営費率20%) = 表面利回りベース収入 × 0.75
    // 還元価格 = NOI / 還元利回り
    function evaluateIncome(prop) {
        var price = parseFloat(prop['価格(万円)']) || 0;
        var yld = parseFloat(prop['表面利回り(%)']) || 0;
        if (!price || !yld) return null;

        var cat = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().category : 'apartment';
        if (cat === 'land' || (typeof CategoryLogic !== 'undefined' && !CategoryLogic.hasIncomeApproach(cat))) return null;

        // カテゴリ別 運営費率・空室率
        var opexRate = 0.20, vacancyRate = 0.05;
        if (cat === 'condo') { opexRate = 0.25; vacancyRate = 0.07; }       // 管理費・修繕積立で目減り
        else if (cat === 'house') { opexRate = 0.15; vacancyRate = 0.10; }  // 戸建は運営費低・空室時全損
        else if (cat === 'tenant') { opexRate = 0.15; vacancyRate = 0.12; } // 事業用は空室リスク高

        var grossAnnual = price * yld / 100;
        var noi;
        var noiNote = '';
        // 区分マンションで実数値入力がある場合は実費ベースで計算
        var kanri = parseFloat(prop['管理費(円/月)']) || 0;
        var shuzen = parseFloat(prop['修繕積立金(円/月)']) || 0;
        if (cat === 'condo' && (kanri > 0 || shuzen > 0)) {
            // 円/月 → 万円/年
            var annualOpexMan = (kanri + shuzen) * 12 / 10000;
            // 固都税概算: 価格 × 0.4%
            var zei = price * 0.004;
            // 空室損失は残す
            var effectiveGross = grossAnnual * (1 - vacancyRate);
            noi = effectiveGross - annualOpexMan - zei;
            noiNote = '実費(管理費+修繕積立+固都税概算)控除';
        } else {
            noi = grossAnnual * (1 - opexRate - vacancyRate);
        }
        var capRate = getCapRate(prop['所在地'] || '');
        var catAdjust = (typeof CategoryLogic !== 'undefined') ? (CategoryLogic.CAP_ADJUST[cat] || 1.0) : 1.0;
        capRate = capRate * catAdjust;
        var incomeValue = noi / (capRate / 100);
        var ratio = incomeValue / price;
        return {
            grossAnnual: Math.round(grossAnnual),
            noi: Math.round(noi),
            capRate: parseFloat(capRate.toFixed(2)),
            opexRate: opexRate,
            vacancyRate: vacancyRate,
            incomeValue: Math.round(incomeValue),
            ratio: ratio,
            ratioPct: Math.round(ratio * 100),
            noiNote: noiNote
        };
    }

    function incomeScoreAdjust(ratio) {
        if (ratio >= 1.1) return { delta: 2, reason: '収益還元' + Math.round(ratio*100) + '%(割安)' };
        if (ratio >= 0.95) return { delta: 1, reason: '収益還元' + Math.round(ratio*100) + '%(適正)' };
        if (ratio >= 0.8) return { delta: 0, reason: '収益還元' + Math.round(ratio*100) + '%' };
        return { delta: -1, reason: '収益還元' + Math.round(ratio*100) + '%(割高)' };
    }

    // 積算比に応じたスコア補正（-2 〜 +2）
    function scoreAdjust(ratio) {
        if (ratio >= 1.0) return { delta: 2, reason: '積算比' + Math.round(ratio*100) + '%(優良)' };
        if (ratio >= 0.8) return { delta: 1, reason: '積算比' + Math.round(ratio*100) + '%(良好)' };
        if (ratio >= 0.6) return { delta: 0, reason: '積算比' + Math.round(ratio*100) + '%' };
        return { delta: -2, reason: '積算比' + Math.round(ratio*100) + '%(融資困難)' };
    }

    // 融資適性判定
    // 想定: 投資用アパートローン 金利2.5% 元利均等
    // 融資期間 = min(法定耐用年数 - 築年数, 35年)
    // 想定LTV = min(積算価格/売出価格, 1.0)（銀行積算準拠）
    // DSCR = NOI / 年間返済額
    function evaluateFinancing(prop, appraisal, income) {
        var price = parseFloat(prop['価格(万円)']) || 0;
        if (!price) return null;
        var st = detectStructure(prop['構造'] || '');
        var age = calcAge(prop['築年月'] || '');
        var life = st && LEGAL_LIFE[st] ? LEGAL_LIFE[st] : 30;
        var remainYears = (age !== null) ? Math.max(0, life - age) : 20;
        var loanYears = Math.min(remainYears, 35);
        var rate = 0.025;

        var ltv = 1.0;
        var ltvNote = 'フルローン想定';
        if (appraisal && appraisal.totalValue) {
            ltv = Math.min(appraisal.totalValue / price, 1.0);
            ltvNote = '銀行積算準拠 (積算/売出=' + appraisal.ratioPct + '%)';
        }
        var loanAmount = price * ltv;

        // 元利均等返済の年間返済額
        var annualPayment = 0;
        var monthlyPayment = 0;
        if (loanYears > 0 && loanAmount > 0) {
            var n = loanYears * 12;
            var r = rate / 12;
            monthlyPayment = loanAmount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
            annualPayment = monthlyPayment * 12;
        }

        var dscr = null;
        if (income && income.noi && annualPayment > 0) {
            dscr = income.noi / annualPayment;
        }

        // 判定
        var verdict, verdictClass, reasons = [];
        if (loanYears < 10) {
            verdict = '融資困難'; verdictClass = 'bad';
            reasons.push('残存耐用年数' + remainYears + '年で融資期間が短すぎる');
        } else if (dscr !== null && dscr < 1.0) {
            verdict = '融資困難'; verdictClass = 'bad';
            reasons.push('DSCR ' + dscr.toFixed(2) + ' < 1.0（返済原資不足）');
        } else if (dscr !== null && dscr >= 1.3 && (appraisal && appraisal.ratio >= 0.8)) {
            verdict = '融資良好'; verdictClass = 'good';
            reasons.push('DSCR ' + dscr.toFixed(2) + ' ≥ 1.3');
            reasons.push('積算比 ' + appraisal.ratioPct + '% ≥ 80%');
        } else if (dscr !== null && dscr >= 1.1 && (appraisal && appraisal.ratio >= 0.6)) {
            verdict = '融資可能'; verdictClass = 'ok';
            reasons.push('DSCR ' + dscr.toFixed(2) + ' ≥ 1.1');
        } else if (dscr === null) {
            verdict = '要確認'; verdictClass = 'warn';
            reasons.push('収益情報不足のためDSCR算出不可');
        } else {
            verdict = '条件厳しい'; verdictClass = 'warn';
            reasons.push('DSCR ' + dscr.toFixed(2) + ' (1.0-1.1)');
        }

        return {
            loanYears: loanYears,
            remainYears: remainYears,
            rate: rate * 100,
            ltv: Math.round(ltv * 100),
            ltvNote: ltvNote,
            loanAmount: Math.round(loanAmount),
            annualPayment: Math.round(annualPayment),
            monthlyPayment: Math.round(monthlyPayment),
            dscr: dscr !== null ? parseFloat(dscr.toFixed(2)) : null,
            verdict: verdict,
            verdictClass: verdictClass,
            reasons: reasons
        };
    }

    return {
        evaluate: evaluate,
        evaluateIncome: evaluateIncome,
        evaluateFinancing: evaluateFinancing,
        scoreAdjust: scoreAdjust,
        incomeScoreAdjust: incomeScoreAdjust,
        lookupLandPrice: lookupLandPrice,
        getCapRate: getCapRate,
        RECONSTRUCTION: RECONSTRUCTION,
        LEGAL_LIFE: LEGAL_LIFE
    };
})();
