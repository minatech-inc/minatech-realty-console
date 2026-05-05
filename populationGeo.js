/**
 * 将来推計人口 ピンポイント評価（reinfolib XKT013）
 *
 * 250mメッシュ単位での将来推計人口。
 * 物件位置のメッシュで、2020年→2040年の減少率を評価し、
 * 長期保有リスクとして反映する。
 *
 * 減少率 -20%以下 → -1
 * 減少率 -30%以下 → -2
 */
var PopulationGeo = (function() {
    'use strict';

    var Z = 14; // reinfolib空間APIはz=14必須

    function evaluate(lat, lng) {
        var tile = Geocoder.lngLatToTile(lng, lat, Z);
        return ReinfolibClient.fetchByTile('XKT013', tile.z, tile.x, tile.y)
            .then(function(geo) {
                var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                if (in_.length === 0) {
                    return { available: false };
                }
                var p = in_[0].properties || {};
                // 代表的な列名: pop_2020, pop_2040 or PTN_2020, PTN_2040
                // reinfolib仕様書に合わせて候補を列挙
                var p2020 = parseFloat(
                    p.PTN_2020 || p.pop_2020 || p.POP_2020 || p['人口_2020'] || 0
                );
                var p2040 = parseFloat(
                    p.PTN_2040 || p.pop_2040 || p.POP_2040 || p['人口_2040'] || 0
                );
                if (!(p2020 > 0) || !(p2040 > 0)) {
                    return { available: false };
                }
                var ratio = (p2040 - p2020) / p2020;
                var delta = 0, label = '';
                if (ratio <= -0.30) {
                    delta = -2;
                    label = '将来推計人口 ' + Math.round(ratio * 100) + '%（長期衰退リスク大）';
                } else if (ratio <= -0.20) {
                    delta = -1;
                    label = '将来推計人口 ' + Math.round(ratio * 100) + '%（長期衰退リスク）';
                } else if (ratio >= 0.05) {
                    delta = 0.5;
                    label = '将来推計人口 +' + Math.round(ratio * 100) + '%（人口増加エリア）';
                } else {
                    label = '将来推計人口 ' + (ratio >= 0 ? '+' : '') +
                        Math.round(ratio * 100) + '%（横ばい）';
                }
                return {
                    available: true,
                    pop2020: Math.round(p2020),
                    pop2040: Math.round(p2040),
                    changeRatio: ratio,
                    delta: delta,
                    label: label
                };
            })
            .catch(function(e) {
                console.warn('XKT013 失敗: ', e.message);
                return { available: false };
            });
    }

    return { evaluate: evaluate };
})();
