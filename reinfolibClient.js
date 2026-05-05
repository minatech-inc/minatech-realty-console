/**
 * reinfolib 汎用クライアント
 *
 * 複数のXKT系エンドポイントを共通IFで呼び出すためのクライアント。
 * - プロキシ or 直接APIキー両対応
 * - localStorageキャッシュ（30日）
 * - 緯度経度 or 市区町村コード、両方の呼び出し方式に対応
 */
var ReinfolibClient = (function() {
    'use strict';

    var CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

    function cacheKey(endpoint, qs) {
        return 'rf_' + endpoint + '_' + qs;
    }

    function readCache(endpoint, qs) {
        try {
            var raw = localStorage.getItem(cacheKey(endpoint, qs));
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
            return obj.value;
        } catch (e) { return null; }
    }

    function writeCache(endpoint, qs, value) {
        try {
            localStorage.setItem(cacheKey(endpoint, qs),
                JSON.stringify({ ts: Date.now(), value: value }));
        } catch (e) {
            // LocalStorage quota超過時は古いrf_*キャッシュを削除して再試行
            purgeOldest('rf_', 20);
            try {
                localStorage.setItem(cacheKey(endpoint, qs),
                    JSON.stringify({ ts: Date.now(), value: value }));
            } catch (e2) {}
        }
    }

    function purgeOldest(prefix, count) {
        var items = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(prefix) === 0) {
                try {
                    var obj = JSON.parse(localStorage.getItem(key));
                    items.push({ key: key, ts: obj.ts || 0 });
                } catch (e) {}
            }
        }
        items.sort(function(a, b) { return a.ts - b.ts; });
        for (var j = 0; j < Math.min(count, items.length); j++) {
            localStorage.removeItem(items[j].key);
        }
    }

    function buildUrl(endpoint, params) {
        var parts = [];
        for (var k in params) {
            if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
            }
        }
        var qs = parts.length ? '?' + parts.join('&') : '';
        var proxyUrl = localStorage.getItem('reinfolib_proxy_url');
        var directKey = localStorage.getItem('reinfolib_api_key');
        var url, headers;
        if (proxyUrl) {
            url = proxyUrl.replace(/\/$/, '') + '/' + endpoint + qs;
            headers = {};
        } else if (directKey) {
            url = 'https://www.reinfolib.mlit.go.jp/ex-api/external/' + endpoint + qs;
            headers = { 'Ocp-Apim-Subscription-Key': directKey };
        } else {
            return null;
        }
        return { url: url, headers: headers, qs: qs };
    }

    /**
     * タイルZXY指定でGeoJSONを取得
     * @param {string} endpoint - 'XKT026' 等
     * @param {number} z - zoomレベル (11-14)
     * @param {number} x - tile X
     * @param {number} y - tile Y
     * @param {object} extraParams - 追加パラメータ（yearなど）
     */
    function fetchByTile(endpoint, z, x, y, extraParams) {
        var params = Object.assign({
            response_format: 'geojson',
            z: z, x: x, y: y
        }, extraParams || {});
        var built = buildUrl(endpoint, params);
        if (!built) return Promise.reject(new Error('reinfolib未設定（プロキシURLまたはAPIキー）'));

        var cached = readCache(endpoint, built.qs);
        if (cached) return Promise.resolve(cached);

        return fetch(built.url, { headers: built.headers })
            .then(function(r) {
                if (!r.ok) {
                    // 404はその地点にデータなし（空のFeatureCollectionとして返す）
                    if (r.status === 404) return { type: 'FeatureCollection', features: [] };
                    throw new Error(endpoint + ' ' + r.status);
                }
                return r.json();
            })
            .then(function(json) {
                var result = json || { type: 'FeatureCollection', features: [] };
                writeCache(endpoint, built.qs, result);
                return result;
            });
    }

    /**
     * 市区町村コード指定でデータ取得
     */
    function fetchByCity(endpoint, cityCode, extraParams) {
        var params = Object.assign({
            response_format: 'geojson',
            administrative_area_code: cityCode
        }, extraParams || {});
        var built = buildUrl(endpoint, params);
        if (!built) return Promise.reject(new Error('reinfolib未設定'));

        var cached = readCache(endpoint, built.qs);
        if (cached) return Promise.resolve(cached);

        return fetch(built.url, { headers: built.headers })
            .then(function(r) {
                if (!r.ok) {
                    if (r.status === 404) return { type: 'FeatureCollection', features: [] };
                    throw new Error(endpoint + ' ' + r.status);
                }
                return r.json();
            })
            .then(function(json) {
                var result = json || { type: 'FeatureCollection', features: [] };
                writeCache(endpoint, built.qs, result);
                return result;
            });
    }

    // 点(lat,lng)がFeatureCollectionのどのFeatureに含まれるかを返す（複数可）
    function featuresContaining(collection, lat, lng) {
        var out = [];
        if (!collection || !collection.features) return out;
        collection.features.forEach(function(f) {
            if (!f.geometry) return;
            var g = f.geometry;
            if (g.type === 'Polygon') {
                if (Geocoder.pointInPolygon(lat, lng, g.coordinates)) out.push(f);
            } else if (g.type === 'MultiPolygon') {
                for (var i = 0; i < g.coordinates.length; i++) {
                    if (Geocoder.pointInPolygon(lat, lng, [g.coordinates[i][0]])) {
                        out.push(f); break;
                    }
                }
            }
        });
        return out;
    }

    // 点からFeatureCollectionの各Feature(Point/Polygon重心)への距離を列挙
    function featuresWithDistance(collection, lat, lng, maxMeters) {
        var out = [];
        if (!collection || !collection.features) return out;
        collection.features.forEach(function(f) {
            if (!f.geometry) return;
            var g = f.geometry;
            var center = null;
            if (g.type === 'Point') {
                center = { lat: g.coordinates[1], lng: g.coordinates[0] };
            } else if (g.type === 'Polygon') {
                center = polygonCentroid(g.coordinates[0]);
            } else if (g.type === 'MultiPolygon') {
                center = polygonCentroid(g.coordinates[0][0]);
            }
            if (!center) return;
            var dist = Geocoder.distance(lat, lng, center.lat, center.lng);
            if (!maxMeters || dist <= maxMeters) {
                out.push({ feature: f, distance: dist });
            }
        });
        out.sort(function(a, b) { return a.distance - b.distance; });
        return out;
    }

    function polygonCentroid(ring) {
        if (!ring || ring.length === 0) return null;
        var sumLng = 0, sumLat = 0;
        ring.forEach(function(p) { sumLng += p[0]; sumLat += p[1]; });
        return { lat: sumLat / ring.length, lng: sumLng / ring.length };
    }

    return {
        fetchByTile: fetchByTile,
        fetchByCity: fetchByCity,
        featuresContaining: featuresContaining,
        featuresWithDistance: featuresWithDistance
    };
})();
