/**
 * REINS物件スコアリングエンジン
 * realestate_scraper.py の evaluate() と同一ロジックをJSに移植
 *
 * 10点満点評価:
 *   エリア市場性: 0-3点（tier1/2/3）
 *   表面利回り:   0-2点（15%以上=2, 10%以上=1）
 *   駅距離:       0-1点（10分以内=1）
 *   価格帯:       0-1点（500万以下=1）
 *   賃貸中(OC):   0-1点
 *   構造・築年:   0-1点
 *   再建築不可:   -3点
 *   実質利回り:   0 or -2点（実質5%未満=-2）
 *
 * 判定: 7+→S即日 / 5-6→A今週 / 3-4→B今月 / 2以下→C見送り
 */

var ReinsScorer = (function() {

    // エリアティア定義（realestate_scraper.py と同一）
    var TIER1 = ['埼玉', '千葉', '神奈川', '大阪', '愛知', '福岡'];
    var TIER2 = ['茨城', '栃木', '群馬', '静岡', '兵庫', '京都', '広島', '宮城', '北海道'];
    var TIER3 = ['新潟', '長野', '岡山', '熊本', '鹿児島', '和歌山', '三重', '滋賀'];
    var LOW_DEMAND = ['宮古市', '釜石市', '大船渡市', '夕張市', '歌志内', '三笠市', '五島', '対馬', '壱岐'];

    // 東京23区（特別加点）
    var TOKYO_23KU = [
        '千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区', '江東区',
        '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区', '杉並区', '豊島区',
        '北区', '荒川区', '板橋区', '練馬区', '足立区', '葛飾区', '江戸川区'
    ];

    /**
     * エリアティア判定
     */
    function getAreaTier(location) {
        if (!location) return { tier: 0, reason: '所在地不明' };

        // 低需要エリアチェック
        for (var i = 0; i < LOW_DEMAND.length; i++) {
            if (location.indexOf(LOW_DEMAND[i]) >= 0) {
                return { tier: 0, reason: '低需要(' + LOW_DEMAND[i] + ')' };
            }
        }

        // 東京23区は最高ティア
        for (var i = 0; i < TOKYO_23KU.length; i++) {
            if (location.indexOf(TOKYO_23KU[i]) >= 0) {
                return { tier: 1, reason: '主力(東京' + TOKYO_23KU[i] + ')' };
            }
        }

        // 東京都（23区以外）
        if (location.indexOf('東京') >= 0) {
            return { tier: 2, reason: '準主力(東京都下)' };
        }

        // TIER1
        for (var i = 0; i < TIER1.length; i++) {
            if (location.indexOf(TIER1[i]) >= 0) {
                return { tier: 1, reason: '主力(' + TIER1[i] + ')' };
            }
        }
        // TIER2
        for (var i = 0; i < TIER2.length; i++) {
            if (location.indexOf(TIER2[i]) >= 0) {
                return { tier: 2, reason: '準主力(' + TIER2[i] + ')' };
            }
        }
        // TIER3
        for (var i = 0; i < TIER3.length; i++) {
            if (location.indexOf(TIER3[i]) >= 0) {
                return { tier: 3, reason: '条件付き(' + TIER3[i] + ')' };
            }
        }

        return { tier: 0, reason: '対象外' };
    }

    /**
     * 駅距離（分）を抽出
     */
    function extractStationMinutes(text) {
        if (!text) return 99;
        var m = text.match(/(\d+)\s*分/);
        return m ? parseInt(m[1]) : 99;
    }

    /**
     * 築年数を計算
     */
    function calcBuildingAge(builtStr) {
        if (!builtStr) return null;

        var year = null;

        // 西暦
        var westernMatch = builtStr.match(/(\d{4})\s*年/);
        if (westernMatch) {
            year = parseInt(westernMatch[1]);
        }

        // 和暦
        if (!year) {
            var eraMatch = builtStr.match(/(昭和|平成|令和)\s*(\d+)\s*年/);
            if (eraMatch) {
                var era = eraMatch[1];
                var eraYear = parseInt(eraMatch[2]);
                if (era === '昭和') year = 1925 + eraYear;
                else if (era === '平成') year = 1988 + eraYear;
                else if (era === '令和') year = 2018 + eraYear;
            }
        }

        if (!year) return null;
        return new Date().getFullYear() - year;
    }

    /**
     * 区分マンション健全性評価
     * 根拠:
     *   - 国交省「マンションの修繕積立金に関するガイドライン」(2021改訂版)
     *     15階未満: 基準 252円/㎡/月（幅 165〜350）
     *     20階以上: 基準 338円/㎡/月（幅 240〜450）
     *   - 新耐震基準: 1981年6月以降（築年から逆算）
     *   - 大規模修繕サイクル: 12〜18年が標準
     *   - 総戸数: 50戸以上で管理組合運営が安定、20戸未満は一人当たり負担増
     */
    function evaluateCondoHealth(prop, age, area) {
        var delta = 0;
        var reasons = [];
        var details = [];

        // --- 耐震基準 ---
        if (age !== null) {
            var builtYear = new Date().getFullYear() - age;
            if (builtYear < 1981) {
                delta -= 3;
                reasons.push('旧耐震(' + builtYear + '年築,-3)');
                details.push('旧耐震基準(1981年6月以前)。住宅ローン審査・耐震改修負担・売却流動性で大きな不利。');
            } else if (builtYear < 2000) {
                details.push('新耐震基準(' + builtYear + '年築)。2000年改正前だが現行基準を満たす。');
            } else {
                details.push('現行耐震基準(' + builtYear + '年築)。');
            }
        }

        // --- 総戸数 ---
        var units = parseFloat(prop['総戸数']) || null;
        if (units) {
            if (units >= 200) {
                delta += 1;
                reasons.push('大規模' + units + '戸(+1)');
                details.push('大規模マンション(200戸以上)。管理組合運営が安定し、スケールメリットで修繕コストが低減される。');
            } else if (units >= 50) {
                details.push('中規模マンション(' + units + '戸)。管理組合運営が健全に機能する標準規模。');
            } else if (units >= 20) {
                delta -= 1;
                reasons.push('小規模' + units + '戸(-1)');
                details.push('小規模マンション(' + units + '戸)。一人当たり修繕負担が増えやすく、大規模修繕時の資金不足リスクあり。');
            } else {
                delta -= 2;
                reasons.push('超小規模' + units + '戸(-2)');
                details.push('超小規模マンション(20戸未満)。管理費・修繕積立金の一人当たり負担が大きく、管理組合運営が脆弱。');
            }
        }

        // --- 修繕積立金の適正性（国交省ガイドライン比較） ---
        var shuzen = parseFloat(prop['修繕積立金(円/月)']) || 0;
        var totalFloors = parseFloat(prop['総階数']) || 0;
        if (shuzen > 0 && area > 0) {
            var unitPrice = shuzen / area; // 円/㎡/月
            var standard = 252, low = 165, high = 350;
            if (totalFloors >= 20) { standard = 338; low = 240; high = 450; }
            else if (totalFloors >= 15) { standard = 271; low = 170; high = 400; }
            details.push('修繕積立金単価 ' + unitPrice.toFixed(0) + '円/㎡/月（国交省ガイドライン基準 ' + standard + '円/㎡/月）。');
            if (unitPrice < low) {
                delta -= 2;
                reasons.push('積立金過少(' + unitPrice.toFixed(0) + '円/㎡,-2)');
                details.push('ガイドライン下限を下回り、将来の大規模修繕時に一時金徴収または借入が必要になるリスクが高い。');
            } else if (unitPrice > high) {
                delta -= 1;
                reasons.push('積立金過大(' + unitPrice.toFixed(0) + '円/㎡,-1)');
                details.push('ガイドライン上限を超過。既に修繕不足を積立金増額で解消している可能性があり、背景確認を推奨。');
            } else {
                delta += 1;
                reasons.push('積立金適正(+1)');
                details.push('国交省ガイドラインの適正範囲内。長期修繕計画が概ね健全に機能している目安。');
            }
        }

        // --- 管理組合財務 ---
        var loan = parseFloat(prop['管理組合借入金(万円)']);
        if (!isNaN(loan) && loan > 0) {
            delta -= 2;
            reasons.push('組合借入' + loan + '万円(-2)');
            details.push('管理組合に借入金残高あり。過去の修繕費不足を借入で補填した履歴で、将来の積立金増額圧力が強い。');
        }

        // --- 滞納率 ---
        var taino = parseFloat(prop['滞納世帯率(%)']);
        if (!isNaN(taino)) {
            if (taino >= 10) { delta -= 2; reasons.push('滞納' + taino + '%(-2)'); details.push('滞納率10%超。管理組合運営の破綻リスクが高い危険水域。'); }
            else if (taino >= 5) { delta -= 1; reasons.push('滞納' + taino + '%(-1)'); details.push('滞納率5〜10%。要注意水準で、将来の管理費・積立金改定時に住民トラブル化する可能性。'); }
            else { details.push('滞納率' + taino + '%(良好)。'); }
        }

        // --- 大規模修繕履歴 ---
        var lastRepair = parseFloat(prop['大規模修繕直近年']);
        if (!isNaN(lastRepair) && lastRepair > 0) {
            var yearsSince = new Date().getFullYear() - lastRepair;
            details.push('直近の大規模修繕: ' + lastRepair + '年(' + yearsSince + '年前)。');
            if (yearsSince >= 20) { delta -= 2; reasons.push('修繕20年超未実施(-2)'); details.push('大規模修繕サイクル(12〜18年)を大幅に超過。近い将来に修繕が必須で一時金リスク。'); }
            else if (yearsSince >= 15) { details.push('次回大規模修繕時期が近づいている。長期修繕計画の進捗確認を推奨。'); }
        } else if (age !== null && age >= 15) {
            var repairCount = parseFloat(prop['大規模修繕実施回数']);
            if (!isNaN(repairCount) && repairCount === 0) {
                delta -= 2;
                reasons.push('築' + age + '年で修繕履歴なし(-2)');
                details.push('築15年超にもかかわらず大規模修繕未実施。近々に多額の修繕費が発生する可能性が極めて高い。');
            }
        }

        // --- 長期修繕計画の有無 ---
        if (prop['長期修繕計画'] === 'no') {
            delta -= 1;
            reasons.push('長計未策定(-1)');
            details.push('長期修繕計画が未策定。国交省標準管理規約で策定が義務化されており、管理組合の運営力に疑問。');
        }

        // --- 管理形態 ---
        if (prop['管理形態'] === '自主管理') {
            delta -= 1;
            reasons.push('自主管理(-1)');
            details.push('管理会社委託なしの自主管理。組合員負担が大きく、管理水準の維持に不安。');
        }

        return { delta: delta, reasons: reasons, details: details };
    }

    /**
     * メインスコアリング関数
     * @param {Object} prop - パース済み物件データ
     * @returns {Object} スコアリング結果
     */
    function evaluate(prop) {
        var cat = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().category : 'apartment';
        var mode = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().mode : 'investment';
        prop['カテゴリ'] = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.LABEL[cat] : '一棟収益';
        prop['分析モード'] = mode === 'enduser' ? '実需' : '投資';

        var price = parseFloat(prop['価格(万円)']) || 9999;
        var yld = parseFloat(prop['表面利回り(%)']) || 0;
        var station = extractStationMinutes(prop['駅徒歩(分)']);
        var location = prop['所在地'] || '';
        var structure = prop['構造'] || '';
        var built = prop['築年月'] || '';
        var situation = prop['現況'] || '';
        var fullText = JSON.stringify(prop);

        var areaTier = getAreaTier(location);

        if (areaTier.tier === 0 && areaTier.reason !== '所在地不明') {
            return {
                score: 0,
                rank: 'C',
                priority: 'C(対象外)',
                risk: '高',
                reasons: [areaTier.reason],
                areaReason: areaTier.reason
            };
        }

        var score = 0;
        var reasons = [];

        // === エリア (0-3) ===
        if (areaTier.tier === 1) {
            score += 3;
            reasons.push('主力エリア');
        } else if (areaTier.tier === 2) {
            score += 2;
            reasons.push('準主力エリア');
        } else if (areaTier.tier === 3) {
            if (yld >= 15 && station <= 10) {
                score += 1;
                reasons.push('条件付きOK');
            }
        }

        // === 利回り (0-2) ===
        if (yld >= 15) {
            score += 2;
            reasons.push('利回り' + yld + '%');
        } else if (yld >= 10) {
            score += 1;
            reasons.push('利回り' + yld + '%');
        } else if (yld > 0) {
            reasons.push('利回り' + yld + '%(低)');
        }

        // === 駅距離 (0-1) ===
        if (station <= 10) {
            score += 1;
            reasons.push('駅' + station + '分');
        } else if (station < 99) {
            reasons.push('駅' + station + '分(遠)');
        }

        // === 価格帯 (0-1) ===
        if (price <= 500) {
            score += 1;
            reasons.push(price + '万(低価格帯)');
        }

        // === 賃貸中 (0-1) ===
        if (situation.indexOf('賃貸中') >= 0 || situation.indexOf('満室') >= 0 ||
            fullText.indexOf('賃貸中') >= 0 || fullText.indexOf('オーナーチェンジ') >= 0) {
            score += 1;
            reasons.push('賃貸中(OC)');
        }

        // === 構造・築年 (0-1, -3) ===
        var age = calcBuildingAge(built);
        var isRC = structure.indexOf('RC') >= 0 || structure.indexOf('鉄筋') >= 0 ||
                   structure.indexOf('SRC') >= 0;
        var isSteel = structure.indexOf('鉄骨') >= 0 || structure.indexOf('S造') >= 0;

        if (isRC && age !== null && age <= 30) {
            score += 1;
            reasons.push('RC築' + age + '年');
        } else if (isSteel && age !== null && age <= 20) {
            score += 1;
            reasons.push('鉄骨築' + age + '年');
        } else if (age !== null) {
            reasons.push('築' + age + '年');
        }

        // === 再建築不可チェック ===
        if (fullText.indexOf('再建築不可') >= 0 || fullText.indexOf('建築不可') >= 0) {
            score -= 3;
            reasons.push('再建築不可(-3)');
        }

        // === 積算評価（Phase A） ===
        var appraisal = null;
        if (typeof Appraisal !== 'undefined' && cat !== 'land') {
            appraisal = Appraisal.evaluate(prop);
            if (appraisal) {
                var adj = Appraisal.scoreAdjust(appraisal.ratio);
                score += adj.delta;
                reasons.push(adj.reason);
                prop['積算価格(万円)'] = appraisal.totalValue;
                prop['土地積算(万円)'] = appraisal.landValue;
                prop['建物積算(万円)'] = appraisal.buildingValue;
                prop['積算比(%)'] = appraisal.ratioPct;
                prop['土地単価(万円/㎡)'] = appraisal.pricePerSqm;
                prop['地価出典'] = appraisal.priceSource;
                if (appraisal.maintenanceFactor !== undefined) {
                    prop['維持管理補正'] = appraisal.maintenanceFactor;
                    prop['維持管理要因'] = appraisal.maintenanceLabel;
                }
            }

            // === 収益還元（Phase B） ===
            var income = Appraisal.evaluateIncome(prop);
            if (income) {
                var iadj = Appraisal.incomeScoreAdjust(income.ratio);
                score += iadj.delta;
                reasons.push(iadj.reason);
                prop['NOI(万円/年)'] = income.noi;
                prop['還元利回り(%)'] = income.capRate;
                prop['収益還元価格(万円)'] = income.incomeValue;
                prop['収益還元比(%)'] = income.ratioPct;
            }

            // === 融資適性判定 ===
            var fin = Appraisal.evaluateFinancing(prop, appraisal, income);
            if (fin) {
                prop['融資判定'] = fin.verdict;
                prop['想定融資期間(年)'] = fin.loanYears;
                prop['想定LTV(%)'] = fin.ltv;
                prop['想定融資額(万円)'] = fin.loanAmount;
                prop['想定年間返済(万円)'] = fin.annualPayment;
                if (fin.dscr !== null) prop['DSCR'] = fin.dscr;
                prop['__financing'] = fin;
            }
        }

        // === ハザード評価（Phase B） ===
        if (typeof HazardCheck !== 'undefined') {
            var hz = HazardCheck.evaluate(prop);
            if (hz) {
                score += hz.delta;
                if (hz.delta !== 0) reasons.push(hz.reason);
                prop['ハザード津波'] = hz.tsunami;
                prop['ハザード洪水'] = hz.flood;
                prop['ハザード土砂'] = hz.landslide;
                prop['ハザード備考'] = hz.note;
            }
        }

        // === 用途地域・接道（Phase B） ===
        var zoning = prop['用途地域'] || '';
        var road = prop['接道'] || '';
        if (zoning.indexOf('商業') >= 0) {
            score += 1; reasons.push('商業地域(+1)');
        } else if (zoning.indexOf('近隣商業') >= 0) {
            score += 1; reasons.push('近隣商業(+1)');
        } else if (zoning.indexOf('市街化調整') >= 0) {
            score -= 2; reasons.push('市街化調整区域(-2)');
        }
        // 接道2m未満・幅員4m未満
        var roadWidthM = road.match(/幅員?\s*([\d.]+)\s*m/);
        if (roadWidthM && parseFloat(roadWidthM[1]) < 4) {
            score -= 1; reasons.push('幅員' + roadWidthM[1] + 'm(要セットバック)');
        }
        var roadTouchM = road.match(/接道\s*([\d.]+)\s*m/) || road.match(/間口\s*([\d.]+)\s*m/);
        if (roadTouchM && parseFloat(roadTouchM[1]) < 2) {
            score -= 2; reasons.push('接道<2m(再建築困難)');
        }

        // === 区分マンション固有評価 ===
        if (cat === 'condo') {
            var cArea = parseFloat(prop['面積(㎡)']) || parseFloat(prop['専有面積(㎡)']) || 0;
            var condoRes = evaluateCondoHealth(prop, age, cArea);
            score += condoRes.delta;
            if (condoRes.reasons.length) {
                for (var cri = 0; cri < condoRes.reasons.length; cri++) reasons.push(condoRes.reasons[cri]);
            }
            prop['区分健全性_詳細'] = condoRes.details;
        }

        // === 実質利回りチェック ===
        if (yld > 0 && price > 0) {
            var netYield = yld * 0.75; // 概算: 表面の75%
            if (netYield < 5) {
                score -= 2;
                reasons.push('実質' + netYield.toFixed(1) + '%(要注意)');
            }
            prop['実質利回り概算(%)'] = netYield.toFixed(1);
        }

        // === 将来価値スコア（実需モードで重視） ===
        if (typeof MarketData !== 'undefined') {
            var fv = MarketData.futureValueScore(prop);
            prop['将来価値スコア'] = fv.score;
            prop['人口推計2050(%)'] = fv.popChange;
            prop['ブランド指数'] = fv.brand;
            if (mode === 'enduser') {
                // 実需モードでは将来価値を主軸に加算（投資系減点は維持）
                score = Math.round(fv.score * 1.2);
                reasons = fv.reasons.slice();
                // ハザードと融資は実需でも参考
                reasons.push('（実需モード: 将来価値重視）');
            } else {
                // 投資モードでは参考程度（最大+1）
                if (fv.score >= 8) { score += 1; reasons.push('将来価値高(' + fv.score + '/10)'); }
            }
        }

        // スコアは0以下にしない
        if (score < 0) score = 0;

        // ランク判定（Phase B統合で最大約15点）
        var rank, priority, risk;
        if (score >= 11) {
            rank = 'S'; priority = 'S(即日)'; risk = '低';
        } else if (score >= 7) {
            rank = 'A'; priority = 'A(今週)'; risk = '中低';
        } else if (score >= 3) {
            rank = 'B'; priority = 'B(今月)'; risk = '中';
        } else {
            rank = 'C'; priority = 'C(見送り)'; risk = '高';
        }

        return {
            score: score,
            rank: rank,
            priority: priority,
            risk: risk,
            reasons: reasons,
            areaReason: areaTier.reason,
            netYield: prop['実質利回り概算(%)'] || null,
            buildingAge: age
        };
    }

    /**
     * 物件配列を一括スコアリング
     * @param {Array} properties
     * @returns {Array} スコア付き物件配列（スコア降順）
     */
    function evaluateAll(properties) {
        var results = [];

        for (var i = 0; i < properties.length; i++) {
            var prop = properties[i];
            var result = evaluate(prop);

            // スコアリング結果を物件データにマージ
            prop['スコア'] = result.score;
            prop['評価ランク'] = result.rank;
            prop['優先度'] = result.priority;
            prop['リスク評価'] = result.risk;
            prop['エリア評価'] = result.areaReason;
            prop['判断根拠'] = result.reasons.join(' / ');
            if (result.netYield) prop['実質利回り概算(%)'] = result.netYield;
            if (result.buildingAge !== null) prop['築年数'] = result.buildingAge;

            // 詳細説明文を生成（HTML表示・エクスポート両対応）
            if (typeof Explanation !== 'undefined') {
                prop['積算評価_説明'] = Explanation.appraisal(prop);
                if (Explanation.condoHealth) prop['区分健全性_説明'] = Explanation.condoHealth(prop);
                prop['収益還元_説明'] = Explanation.income(prop);
                prop['ハザード_説明'] = Explanation.hazard(prop);
                prop['融資判定_説明'] = Explanation.financing(prop);
                prop['将来価値_説明'] = Explanation.futureValue(prop);
                prop['総合判定_説明'] = Explanation.overall(prop);
                prop['詳細分析レポート'] = Explanation.buildAll(prop);
            }

            results.push(prop);
        }

        // スコア降順ソート
        results.sort(function(a, b) {
            return (b['スコア'] || 0) - (a['スコア'] || 0);
        });

        return results;
    }

    /**
     * reinfolib 空間API統合による追加スコアリング（非同期）
     * 物件の所在地をジオコーディングし、ハザード/都市計画/生活環境/人口推計を反映。
     *
     * 既存のevaluateAll後に呼び出す想定。
     * スコア/reasons/構造化データを物件オブジェクトへ追記してPromise<prop>を返す。
     */
    function enhanceWithGeo(prop) {
        if (typeof Geocoder === 'undefined' || typeof ReinfolibClient === 'undefined') {
            return Promise.resolve(prop);
        }
        var loc = prop['所在地'];
        if (!loc) return Promise.resolve(prop);

        // reinfolib 未設定なら即終了
        if (!localStorage.getItem('reinfolib_proxy_url') &&
            !localStorage.getItem('reinfolib_api_key')) {
            return Promise.resolve(prop);
        }

        return Geocoder.geocode(loc).then(function(geo) {
            prop['__geo'] = geo;
            prop['緯度'] = geo.lat;
            prop['経度'] = geo.lng;

            var tasks = [];
            var hazardRes = null, cityRes = null, amenRes = null, popRes = null;

            if (typeof HazardGeo !== 'undefined') {
                tasks.push(HazardGeo.evaluate(geo.lat, geo.lng).then(function(r) { hazardRes = r; }));
            }
            if (typeof CityPlanGeo !== 'undefined') {
                tasks.push(CityPlanGeo.evaluate(geo.lat, geo.lng).then(function(r) { cityRes = r; }));
            }
            if (typeof AmenityGeo !== 'undefined') {
                tasks.push(AmenityGeo.evaluate(geo.lat, geo.lng).then(function(r) { amenRes = r; }));
            }
            if (typeof PopulationGeo !== 'undefined') {
                tasks.push(PopulationGeo.evaluate(geo.lat, geo.lng).then(function(r) { popRes = r; }));
            }

            return Promise.all(tasks).then(function() {
                var score = prop['スコア'] || 0;
                var extraReasons = [];

                // 既存のhazard.js（市区町村ベース）で既に計上済みの減点を除算しないよう注意
                // ジオハザードは市区町村ベースより精度が高いので、市区町村ベースは加算しない
                // 既存evaluateで加算済みの都市計画（商業地域+1等）とはハサミ打ちになるが、
                // ジオ側(XKT002)は用途地域特化で細かいので上書き優先とする

                if (hazardRes) {
                    score += hazardRes.totalDelta;
                    hazardRes.hits.forEach(function(h) {
                        extraReasons.push(h.label + '(' + (h.delta >= 0 ? '+' : '') + h.delta + ')');
                    });
                    prop['__hazardGeo'] = hazardRes;
                }
                if (cityRes) {
                    score += cityRes.totalDelta;
                    cityRes.hits.forEach(function(h) {
                        extraReasons.push(h.label + '(' + (h.delta >= 0 ? '+' : '') + h.delta + ')');
                    });
                    prop['__cityPlan'] = cityRes;
                    if (cityRes.useZone && !prop['用途地域']) prop['用途地域'] = cityRes.useZone;
                }
                if (amenRes) {
                    score += amenRes.totalDelta;
                    amenRes.hits.forEach(function(h) {
                        extraReasons.push(h.label + '(' + (h.delta >= 0 ? '+' : '') + h.delta + ')');
                    });
                    prop['__amenity'] = amenRes;
                }
                if (popRes && popRes.available) {
                    score += popRes.delta;
                    extraReasons.push(popRes.label + '(' + (popRes.delta >= 0 ? '+' : '') + popRes.delta + ')');
                    prop['__population'] = popRes;
                }

                // スコア再計算: 0未満にはしない
                if (score < 0) score = 0;
                score = Math.round(score * 10) / 10;

                prop['スコア'] = score;
                prop['判断根拠'] = (prop['判断根拠'] || '') +
                    (extraReasons.length ? ' / ' + extraReasons.join(' / ') : '');

                // ランク再判定
                if (score >= 11) { prop['評価ランク'] = 'S'; prop['優先度'] = 'S(即日)'; prop['リスク評価'] = '低'; }
                else if (score >= 7) { prop['評価ランク'] = 'A'; prop['優先度'] = 'A(今週)'; prop['リスク評価'] = '中低'; }
                else if (score >= 3) { prop['評価ランク'] = 'B'; prop['優先度'] = 'B(今月)'; prop['リスク評価'] = '中'; }
                else { prop['評価ランク'] = 'C'; prop['優先度'] = 'C(見送り)'; prop['リスク評価'] = '高'; }

                // 詳細レポート再生成（geoPinpointを含む）
                if (typeof Explanation !== 'undefined' && Explanation.buildAll) {
                    prop['ピンポイント評価_説明'] = Explanation.geoPinpoint(prop);
                    prop['詳細分析レポート'] = Explanation.buildAll(prop);
                }

                return prop;
            });
        }).catch(function(err) {
            prop['__geoError'] = err.message;
            return prop;
        });
    }

    /**
     * 複数物件への空間スコアリング一括適用
     * 並列度は抑える（reinfolibプロキシの60req/min制限を考慮し直列）
     */
    function enhanceAllWithGeo(properties, progressCb) {
        var chain = Promise.resolve();
        var total = properties.length;
        properties.forEach(function(prop, idx) {
            chain = chain.then(function() {
                if (progressCb) progressCb(idx, total, prop);
                return enhanceWithGeo(prop);
            });
        });
        return chain.then(function() {
            // 再ソート
            properties.sort(function(a, b) { return (b['スコア'] || 0) - (a['スコア'] || 0); });
            return properties;
        });
    }

    return {
        evaluate: evaluate,
        evaluateAll: evaluateAll,
        enhanceWithGeo: enhanceWithGeo,
        enhanceAllWithGeo: enhanceAllWithGeo,
        getAreaTier: getAreaTier,
        calcBuildingAge: calcBuildingAge
    };

})();
