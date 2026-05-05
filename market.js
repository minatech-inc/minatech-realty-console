/**
 * 市場リサーチ・将来価値データモジュール
 *
 * - 将来人口推計（国立社会保障・人口問題研究所 2018年推計、主要市町村 2020→2050 人口変化率）
 * - リセール率・エリアブランド指数（東京カンテイ等の公表データ参考）
 * - 国交省不動産情報ライブラリAPI連携（取引価格情報）
 */
var MarketData = (function() {
    'use strict';

    // 2020年比 2050年予測人口変化率（%）
    // 国立社会保障・人口問題研究所「日本の地域別将来推計人口（平成30年推計）」主要都市抜粋
    var POP_CHANGE_2050 = {
        // 東京23区（都心部は増加 or 横ばい）
        '千代田区': 15, '中央区': 20, '港区': 10, '江東区': 8, '品川区': 5,
        '目黒区': 2, '渋谷区': 3, '新宿区': 0, '文京区': 5, '台東区': 0,
        '墨田区': -3, '大田区': -5, '世田谷区': -2, '中野区': -3, '杉並区': -5,
        '豊島区': -3, '北区': -8, '荒川区': -5, '板橋区': -8, '練馬区': -5,
        '足立区': -12, '葛飾区': -13, '江戸川区': -8,
        // 東京都下
        '武蔵野市': 0, '三鷹市': -3, '調布市': -5, '立川市': -8, '八王子市': -15,
        '町田市': -13, '府中市': -5,
        // 横浜川崎
        '横浜市西区': 5, '横浜市中区': 0, '横浜市神奈川区': -5, '横浜市港北区': -3,
        '横浜市都筑区': -3, '横浜市青葉区': -8, '横浜市緑区': -12, '横浜市戸塚区': -10,
        '横浜市': -10, '川崎市中原区': 3, '川崎市幸区': 0, '川崎市高津区': -5,
        '川崎市宮前区': -10, '川崎市麻生区': -12, '川崎市': -6,
        // 湘南（重点）
        '鎌倉市': -18, '逗子市': -20, '葉山町': -22, '藤沢市': -10, '茅ヶ崎市': -15,
        '平塚市': -20, '大磯町': -25, '二宮町': -28, '小田原市': -22, '横須賀市': -28,
        '相模原市': -15, '厚木市': -18, '海老名市': -10, '座間市': -18,
        // 千葉
        '浦安市': -5, '市川市': -8, '船橋市': -10, '千葉市': -12, '柏市': -15, '松戸市': -15,
        // 埼玉
        'さいたま市': -5, '川口市': -10, '所沢市': -15, '川越市': -15,
        // 関西
        '大阪市北区': 5, '大阪市中央区': 10, '大阪市西区': 8, '大阪市': -10,
        '京都市': -15, '神戸市': -18, '西宮市': -12, '芦屋市': -10,
        // 中部
        '名古屋市中区': 5, '名古屋市': -8,
        // 九州
        '福岡市中央区': 5, '福岡市': -3
    };

    // エリアブランド指数（リセールバリュー傾向）1.0=平均、1.2=優良、0.8=劣化
    var BRAND_INDEX = {
        '千代田区': 1.30, '中央区': 1.25, '港区': 1.30, '渋谷区': 1.28, '目黒区': 1.22,
        '文京区': 1.20, '世田谷区': 1.15, '杉並区': 1.10, '品川区': 1.15, '新宿区': 1.15,
        '武蔵野市': 1.20, '国分寺市': 1.10,
        '鎌倉市': 1.18, '葉山町': 1.20, '芦屋市': 1.25, '西宮市': 1.10,
        '横浜市西区': 1.15, '横浜市中区': 1.15, '横浜市青葉区': 1.10, '川崎市中原区': 1.12,
        '藤沢市': 1.05, '茅ヶ崎市': 1.03
    };

    function lookupPopChange(location) {
        if (!location) return null;
        for (var key in POP_CHANGE_2050) {
            if (location.indexOf(key) >= 0) return { value: POP_CHANGE_2050[key], area: key };
        }
        return null;
    }

    function lookupBrand(location) {
        if (!location) return 1.0;
        for (var key in BRAND_INDEX) {
            if (location.indexOf(key) >= 0) return BRAND_INDEX[key];
        }
        return 1.0;
    }

    // 将来価値スコア（実需モード用）0-10点
    function futureValueScore(prop) {
        var loc = prop['所在地'] || '';
        var pop = lookupPopChange(loc);
        var brand = lookupBrand(loc);
        var score = 5; // 基準点
        var reasons = [];

        if (pop) {
            if (pop.value >= 5) { score += 3; reasons.push('人口増加予測(+' + pop.value + '%/2050年)'); }
            else if (pop.value >= 0) { score += 2; reasons.push('人口横ばい(' + pop.value + '%)'); }
            else if (pop.value >= -10) { score += 1; reasons.push('人口微減(' + pop.value + '%)'); }
            else if (pop.value >= -20) { score -= 1; reasons.push('人口減少(' + pop.value + '%)'); }
            else { score -= 3; reasons.push('人口大幅減(' + pop.value + '%)'); }
        }

        if (brand >= 1.20) { score += 2; reasons.push('高ブランドエリア(×' + brand + ')'); }
        else if (brand >= 1.10) { score += 1; reasons.push('ブランドエリア(×' + brand + ')'); }
        else if (brand < 0.95) { score -= 1; reasons.push('低評価エリア(×' + brand + ')'); }

        // 駅距離で加減（駅徒歩が取得できた場合のみ）
        var m = (prop['駅徒歩(分)'] || '').match(/(\d+)\s*分/);
        if (m) {
            var stationMin = parseInt(m[1]);
            if (stationMin <= 5) { score += 1; reasons.push('駅近' + stationMin + '分'); }
            else if (stationMin >= 20) { score -= 1; reasons.push('駅遠' + stationMin + '分'); }
        }

        if (score < 0) score = 0;
        if (score > 10) score = 10;

        return {
            score: score,
            popChange: pop ? pop.value : null,
            popArea: pop ? pop.area : null,
            brand: brand,
            reasons: reasons
        };
    }

    // 所在地 → (prefCode, cityCode) 解決用マップ（国交省コード体系 JIS X 0402 準拠）
    // 主要対象エリア（湘南・23区・横浜川崎・主要政令市）
    var CITY_CODES = {
        // 東京都 (13)
        '千代田区': ['13','13101'], '中央区': ['13','13102'], '港区': ['13','13103'],
        '新宿区': ['13','13104'], '文京区': ['13','13105'], '台東区': ['13','13106'],
        '墨田区': ['13','13107'], '江東区': ['13','13108'], '品川区': ['13','13109'],
        '目黒区': ['13','13110'], '大田区': ['13','13111'], '世田谷区': ['13','13112'],
        '渋谷区': ['13','13113'], '中野区': ['13','13114'], '杉並区': ['13','13115'],
        '豊島区': ['13','13116'], '北区': ['13','13117'], '荒川区': ['13','13118'],
        '板橋区': ['13','13119'], '練馬区': ['13','13120'], '足立区': ['13','13121'],
        '葛飾区': ['13','13122'], '江戸川区': ['13','13123'],
        '武蔵野市': ['13','13203'], '三鷹市': ['13','13204'], '府中市': ['13','13206'],
        '調布市': ['13','13208'], '町田市': ['13','13209'], '八王子市': ['13','13201'],
        '立川市': ['13','13202'],
        // 神奈川県 (14) - 湘南重点
        '横浜市西区': ['14','14103'], '横浜市中区': ['14','14104'],
        '横浜市神奈川区': ['14','14102'], '横浜市港北区': ['14','14109'],
        '横浜市都筑区': ['14','14118'], '横浜市青葉区': ['14','14117'],
        '横浜市戸塚区': ['14','14110'], '横浜市緑区': ['14','14113'],
        '川崎市中原区': ['14','14133'], '川崎市幸区': ['14','14132'],
        '川崎市高津区': ['14','14134'], '川崎市宮前区': ['14','14135'],
        '鎌倉市': ['14','14204'], '逗子市': ['14','14208'], '葉山町': ['14','14301'],
        '藤沢市': ['14','14205'], '茅ヶ崎市': ['14','14207'], '平塚市': ['14','14203'],
        '大磯町': ['14','14321'], '二宮町': ['14','14322'], '小田原市': ['14','14206'],
        '横須賀市': ['14','14201'], '相模原市': ['14','14150'], '厚木市': ['14','14212'],
        '海老名市': ['14','14215'], '座間市': ['14','14216'],
        // 千葉県 (12)
        '浦安市': ['12','12227'], '市川市': ['12','12203'], '船橋市': ['12','12204'],
        '柏市': ['12','12217'], '松戸市': ['12','12207'],
        // 埼玉県 (11)
        '川口市': ['11','11203'], '所沢市': ['11','11208'], '川越市': ['11','11201'],
        // 大阪 (27)
        '大阪市北区': ['27','27127'], '大阪市中央区': ['27','27128'],
        '大阪市西区': ['27','27106'],
        // 兵庫 (28)
        '西宮市': ['28','28204'], '芦屋市': ['28','28206'],
        // 愛知 (23)
        '名古屋市中区': ['23','23106'],
        // 福岡 (40)
        '福岡市中央区': ['40','40133']
    };

    function resolveAreaCode(location) {
        if (!location) return null;
        for (var key in CITY_CODES) {
            if (location.indexOf(key) >= 0) {
                return { prefCode: CITY_CODES[key][0], cityCode: CITY_CODES[key][1], name: key };
            }
        }
        return null;
    }

    // 取引事例との価格乖離比較（専有面積ベース 万円/㎡）
    // txns: APIの data 配列（TradePrice, Area, etc を含むオブジェクト）
    function compareToMarket(prop, txns) {
        if (!txns || !txns.length) return null;
        var unitPrices = [];
        txns.forEach(function(t) {
            var price = parseFloat(t.TradePrice);
            var area = parseFloat(t.Area);
            if (price > 0 && area > 0) {
                unitPrices.push((price / 10000) / area); // 万円/㎡
            }
        });
        if (unitPrices.length < 3) return null;
        unitPrices.sort(function(a,b){return a-b;});
        var mid = Math.floor(unitPrices.length / 2);
        var median = unitPrices.length % 2 === 0
            ? (unitPrices[mid-1] + unitPrices[mid]) / 2
            : unitPrices[mid];
        var propPrice = parseFloat(prop['価格(万円)']);
        var propArea = parseFloat(prop['土地面積(㎡)']) || parseFloat(prop['延床面積(㎡)']);
        if (!(propPrice > 0) || !(propArea > 0)) return null;
        var propUnit = propPrice / propArea;
        var delta = ((propUnit - median) / median) * 100;
        return {
            sample: unitPrices.length,
            marketMedian: Math.round(median * 10) / 10,
            propUnit: Math.round(propUnit * 10) / 10,
            deltaPct: Math.round(delta * 10) / 10
        };
    }

    // 国交省不動産情報ライブラリAPI（取引価格情報取得）
    // プロキシ経由優先、未設定時は直接呼出（CORS可能性あり）
    // https://www.reinfolib.mlit.go.jp/help/apiManual/
    function fetchTransactionPrices(prefCode, cityCode, year) {
        var proxyUrl = localStorage.getItem('reinfolib_proxy_url');
        var directKey = localStorage.getItem('reinfolib_api_key');
        var qs = '?year=' + year + '&area=' + prefCode + '&city=' + cityCode;
        var url, headers;
        if (proxyUrl) {
            url = proxyUrl.replace(/\/$/, '') + '/XIT001' + qs;
            headers = {};
        } else if (directKey) {
            url = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001' + qs;
            headers = { 'Ocp-Apim-Subscription-Key': directKey };
        } else {
            return Promise.reject(new Error('プロキシURLまたはAPIキー未設定'));
        }
        return fetch(url, { headers: headers }).then(function(r) {
            if (!r.ok) throw new Error('API ' + r.status);
            return r.json();
        });
    }

    return {
        lookupPopChange: lookupPopChange,
        lookupBrand: lookupBrand,
        futureValueScore: futureValueScore,
        fetchTransactionPrices: fetchTransactionPrices,
        resolveAreaCode: resolveAreaCode,
        compareToMarket: compareToMarket
    };
})();
