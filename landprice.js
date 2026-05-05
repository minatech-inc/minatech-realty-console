/**
 * 動的地価取得モジュール
 * 国交省 不動産情報ライブラリ API: XPT002（地価公示・地価調査のポイント）
 * https://www.reinfolib.mlit.go.jp/help/apiManual/
 *
 * - 市区町村コードで該当地点を取得
 * - 住宅地（01）優先で中央値を算出
 * - localStorageに1年キャッシュ（キー: lp_cache_{prefCode}_{cityCode}_{year}）
 *
 * 注: 旧コードはXCT001を使用していたが、XCT001は鑑定評価書情報API。
 *     地価公示・地価調査の点データはXPT002が正しい。
 */
var LandPriceAPI = (function() {
    'use strict';

    var CACHE_TTL_MS = 365 * 24 * 3600 * 1000; // 1年

    function cacheKey(prefCode, cityCode, year) {
        return 'lp_cache_' + prefCode + '_' + cityCode + '_' + year;
    }

    function readCache(prefCode, cityCode, year) {
        try {
            var raw = localStorage.getItem(cacheKey(prefCode, cityCode, year));
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
            return obj.value;
        } catch (e) { return null; }
    }

    function writeCache(prefCode, cityCode, year, value) {
        try {
            localStorage.setItem(cacheKey(prefCode, cityCode, year),
                JSON.stringify({ ts: Date.now(), value: value }));
        } catch (e) {}
    }

    // 地価公示データから住宅地の中央値（万円/㎡）を算出
    function computeMedianPrice(features) {
        if (!features || !features.length) return null;
        var prices = [];
        var residential = [];
        features.forEach(function(f) {
            var p = f.properties || f;
            // priorYearPrice or currentYearPrice (円/㎡) → 万円/㎡
            var price = parseFloat(p.u_current_years_price_ja || p.currentYearPrice || p.price);
            if (!(price > 0)) return;
            var unitPriceMan = price / 10000;
            prices.push(unitPriceMan);
            var useCategory = String(p.u_use_category_name_ja || p.useCategory || '');
            if (useCategory.indexOf('住宅') >= 0) residential.push(unitPriceMan);
        });
        var pool = residential.length >= 3 ? residential : prices;
        if (pool.length === 0) return null;
        pool.sort(function(a,b){return a-b;});
        var mid = Math.floor(pool.length / 2);
        var median = pool.length % 2 === 0 ? (pool[mid-1] + pool[mid]) / 2 : pool[mid];
        return {
            pricePerSqm: Math.round(median * 10) / 10,
            sample: pool.length,
            useCategory: residential.length >= 3 ? '住宅地' : '全用途'
        };
    }

    // reinfolib XPT002 呼び出し（プロキシ経由優先）
    function fetchLandPrice(prefCode, cityCode, year) {
        var proxyUrl = localStorage.getItem('reinfolib_proxy_url');
        var directKey = localStorage.getItem('reinfolib_api_key');
        if (!proxyUrl && !directKey) return Promise.reject(new Error('プロキシURLまたはAPIキー未設定'));
        var y = year || (new Date().getFullYear() - 1);
        var cached = readCache(prefCode, cityCode, y);
        if (cached) return Promise.resolve(cached);

        var qs = '?response_format=geojson&year=' + y +
                 '&administrative_area_code=' + cityCode + '&z=14';
        var url, headers;
        if (proxyUrl) {
            url = proxyUrl.replace(/\/$/, '') + '/XPT002' + qs;
            headers = {};
        } else {
            url = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002' + qs;
            headers = { 'Ocp-Apim-Subscription-Key': directKey };
        }
        return fetch(url, { headers: headers })
            .then(function(r) {
                if (!r.ok) throw new Error('API ' + r.status);
                return r.json();
            })
            .then(function(json) {
                var features = json && (json.features || json.data) || [];
                var result = computeMedianPrice(features);
                if (result) {
                    result.source = 'reinfolib地価公示' + y + '(' + result.useCategory + '・' + result.sample + '地点中央値)';
                    writeCache(prefCode, cityCode, y, result);
                }
                return result;
            });
    }

    // 所在地文字列から地価取得（MarketData.resolveAreaCode に依存）
    function fetchByLocation(location) {
        if (typeof MarketData === 'undefined' || !MarketData.resolveAreaCode) {
            return Promise.reject(new Error('MarketData未ロード'));
        }
        var area = MarketData.resolveAreaCode(location);
        if (!area) return Promise.reject(new Error('エリアコード解決不可: ' + location));
        return fetchLandPrice(area.prefCode, area.cityCode);
    }

    return {
        fetchLandPrice: fetchLandPrice,
        fetchByLocation: fetchByLocation,
        computeMedianPrice: computeMedianPrice
    };
})();
