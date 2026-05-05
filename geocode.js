/**
 * ジオコーダー: 住所文字列 → 緯度経度
 *
 * 使用API: 国土地理院ジオコーダー (無料・認証不要・CORS対応)
 *   https://msearch.gsi.go.jp/address-search/AddressSearch?q={addr}
 *
 * 用途: reinfolib の空間APIを物件ピンポイントで叩くための緯度経度を取得
 *
 * 戻り値: { lat, lng, matchedTitle, level }
 *   level は国土地理院のマッチレベル:
 *     1=都道府県, 2=市区町村, 3=町丁目, 4=街区, 5=住居番号, 8=住所
 */
var Geocoder = (function() {
    'use strict';

    var CACHE_TTL_MS = 365 * 24 * 3600 * 1000;
    var GSI_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

    function cacheKey(addr) { return 'geo_cache_' + addr; }

    function readCache(addr) {
        try {
            var raw = localStorage.getItem(cacheKey(addr));
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
            return obj.value;
        } catch (e) { return null; }
    }

    function writeCache(addr, value) {
        try {
            localStorage.setItem(cacheKey(addr),
                JSON.stringify({ ts: Date.now(), value: value }));
        } catch (e) {}
    }

    // 所在地の注釈・余剰情報を除去
    function cleanAddress(addr) {
        if (!addr) return '';
        return addr
            .replace(/（[^）]*）|\([^)]*\)/g, ' ')  // 括弧注釈
            .replace(/他\d+筆|他[一二三四五六七八九十]+筆/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 住所を段階的に短縮（失敗時フォールバック用）
    // "神奈川県茅ヶ崎市松が丘2丁目2562番18" → ["...2562番18", "...2丁目", "茅ヶ崎市松が丘"]
    function buildFallbacks(addr) {
        var trials = [addr];
        // 番地を削る
        var withoutBanchi = addr.replace(/\d+番\d+号?.*$/, '').trim();
        if (withoutBanchi && withoutBanchi !== addr) trials.push(withoutBanchi);
        // 丁目より下を削る
        var uptoChoume = addr.match(/^(.+?\d+丁目)/);
        if (uptoChoume && trials.indexOf(uptoChoume[1]) < 0) trials.push(uptoChoume[1]);
        // 字・大字を含む場合は市区町村+町名まで
        var uptoMachi = addr.match(/^(.+?(?:市|区|町|村)[^\d０-９]{1,10})/);
        if (uptoMachi && trials.indexOf(uptoMachi[1]) < 0) trials.push(uptoMachi[1]);
        // 市区町村のみ
        var uptoCity = addr.match(/^(.+?(?:市|区|町|村))/);
        if (uptoCity && trials.indexOf(uptoCity[1]) < 0) trials.push(uptoCity[1]);
        return trials;
    }

    function fetchOne(query) {
        var url = GSI_URL + '?q=' + encodeURIComponent(query);
        return fetch(url)
            .then(function(r) {
                if (!r.ok) throw new Error('GSI ' + r.status);
                return r.json();
            })
            .then(function(arr) {
                if (!Array.isArray(arr) || arr.length === 0) return null;
                var top = arr[0];
                var coords = top.geometry && top.geometry.coordinates;
                if (!coords || coords.length < 2) return null;
                return {
                    lat: coords[1],
                    lng: coords[0],
                    matchedTitle: (top.properties && top.properties.title) || query,
                    // GSIのレスポンスに明示的なmatch_levelは無いので、文字列ヒット度で近似
                    level: top.properties ? (top.properties.match_level || '') : ''
                };
            });
    }

    function geocode(address) {
        if (!address) return Promise.reject(new Error('住所が指定されていません'));
        var cleaned = cleanAddress(address);
        var cached = readCache(cleaned);
        if (cached) return Promise.resolve(cached);

        var trials = buildFallbacks(cleaned);
        var p = Promise.resolve(null);
        trials.forEach(function(q) {
            p = p.then(function(prev) {
                if (prev) return prev;
                return fetchOne(q).catch(function() { return null; });
            });
        });
        return p.then(function(result) {
            if (!result) throw new Error('ジオコーディング失敗: ' + cleaned);
            writeCache(cleaned, result);
            return result;
        });
    }

    // 2点間のハバーサイン距離(m)
    function distance(lat1, lng1, lat2, lng2) {
        var R = 6371000;
        var toRad = function(d) { return d * Math.PI / 180; };
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    // 緯度経度 → タイル座標 (ZXY) 変換 (WebMercator、Zoom 13 など)
    function lngLatToTile(lng, lat, z) {
        var n = Math.pow(2, z);
        var x = Math.floor((lng + 180) / 360 * n);
        var latRad = lat * Math.PI / 180;
        var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x: x, y: y, z: z };
    }

    // 点がポリゴン内か判定（reinfolib空間API判定用）
    function pointInPolygon(lat, lng, coords) {
        // coords: GeoJSON Polygon [[[lng,lat],...]] or MultiPolygon [[[[lng,lat],...]],...]
        if (!coords || !coords.length) return false;
        function inRing(ring) {
            var inside = false;
            for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                var xi = ring[i][0], yi = ring[i][1];
                var xj = ring[j][0], yj = ring[j][1];
                var intersect = ((yi > lat) !== (yj > lat)) &&
                    (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }
        // Polygon
        if (Array.isArray(coords[0][0]) && typeof coords[0][0][0] === 'number') {
            return inRing(coords[0]);
        }
        // MultiPolygon
        for (var i = 0; i < coords.length; i++) {
            if (inRing(coords[i][0])) return true;
        }
        return false;
    }

    return {
        geocode: geocode,
        distance: distance,
        lngLatToTile: lngLatToTile,
        pointInPolygon: pointInPolygon,
        cleanAddress: cleanAddress
    };
})();
