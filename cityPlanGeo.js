/**
 * 都市計画 ピンポイント評価（reinfolib 7空間API統合）
 *
 *   XKT001 都市計画区域/区域区分（市街化区域/市街化調整区域）
 *   XKT002 用途地域
 *   XKT003 立地適正化計画（居住誘導区域/都市機能誘導区域）
 *   XKT014 防火・準防火地域
 *   XKT023 地区計画
 *   XKT024 高度利用地区
 *   XKT030 都市計画道路（道路予定地の収用リスク）
 */
var CityPlanGeo = (function() {
    'use strict';

    var Z = 14; // reinfolib空間APIはz=14必須

    // 用途地域コード → 不動産投資価値 (13種)
    // 国交省用途地域コード: 1=第一種低層, 2=第二種低層, ..., 13=工業専用
    var USE_ZONE_SCORE = {
        '1': { name: '第一種低層住居専用地域', delta: 1, note: '良質住宅地' },
        '2': { name: '第二種低層住居専用地域', delta: 1, note: '良質住宅地' },
        '3': { name: '第一種中高層住居専用地域', delta: 1, note: 'マンション適地' },
        '4': { name: '第二種中高層住居専用地域', delta: 0.5, note: 'マンション適地' },
        '5': { name: '第一種住居地域', delta: 0, note: '住商混在' },
        '6': { name: '第二種住居地域', delta: 0, note: '住商混在' },
        '7': { name: '準住居地域', delta: -0.5, note: '幹線道路沿い' },
        '8': { name: '近隣商業地域', delta: 0, note: '利便性高' },
        '9': { name: '商業地域', delta: 0.5, note: '投資用途に強い' },
        '10': { name: '準工業地域', delta: -0.5, note: '住環境やや難' },
        '11': { name: '工業地域', delta: -1, note: '住居適性低' },
        '12': { name: '工業専用地域', delta: -2, note: '住居建築不可' },
        '13': { name: '田園住居地域', delta: 0, note: '営農調和' }
    };

    function extractUseZoneCode(props) {
        if (!props) return null;
        // 国交省用途地域はA29_005やYoutoなど複数の表記
        return props.A29_005 || props.youto || props.use_zone_code ||
               props.A29_001 || null;
    }

    function evaluate(lat, lng) {
        var tile = Geocoder.lngLatToTile(lng, lat, Z);
        var results = {
            lat: lat, lng: lng, z: Z,
            useZone: null,
            cityPlanArea: null,
            locationOpt: null,
            fireZone: null,
            districtPlan: null,
            highUseArea: null,
            plannedRoad: null,
            hits: [],
            totalDelta: 0
        };

        var tasks = [];

        // 用途地域 (XKT002)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT002', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var code = extractUseZoneCode(in_[0].properties);
                    var info = USE_ZONE_SCORE[String(code)] || null;
                    if (info) {
                        results.useZone = info.name;
                        results.hits.push({
                            type: '用途地域', delta: info.delta,
                            label: info.name + '（' + info.note + '）',
                            source: 'XKT002'
                        });
                        results.totalDelta += info.delta;
                    }
                })
                .catch(function(e) { console.warn('XKT002 失敗: ', e.message); })
        );

        // 都市計画区域/区域区分 (XKT001)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT001', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var p = in_[0].properties || {};
                    // A14_005/A17_003 などで区域区分が表現される
                    var kubun = String(p.A14_005 || p.kubun || p.区域区分 || '');
                    results.cityPlanArea = kubun;
                    if (kubun.indexOf('調整') >= 0) {
                        results.hits.push({
                            type: '都市計画区域', delta: -2,
                            label: '市街化調整区域（建築原則不可）',
                            source: 'XKT001'
                        });
                        results.totalDelta -= 2;
                    } else if (kubun.indexOf('市街化') >= 0) {
                        results.hits.push({
                            type: '都市計画区域', delta: 0,
                            label: '市街化区域内', source: 'XKT001'
                        });
                    } else if (kubun.indexOf('区域外') >= 0 || kubun.indexOf('非線引') >= 0) {
                        results.hits.push({
                            type: '都市計画区域', delta: -1,
                            label: '非線引き/区域外（インフラ整備遅れ）',
                            source: 'XKT001'
                        });
                        results.totalDelta -= 1;
                    }
                })
                .catch(function(e) { console.warn('XKT001 失敗: ', e.message); })
        );

        // 立地適正化計画 (XKT003)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT003', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    if (!geo.features || geo.features.length === 0) return;
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length > 0) {
                        var p = in_[0].properties || {};
                        var zone = String(p.A35b_002 || p.zone_type || '');
                        if (zone.indexOf('居住誘導') >= 0) {
                            results.locationOpt = '居住誘導区域内';
                            results.hits.push({
                                type: '立地適正化', delta: 0.5,
                                label: '居住誘導区域内（将来性◎）',
                                source: 'XKT003'
                            });
                            results.totalDelta += 0.5;
                        } else if (zone.indexOf('都市機能') >= 0) {
                            results.locationOpt = '都市機能誘導区域内';
                            results.hits.push({
                                type: '立地適正化', delta: 1,
                                label: '都市機能誘導区域内（商業集積）',
                                source: 'XKT003'
                            });
                            results.totalDelta += 1;
                        }
                    } else {
                        // データが存在する自治体で区域外ならマイナス
                        results.locationOpt = '誘導区域外';
                        results.hits.push({
                            type: '立地適正化', delta: -1,
                            label: '居住誘導区域外（将来衰退リスク）',
                            source: 'XKT003'
                        });
                        results.totalDelta -= 1;
                    }
                })
                .catch(function(e) { console.warn('XKT003 失敗: ', e.message); })
        );

        // 防火・準防火地域 (XKT014) — 情報補完のみ、減点なし
        tasks.push(
            ReinfolibClient.fetchByTile('XKT014', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var p = in_[0].properties || {};
                    var kind = String(p.A38_005 || p.fire_zone || '');
                    if (kind.indexOf('準防火') >= 0) {
                        results.fireZone = '準防火地域';
                        results.hits.push({ type: '防火', delta: 0, label: '準防火地域', source: 'XKT014' });
                    } else if (kind.indexOf('防火') >= 0) {
                        results.fireZone = '防火地域';
                        results.hits.push({ type: '防火', delta: 0, label: '防火地域（建築費上昇に留意）', source: 'XKT014' });
                    }
                })
                .catch(function(e) { console.warn('XKT014 失敗: ', e.message); })
        );

        // 地区計画 (XKT023) — 情報補完
        tasks.push(
            ReinfolibClient.fetchByTile('XKT023', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    results.districtPlan = true;
                    results.hits.push({
                        type: '地区計画', delta: 0,
                        label: '地区計画指定区域（建築協定/形態規制あり）',
                        source: 'XKT023'
                    });
                })
                .catch(function(e) { console.warn('XKT023 失敗: ', e.message); })
        );

        // 高度利用地区 (XKT024) — 容積率緩和で加点
        tasks.push(
            ReinfolibClient.fetchByTile('XKT024', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    results.highUseArea = true;
                    results.hits.push({
                        type: '高度利用地区', delta: 1,
                        label: '高度利用地区（容積率緩和対象）',
                        source: 'XKT024'
                    });
                    results.totalDelta += 1;
                })
                .catch(function(e) { console.warn('XKT024 失敗: ', e.message); })
        );

        // 都市計画道路 (XKT030) — 予定地は収用リスク
        tasks.push(
            ReinfolibClient.fetchByTile('XKT030', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var p = in_[0].properties || {};
                    var status = String(p.A40_005 || p.status || '');
                    // 未整備の計画決定路線は収用リスク
                    if (status.indexOf('未着手') >= 0 || status.indexOf('計画決定') >= 0 || !status) {
                        results.plannedRoad = true;
                        results.hits.push({
                            type: '都市計画道路', delta: -2,
                            label: '都市計画道路予定地（収用リスク）',
                            source: 'XKT030'
                        });
                        results.totalDelta -= 2;
                    }
                })
                .catch(function(e) { console.warn('XKT030 失敗: ', e.message); })
        );

        return Promise.all(tasks).then(function() {
            return results;
        });
    }

    return {
        evaluate: evaluate,
        USE_ZONE_SCORE: USE_ZONE_SCORE
    };
})();
