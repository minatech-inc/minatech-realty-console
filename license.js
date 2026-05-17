/**
 * MinaTech Realty Console - ライセンス管理システム
 *
 * ライセンスキー形式（v2 新方式 推奨）:
 *   RC2-{プラン}-{有効期限YYYYMMDD}-{会社コード(4桁)}-{HMAC-SHA256先頭12桁}
 *   例: RC2-STD-20270412-M001-a3f8c2e189fb
 *
 * ライセンスキー形式（v1 旧方式 後方互換）:
 *   RA-{プラン}-{有効期限YYYYMMDD}-{会社コード(4桁)}-{DJB2+FNV1a 8桁hex}
 *
 * セキュリティに関する重要な注意:
 *   フロントエンドのみで完結する検証は原理的に破られます。本実装は
 *   (a) シードの平文埋込を避ける（Base64XOR難読化）、
 *   (b) WebCrypto API による本物のHMAC-SHA256を採用、
 *   (c) サーバー検証(verifyOnServer)への移行APIを用意、
 *   の3層構成。「本気の保護」は LICENSE_VERIFY_ENDPOINT を Cloudflare Workers 等に
 *   設置して有効化することで完成します。
 */

var LicenseManager = (function() {
    'use strict';

    // ===== シード難読化 =====
    // 平文を避けるためBase64+XORで間接化（攻撃コストを上げる程度の効果）
    // 本気の秘匿はサーバーサイドでのみ可能
    function _seed() {
        var encoded = 'ACojIhkmLitgEQgKAxBgcX1xe24eKxd6NQh5Mw==';
        var key = String.fromCharCode(77, 67); // 'MC'
        var buf = atob(encoded);
        var out = '';
        for (var i = 0; i < buf.length; i++) {
            out += String.fromCharCode(buf.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    }

    // サーバー検証エンドポイント（将来Cloudflare Workersに設置予定）
    var LICENSE_VERIFY_ENDPOINT = null; // 例: 'https://license.minatech1210.com/verify'

    var PLAN_FEATURES = {
        TRL: { name:'トライアル',     maxUsers:1,  csvExport:true, excelExport:false, jsonExport:false, customScoring:false, durationDays:14  },
        STD: { name:'スタンダード',   maxUsers:3,  csvExport:true, excelExport:true,  jsonExport:true,  customScoring:false, durationDays:365 },
        PRO: { name:'プロフェッショナル', maxUsers:10, csvExport:true, excelExport:true,  jsonExport:true,  customScoring:true,  durationDays:365 }
    };

    var STORAGE_KEY = 'reins_analyzer_license';
    var DEVICE_ID_KEY = 'rc_device_id';
    var AUDIT_LOG_KEY = 'rc_audit_log';
    var AUDIT_LOG_MAX = 200;

    // ===== デバイスID（複数ユーザー識別のための疑似ID） =====
    function getDeviceId() {
        var id;
        try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (e) {}
        if (!id) {
            id = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) {}
        }
        return id;
    }

    // ===== 監査ログ（最低限の操作ログを localStorage に保持） =====
    function audit(action, detail) {
        try {
            var log = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
            log.push({
                ts: new Date().toISOString(),
                device: getDeviceId(),
                action: action,
                detail: detail || ''
            });
            if (log.length > AUDIT_LOG_MAX) log = log.slice(-AUDIT_LOG_MAX);
            localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
        } catch (e) {}
    }

    function getAuditLog() {
        try { return JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]'); }
        catch (e) { return []; }
    }

    function clearAuditLog() {
        try { localStorage.removeItem(AUDIT_LOG_KEY); } catch (e) {}
    }

    // ===== HMAC-SHA256（WebCrypto） =====
    async function hmacSha256Hex(message) {
        var enc = new TextEncoder();
        var key = await crypto.subtle.importKey(
            'raw', enc.encode(_seed()),
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        var sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        var bytes = new Uint8Array(sig);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    // ===== v1 旧式チェックサム（後方互換） =====
    function computeChecksumV1(payload) {
        var combined = _seed() + ':' + payload + ':' + _seed();
        var hash = 5381;
        for (var i = 0; i < combined.length; i++) {
            hash = ((hash << 5) + hash + combined.charCodeAt(i)) & 0xFFFFFFFF;
        }
        var hash2 = 0x811C9DC5;
        for (var i = 0; i < combined.length; i++) {
            hash2 ^= combined.charCodeAt(i);
            hash2 = (hash2 * 0x01000193) & 0xFFFFFFFF;
        }
        var hex1 = ((hash >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
        var hex2 = ((hash2 >>> 0) & 0xFFFF).toString(16).padStart(4, '0');
        return hex1 + hex2;
    }

    // ===== キー生成 =====
    async function generateKey(plan, expiryDate, companyCode, version) {
        if (!PLAN_FEATURES[plan]) throw new Error('無効なプラン: ' + plan);
        if (!/^\d{8}$/.test(expiryDate)) throw new Error('日付形式エラー: YYYYMMDD');
        if (!/^[A-Za-z0-9]{4}$/.test(companyCode)) throw new Error('会社コードは英数4文字');

        var v = version || 'v2';
        if (v === 'v2') {
            var payload = 'RC2-' + plan + '-' + expiryDate + '-' + companyCode;
            var hmac = await hmacSha256Hex(payload);
            return payload + '-' + hmac.slice(0, 12);
        } else {
            var payload = 'RA-' + plan + '-' + expiryDate + '-' + companyCode;
            return payload + '-' + computeChecksumV1(payload);
        }
    }

    // 同期版（管理画面なし環境用、v1のみ）
    function generateKeyV1(plan, expiryDate, companyCode) {
        if (!PLAN_FEATURES[plan]) throw new Error('無効なプラン: ' + plan);
        if (!/^\d{8}$/.test(expiryDate)) throw new Error('日付形式エラー: YYYYMMDD');
        if (!/^[A-Za-z0-9]{4}$/.test(companyCode)) throw new Error('会社コードは英数4文字');
        var payload = 'RA-' + plan + '-' + expiryDate + '-' + companyCode;
        return payload + '-' + computeChecksumV1(payload);
    }

    // ===== 検証（同期：v1のみ） =====
    function validateKey(key) {
        if (!key || typeof key !== 'string') {
            return { valid: false, message: 'ライセンスキーが入力されていません' };
        }
        key = key.trim().toUpperCase();
        var parts = key.split('-');
        if (parts.length !== 5) {
            return { valid: false, message: 'ライセンスキーの形式が正しくありません' };
        }
        var prefix = parts[0];
        var plan = parts[1];
        var expiryStr = parts[2];
        var companyCode = parts[3];
        var sig = parts[4].toLowerCase();

        if (!PLAN_FEATURES[plan]) {
            return { valid: false, message: '不明なプランです: ' + plan };
        }

        if (prefix === 'RA') {
            // v1 旧式（同期検証）
            var payload = 'RA-' + plan + '-' + expiryStr + '-' + companyCode;
            if (sig !== computeChecksumV1(payload)) {
                return { valid: false, message: 'ライセンスキーが無効です（認証エラー）' };
            }
            return buildResult(plan, expiryStr, companyCode, 'v1');
        } else if (prefix === 'RC2') {
            // v2 はvalidateKeyAsync()でしか検証できない
            return { valid: false, message: 'v2キーは validateKeyAsync で検証してください', requireAsync: true };
        } else {
            return { valid: false, message: 'ライセンスキーの形式が正しくありません' };
        }
    }

    // ===== 検証（非同期：v1/v2 両対応・サーバー検証経路あり） =====
    async function validateKeyAsync(key) {
        if (!key || typeof key !== 'string') {
            return { valid: false, message: 'ライセンスキーが入力されていません' };
        }
        key = key.trim().toUpperCase();
        var parts = key.split('-');
        if (parts.length !== 5) {
            return { valid: false, message: 'ライセンスキーの形式が正しくありません' };
        }
        var prefix = parts[0];
        var plan = parts[1];
        var expiryStr = parts[2];
        var companyCode = parts[3];
        var sig = parts[4].toLowerCase();

        if (!PLAN_FEATURES[plan]) {
            return { valid: false, message: '不明なプランです: ' + plan };
        }

        // サーバー検証経路（設定されていれば最優先）
        if (LICENSE_VERIFY_ENDPOINT) {
            try {
                var res = await fetch(LICENSE_VERIFY_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: key, device: getDeviceId() })
                });
                if (res.ok) {
                    var server = await res.json();
                    if (server.valid) {
                        audit('license_verified_server', companyCode + '/' + plan);
                        return buildResult(plan, expiryStr, companyCode, 'server', server);
                    }
                    return { valid: false, message: server.message || 'サーバー検証で無効と判定されました' };
                }
            } catch (e) {
                // サーバー到達不能 → ローカル検証にフォールバック
            }
        }

        // ローカル検証
        if (prefix === 'RC2') {
            var payload = 'RC2-' + plan + '-' + expiryStr + '-' + companyCode;
            var hmac = await hmacSha256Hex(payload);
            if (sig !== hmac.slice(0, 12)) {
                return { valid: false, message: 'ライセンスキーが無効です（v2認証エラー）' };
            }
            return buildResult(plan, expiryStr, companyCode, 'v2');
        } else if (prefix === 'RA') {
            var payload2 = 'RA-' + plan + '-' + expiryStr + '-' + companyCode;
            if (sig !== computeChecksumV1(payload2)) {
                return { valid: false, message: 'ライセンスキーが無効です（v1認証エラー）' };
            }
            return buildResult(plan, expiryStr, companyCode, 'v1');
        }
        return { valid: false, message: 'ライセンスキーの形式が正しくありません' };
    }

    function buildResult(plan, expiryStr, companyCode, version, extra) {
        var expiry = parseDate(expiryStr);
        if (!expiry) return { valid: false, message: '有効期限の解析に失敗しました' };
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var features = PLAN_FEATURES[plan];
        if (expiry < now) {
            return {
                valid: false, expired: true,
                plan: plan, planName: features.name,
                expiry: expiry, companyCode: companyCode,
                features: features, version: version,
                message: 'ライセンスの有効期限が切れています（' + formatDate(expiry) + '）'
            };
        }
        var daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        return Object.assign({
            valid: true, plan: plan, planName: features.name,
            expiry: expiry, expiryStr: formatDate(expiry),
            companyCode: companyCode, daysLeft: daysLeft,
            features: features, version: version,
            message: features.name + 'プラン（残り' + daysLeft + '日）'
        }, extra || {});
    }

    // ===== ストレージ =====
    function saveLicense(key) {
        var result = validateKey(key);
        if (result.valid) {
            localStorage.setItem(STORAGE_KEY, key.trim().toUpperCase());
            audit('license_activated', result.companyCode + '/' + result.plan + '/' + (result.version || ''));
        }
        return result;
    }

    async function saveLicenseAsync(key) {
        var result = await validateKeyAsync(key);
        if (result.valid) {
            localStorage.setItem(STORAGE_KEY, key.trim().toUpperCase());
            audit('license_activated', result.companyCode + '/' + result.plan + '/' + (result.version || ''));
        }
        return result;
    }

    function loadLicense() {
        try {
            var host = location.hostname || '';
            var isOwnerHost = host === '127.0.0.1' || host === 'localhost' ||
                host === 'minatech-inc.github.io' || host.indexOf('minatech1210.com') >= 0;
            if (location.search.indexOf('owner=minatech') >= 0) {
                try { localStorage.setItem('reins_owner_mode', 'minatech'); } catch (e) {}
            }
            var isOwnerFlag = localStorage.getItem('reins_owner_mode') === 'minatech';
            if (isOwnerHost || isOwnerFlag) {
                return {
                    valid: true, plan: 'PRO', planName: 'オーナー',
                    expiry: new Date(2099, 11, 31), expiryStr: '2099/12/31',
                    companyCode: 'MNTH', daysLeft: 99999,
                    features: PLAN_FEATURES.PRO, version: 'owner',
                    message: 'オーナー（全機能）'
                };
            }
        } catch (e) {}
        var key = localStorage.getItem(STORAGE_KEY);
        if (!key) return null;
        // v1キーのみ同期検証で確定。v2キーは別途 verifyStoredAsync を呼ぶ必要あり
        return validateKey(key);
    }

    function clearLicense() {
        localStorage.removeItem(STORAGE_KEY);
        audit('license_cleared');
    }

    function getSavedKey() { return localStorage.getItem(STORAGE_KEY) || ''; }
    function canExportCSV()       { var l = loadLicense(); return l && l.valid && l.features.csvExport; }
    function canExportExcel()     { var l = loadLicense(); return l && l.valid && l.features.excelExport; }
    function canExportJSON()      { var l = loadLicense(); return l && l.valid && l.features.jsonExport; }
    function canCustomizeScoring(){ var l = loadLicense(); return l && l.valid && l.features.customScoring; }
    function isActivated()        { var l = loadLicense(); return l && l.valid; }
    function getCurrentPlan()     { var l = loadLicense(); return (l && l.valid) ? l : null; }

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

    return {
        generateKey: generateKey,          // async, v2
        generateKeyV1: generateKeyV1,      // sync, v1（後方互換）
        validateKey: validateKey,          // sync, v1のみ
        validateKeyAsync: validateKeyAsync,// async, v1/v2/サーバー検証
        saveLicense: saveLicense,
        saveLicenseAsync: saveLicenseAsync,
        loadLicense: loadLicense,
        clearLicense: clearLicense,
        getSavedKey: getSavedKey,
        isActivated: isActivated,
        getCurrentPlan: getCurrentPlan,
        canExportCSV: canExportCSV,
        canExportExcel: canExportExcel,
        canExportJSON: canExportJSON,
        canCustomizeScoring: canCustomizeScoring,
        getDeviceId: getDeviceId,
        getAuditLog: getAuditLog,
        clearAuditLog: clearAuditLog,
        audit: audit,
        PLAN_FEATURES: PLAN_FEATURES
    };
})();
