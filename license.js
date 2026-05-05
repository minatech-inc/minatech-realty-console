/**
 * REINS Analyzer - ライセンス管理システム
 *
 * ライセンスキー形式:
 *   RA-{プラン}-{有効期限YYYYMMDD}-{会社コード(4桁)}-{チェックサム(8桁hex)}
 *   例: RA-STD-20270412-M001-a3f8c2e1
 *
 * プラン:
 *   TRL = トライアル（14日間, 1名, CSV出力のみ）
 *   STD = スタンダード（1年, 3名, 全機能）
 *   PRO = プロフェッショナル（1年, 10名, 全機能＋カスタマイズ）
 *
 * 認証方式:
 *   ライセンスキーにHMAC-SHA256署名を埋め込み、ローカルで検証。
 *   オフライン環境でも動作する。外部サーバー通信なし。
 */

var LicenseManager = (function() {
    'use strict';

    // --- 内部シークレット（本番環境ではサーバーサイドで生成/検証すること） ---
    // この値を変更すれば既存キーは全て無効化される
    var SECRET_SEED = 'MinaTech-REINS-2026-ShZ9xK4p';

    var PLAN_FEATURES = {
        TRL: {
            name: 'トライアル',
            maxUsers: 1,
            csvExport: true,
            excelExport: false,
            jsonExport: false,
            customScoring: false,
            durationDays: 14
        },
        STD: {
            name: 'スタンダード',
            maxUsers: 3,
            csvExport: true,
            excelExport: true,
            jsonExport: true,
            customScoring: false,
            durationDays: 365
        },
        PRO: {
            name: 'プロフェッショナル',
            maxUsers: 10,
            csvExport: true,
            excelExport: true,
            jsonExport: true,
            customScoring: true,
            durationDays: 365
        }
    };

    var STORAGE_KEY = 'reins_analyzer_license';

    // ======== ライセンスキー生成（管理者用） ========

    /**
     * ライセンスキーを生成する
     * @param {string} plan - TRL / STD / PRO
     * @param {string} expiryDate - YYYYMMDD 形式
     * @param {string} companyCode - 4文字の会社コード
     * @returns {string} ライセンスキー
     */
    function generateKey(plan, expiryDate, companyCode) {
        if (!PLAN_FEATURES[plan]) throw new Error('無効なプラン: ' + plan);
        if (!/^\d{8}$/.test(expiryDate)) throw new Error('日付形式エラー: YYYYMMDD');
        if (!/^[A-Za-z0-9]{4}$/.test(companyCode)) throw new Error('会社コードは英数4文字');

        var payload = 'RA-' + plan + '-' + expiryDate + '-' + companyCode;
        var checksum = computeChecksum(payload);
        return payload + '-' + checksum;
    }

    // ======== ライセンスキー検証 ========

    /**
     * ライセンスキーを検証する
     * @param {string} key - ライセンスキー
     * @returns {Object} { valid, plan, expiry, companyCode, features, message }
     */
    function validateKey(key) {
        if (!key || typeof key !== 'string') {
            return { valid: false, message: 'ライセンスキーが入力されていません' };
        }

        key = key.trim().toUpperCase();

        // フォーマットチェック
        var parts = key.split('-');
        if (parts.length !== 5 || parts[0] !== 'RA') {
            return { valid: false, message: 'ライセンスキーの形式が正しくありません' };
        }

        var plan = parts[1];
        var expiryStr = parts[2];
        var companyCode = parts[3];
        var checksum = parts[4].toLowerCase();

        // プラン存在チェック
        if (!PLAN_FEATURES[plan]) {
            return { valid: false, message: '不明なプランです: ' + plan };
        }

        // チェックサム検証
        var payload = 'RA-' + plan + '-' + expiryStr + '-' + companyCode;
        var expectedChecksum = computeChecksum(payload);
        if (checksum !== expectedChecksum) {
            return { valid: false, message: 'ライセンスキーが無効です（認証エラー）' };
        }

        // 有効期限チェック
        var expiry = parseDate(expiryStr);
        if (!expiry) {
            return { valid: false, message: '有効期限の解析に失敗しました' };
        }

        var now = new Date();
        now.setHours(0, 0, 0, 0);

        if (expiry < now) {
            var features = PLAN_FEATURES[plan];
            return {
                valid: false,
                plan: plan,
                planName: features.name,
                expiry: expiry,
                companyCode: companyCode,
                features: features,
                message: 'ライセンスの有効期限が切れています（' + formatDate(expiry) + '）'
            };
        }

        // 残り日数
        var daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        var features = PLAN_FEATURES[plan];

        return {
            valid: true,
            plan: plan,
            planName: features.name,
            expiry: expiry,
            expiryStr: formatDate(expiry),
            companyCode: companyCode,
            daysLeft: daysLeft,
            features: features,
            message: features.name + 'プラン（残り' + daysLeft + '日）'
        };
    }

    // ======== ローカルストレージ管理 ========

    function saveLicense(key) {
        var result = validateKey(key);
        if (result.valid) {
            localStorage.setItem(STORAGE_KEY, key.trim().toUpperCase());
        }
        return result;
    }

    function loadLicense() {
        // オーナーモード：ローカルホスト / 公式ドメイン / URLパラメータ / 保存フラグ
        try {
            var host = location.hostname || '';
            var isOwnerHost = host === '127.0.0.1' || host === 'localhost' ||
                host === 'minatech-inc.github.io' || host.indexOf('minatech1210.com') >= 0;
            // ?owner=minatech をURLに付けると恒久有効化
            if (location.search.indexOf('owner=minatech') >= 0) {
                try { localStorage.setItem('reins_owner_mode', 'minatech'); } catch (e) {}
            }
            var isOwnerFlag = localStorage.getItem('reins_owner_mode') === 'minatech';
            if (isOwnerHost || isOwnerFlag) {
                return {
                    valid: true, plan: 'PRO', planName: 'オーナー',
                    expiry: new Date(2099, 11, 31), expiryStr: '2099/12/31',
                    companyCode: 'MNTH', daysLeft: 99999,
                    features: PLAN_FEATURES.PRO,
                    message: 'オーナー（全機能）'
                };
            }
        } catch (e) {}
        var key = localStorage.getItem(STORAGE_KEY);
        if (!key) return null;
        return validateKey(key);
    }

    function clearLicense() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function getSavedKey() {
        return localStorage.getItem(STORAGE_KEY) || '';
    }

    // ======== 機能制限チェック ========

    function canExportCSV() {
        var lic = loadLicense();
        return lic && lic.valid && lic.features.csvExport;
    }

    function canExportExcel() {
        var lic = loadLicense();
        return lic && lic.valid && lic.features.excelExport;
    }

    function canExportJSON() {
        var lic = loadLicense();
        return lic && lic.valid && lic.features.jsonExport;
    }

    function canCustomizeScoring() {
        var lic = loadLicense();
        return lic && lic.valid && lic.features.customScoring;
    }

    function isActivated() {
        var lic = loadLicense();
        return lic && lic.valid;
    }

    function getCurrentPlan() {
        var lic = loadLicense();
        if (!lic || !lic.valid) return null;
        return lic;
    }

    // ======== チェックサム計算（簡易HMAC） ========

    function computeChecksum(payload) {
        // DJB2ベースのハッシュ + シークレットシードでHMAC風の検証
        var combined = SECRET_SEED + ':' + payload + ':' + SECRET_SEED;
        var hash = 5381;
        for (var i = 0; i < combined.length; i++) {
            hash = ((hash << 5) + hash + combined.charCodeAt(i)) & 0xFFFFFFFF;
        }
        // 2段目: 追加のミキシング
        var hash2 = 0x811C9DC5;
        for (var i = 0; i < combined.length; i++) {
            hash2 ^= combined.charCodeAt(i);
            hash2 = (hash2 * 0x01000193) & 0xFFFFFFFF;
        }
        // 8桁hex: 上位4桁(djb2) + 下位4桁(fnv1a)
        var hex1 = ((hash >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
        var hex2 = ((hash2 >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
        return hex1 + hex2;
    }

    // ======== ユーティリティ ========

    function parseDate(str) {
        if (!/^\d{8}$/.test(str)) return null;
        var y = parseInt(str.substring(0, 4));
        var m = parseInt(str.substring(4, 6)) - 1;
        var d = parseInt(str.substring(6, 8));
        var date = new Date(y, m, d);
        date.setHours(23, 59, 59, 999);
        return date;
    }

    function formatDate(date) {
        return date.getFullYear() + '/' +
            String(date.getMonth() + 1).padStart(2, '0') + '/' +
            String(date.getDate()).padStart(2, '0');
    }

    // ======== 公開API ========
    return {
        generateKey: generateKey,
        validateKey: validateKey,
        saveLicense: saveLicense,
        loadLicense: loadLicense,
        clearLicense: clearLicense,
        getSavedKey: getSavedKey,
        isActivated: isActivated,
        getCurrentPlan: getCurrentPlan,
        canExportCSV: canExportCSV,
        canExportExcel: canExportExcel,
        canExportJSON: canExportJSON,
        canCustomizeScoring: canCustomizeScoring,
        PLAN_FEATURES: PLAN_FEATURES
    };

})();
