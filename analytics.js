/**
 * SEO計測・解析タグ統合スクリプト
 * Google Analytics 4 + Microsoft Clarity + Search Console 認証 を一元管理
 *
 * 使い方:
 *   1) 下記 SEO_CONFIG の各IDを実IDに置換
 *   2) <script src="analytics.js" defer></script> を全HTMLの</head>直前に置く
 *
 * 設定取得方法:
 *   - GA4 Measurement ID: https://analytics.google.com → 管理 → データストリーム → ウェブ → G-XXXXXXXXXX
 *   - Microsoft Clarity Project ID: https://clarity.microsoft.com → Settings → Setup → Project ID
 *   - Search Console verification: https://search.google.com/search-console → プロパティ追加 → HTMLタグ → content="..."
 */
(function() {
    'use strict';

    var SEO_CONFIG = {
        // === Google Analytics 4 ===
        // GA4 Measurement ID（"G-" で始まる）を入力すると有効化
        GA4_MEASUREMENT_ID: 'GA_MEASUREMENT_ID_PLACEHOLDER',

        // === Microsoft Clarity（ヒートマップ・録画・無料） ===
        // Clarity Project ID（10桁前後の英数字）を入力すると有効化
        CLARITY_PROJECT_ID: 'CLARITY_PROJECT_ID_PLACEHOLDER',

        // === Google Search Console 認証 ===
        // <meta name="google-site-verification"> タグの content 値を貼り付け
        // 1行目の<meta>タグだけ HTMLに直接書く方式が推奨。本ファイルでは扱わない。

        // === デバッグモード ===
        // localhost / ?seo_debug=1 の時のみコンソールにログ出力
        DEBUG: false
    };

    function isDebug() {
        if (SEO_CONFIG.DEBUG) return true;
        try {
            if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return true;
            if (location.search.indexOf('seo_debug=1') >= 0) return true;
        } catch (e) {}
        return false;
    }
    function log() {
        if (isDebug() && console && console.log) console.log.apply(console, ['[analytics.js]'].concat([].slice.call(arguments)));
    }
    function isPlaceholder(s) {
        return !s || s.indexOf('PLACEHOLDER') >= 0;
    }

    // === GA4 セットアップ ===
    function setupGA4() {
        if (isPlaceholder(SEO_CONFIG.GA4_MEASUREMENT_ID)) {
            log('GA4 未設定（プレースホルダーのまま） - SEO_CONFIG.GA4_MEASUREMENT_ID を設定してください');
            return;
        }
        // gtag.js を非同期読み込み
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(SEO_CONFIG.GA4_MEASUREMENT_ID);
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function() { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', SEO_CONFIG.GA4_MEASUREMENT_ID, {
            // 個人情報保護: IPアノニマイズ
            anonymize_ip: true,
            // Cookie 設定: SameSite=None;Secure（クロスドメインは想定なし）
            cookie_flags: 'SameSite=Lax;Secure'
        });
        log('GA4 セットアップ完了:', SEO_CONFIG.GA4_MEASUREMENT_ID);
    }

    // === Microsoft Clarity セットアップ ===
    function setupClarity() {
        if (isPlaceholder(SEO_CONFIG.CLARITY_PROJECT_ID)) {
            log('Clarity 未設定（プレースホルダーのまま）');
            return;
        }
        // 公式埋め込みスクリプトのインライン版
        (function(c, l, a, r, i, t, y){
            c[a] = c[a] || function(){ (c[a].q = c[a].q || []).push(arguments); };
            t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
            y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
        })(window, document, "clarity", "script", SEO_CONFIG.CLARITY_PROJECT_ID);
        log('Clarity セットアップ完了:', SEO_CONFIG.CLARITY_PROJECT_ID);
    }

    // === コンバージョン記録ヘルパー（フォーム送信等から呼ぶ） ===
    window.trackEvent = function(eventName, params) {
        if (window.gtag) window.gtag('event', eventName, params || {});
        if (window.clarity) window.clarity('event', eventName);
        log('event:', eventName, params);
    };

    // 起動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setupGA4(); setupClarity();
        });
    } else {
        setupGA4(); setupClarity();
    }

    // 公開
    window.SEO_CONFIG = SEO_CONFIG;
})();
