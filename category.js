/**
 * カテゴリ別評価ロジック
 * 一棟/区分/戸建/テナント/土地 でスコアリング軸を切り替え。
 */
var CategoryLogic = (function() {
    'use strict';

    var CURRENT = {
        category: 'apartment',  // apartment | condo | house | tenant | land
        mode: 'investment'      // investment | enduser
    };

    function set(cat, mode) {
        CURRENT.category = cat || 'apartment';
        CURRENT.mode = mode || 'investment';
    }
    function get() { return CURRENT; }

    // カテゴリ表示名
    var LABEL = {
        apartment: '一棟収益',
        condo: '区分マンション',
        house: '戸建',
        tenant: 'テナント/事業用',
        land: '土地'
    };

    // カテゴリ別 Cap Rate 調整係数
    var CAP_ADJUST = {
        apartment: 1.0,
        condo: 1.1,   // 区分は管理費等でNOI目減り
        house: 1.15,  // 戸建投資は流動性低・空室時ダメージ大
        tenant: 1.2,  // 事業用は空室リスク高
        land: 0       // 土地は収益還元対象外
    };

    // カテゴリ別 建物評価するか
    var EVALUATE_BUILDING = {
        apartment: true,
        condo: true,   // 建物のみ評価（土地は持分按分で小さく）
        house: true,
        tenant: true,
        land: false
    };

    // カテゴリ別 土地評価するか（区分は持分按分）
    function evaluateLand(cat) {
        if (cat === 'land') return 'full';
        if (cat === 'condo') return 'share';  // 持分按分
        return 'full';
    }

    // カテゴリが収益還元の対象か
    function hasIncomeApproach(cat) {
        return cat !== 'land';
    }

    // カテゴリが融資判定の対象か
    function hasFinancing(cat) {
        return true;
    }

    // カテゴリ別 妥当性チェック
    function validate(prop, cat) {
        var warnings = [];
        if (cat === 'condo') {
            if (!prop['専有面積'] && !prop['面積(㎡)']) warnings.push('専有面積不明');
            if (!prop['管理費']) warnings.push('管理費不明（NOI精度低下）');
            if (!prop['総戸数']) warnings.push('総戸数不明（持分計算不可）');
        } else if (cat === 'house') {
            if (!prop['土地面積(㎡)']) warnings.push('土地面積不明');
        } else if (cat === 'tenant') {
            if (!prop['表面利回り(%)']) warnings.push('利回り不明（事業用では必須）');
        } else if (cat === 'land') {
            if (!prop['土地面積(㎡)']) warnings.push('土地面積不明');
        }
        return warnings;
    }

    return {
        set: set, get: get, LABEL: LABEL,
        CAP_ADJUST: CAP_ADJUST,
        EVALUATE_BUILDING: EVALUATE_BUILDING,
        evaluateLand: evaluateLand,
        hasIncomeApproach: hasIncomeApproach,
        hasFinancing: hasFinancing,
        validate: validate
    };
})();
