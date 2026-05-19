/**
 * REINS物件解析ツール - メインアプリケーション
 * UI制御、エクスポート、全体フロー管理
 */

(function() {
    'use strict';

    // 解析済みデータの保持
    var analyzedProperties = [];

    // MinaTechオーナー環境向けのreinfolibプロキシデフォルト
    // 本番プロキシURLを既定値として焼き込み、初回利用から空間APIが有効化される
    var DEFAULT_REINFOLIB_PROXY = 'https://reinfolib-proxy.isoya-h.workers.dev';

    // ======== 初期化 ========
    document.addEventListener('DOMContentLoaded', function() {
        applyOwnerDefaults();
        initLicense();
        initTabs();
        initButtons();
        initDragDrop();
        initReinfolibSettings();
        initThemeToggle();
    });

    // ======== テーマ切替 ========
    function initThemeToggle() {
        var btnLight = document.getElementById('theme-light');
        var btnDark  = document.getElementById('theme-dark');
        if (!btnLight || !btnDark) return;
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        var setActive = function(mode) {
            document.documentElement.setAttribute('data-theme', mode);
            btnLight.classList.toggle('active', mode === 'light');
            btnDark.classList.toggle('active', mode === 'dark');
            try { localStorage.setItem('rc_theme', mode); } catch (e) {}
        };
        setActive(current);
        btnLight.addEventListener('click', function() { setActive('light'); });
        btnDark.addEventListener('click',  function() { setActive('dark'); });
    }

    // オーナー環境での自動設定: プロキシURLと空間API有効化を既定ON
    // 本番公開ドメインとローカル開発、オーナーモードフラグで動作
    function applyOwnerDefaults() {
        var host = location.hostname || '';
        var isOwnerHost = host === '127.0.0.1' || host === 'localhost' ||
            host === 'minatech-inc.github.io' ||
            host.indexOf('minatech1210.com') >= 0;
        var isOwnerFlag = (function() {
            try { return localStorage.getItem('reins_owner_mode') === 'minatech'; }
            catch (e) { return false; }
        })();
        if (!isOwnerHost && !isOwnerFlag) return;

        // プロキシURLが未設定なら自動セット
        try {
            if (!localStorage.getItem('reinfolib_proxy_url')) {
                localStorage.setItem('reinfolib_proxy_url', DEFAULT_REINFOLIB_PROXY);
            }
            // 空間API使用フラグもデフォルトON（明示的にOFFにされていない場合）
            if (localStorage.getItem('use_reinfolib') === null) {
                localStorage.setItem('use_reinfolib', '1');
            }
        } catch (e) {}
    }

    function initReinfolibSettings() {
        var chk = document.getElementById('use-reinfolib');
        var btn = document.getElementById('btn-reinfolib-settings');
        var modal = document.getElementById('reinfolib-settings-modal');
        var keyInput = document.getElementById('reinfolib-key-input');
        var btnSave = document.getElementById('btn-reinfolib-save');
        var btnCancel = document.getElementById('btn-reinfolib-cancel');
        if (!chk || !btn || !modal) return;

        chk.checked = localStorage.getItem('use_reinfolib') === '1';
        chk.addEventListener('change', function() {
            localStorage.setItem('use_reinfolib', chk.checked ? '1' : '0');
        });

        var proxyInput = document.getElementById('reinfolib-proxy-input');

        btn.addEventListener('click', function() {
            keyInput.value = localStorage.getItem('reinfolib_api_key') || '';
            if (proxyInput) proxyInput.value = localStorage.getItem('reinfolib_proxy_url') || '';
            modal.style.display = 'flex';
        });
        btnCancel.addEventListener('click', function() { modal.style.display = 'none'; });
        btnSave.addEventListener('click', function() {
            var k = keyInput.value.trim();
            if (k) localStorage.setItem('reinfolib_api_key', k);
            else localStorage.removeItem('reinfolib_api_key');
            if (proxyInput) {
                var p = proxyInput.value.trim();
                if (p) localStorage.setItem('reinfolib_proxy_url', p);
                else localStorage.removeItem('reinfolib_proxy_url');
            }
            modal.style.display = 'none';
            showToast('不動産情報ライブラリAPI設定を保存しました', 'success');
        });
    }

    // ======== ライセンス認証 ========
    function initLicense() {
        var modal = document.getElementById('license-modal');
        var keyInput = document.getElementById('license-key-input');
        var activateBtn = document.getElementById('btn-license-activate');
        var errorEl = document.getElementById('license-error');
        var statusEl = document.getElementById('license-status');
        var changeLicBtn = document.getElementById('btn-change-license');

        // オーナーバイパス（127.0.0.1/localhost、または ?owner=minatech でフラグ保存）
        var params = new URLSearchParams(window.location.search);
        if (params.get('owner') === 'minatech') {
            localStorage.setItem('reins_owner_mode', 'minatech');
        }
        var host = window.location.hostname;
        var isOwnerHost = host === '127.0.0.1' || host === 'localhost';
        var isOwnerFlag = localStorage.getItem('reins_owner_mode') === 'minatech';
        if (isOwnerHost || isOwnerFlag) {
            var ownerLic = {
                valid: true, plan: 'PRO', planName: 'オーナー',
                expiry: new Date(2099, 11, 31), expiryStr: '2099/12/31',
                companyCode: 'MNTH', daysLeft: 99999,
                features: LicenseManager.PLAN_FEATURES.PRO
            };
            modal.classList.add('hidden');
            showLicenseStatus(ownerLic);
            updateExportButtons(ownerLic);
            return;
        }

        // 保存済みライセンスチェック
        var saved = LicenseManager.loadLicense();
        if (saved && saved.valid) {
            modal.classList.add('hidden');
            showLicenseStatus(saved);
            updateExportButtons(saved);
        } else {
            // 保存済みだが期限切れの場合
            if (saved && !saved.valid) {
                keyInput.value = LicenseManager.getSavedKey();
                errorEl.textContent = saved.message;
                errorEl.style.display = 'block';
            }
        }

        // 認証ボタン
        activateBtn.addEventListener('click', function() {
            var key = keyInput.value.trim();
            if (!key) {
                errorEl.textContent = 'ライセンスキーを入力してください';
                errorEl.style.display = 'block';
                return;
            }

            var result = LicenseManager.saveLicense(key);
            if (result.valid) {
                modal.classList.add('hidden');
                showLicenseStatus(result);
                updateExportButtons(result);
                showToast(result.planName + 'プランで認証されました', 'success');
            } else {
                errorEl.textContent = result.message;
                errorEl.style.display = 'block';
            }
        });

        // Enterキー対応
        keyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') activateBtn.click();
        });

        // ライセンス変更ボタン
        if (changeLicBtn) {
            changeLicBtn.addEventListener('click', function(e) {
                e.preventDefault();
                keyInput.value = LicenseManager.getSavedKey();
                errorEl.style.display = 'none';
                modal.classList.remove('hidden');
            });
        }
    }

    function showLicenseStatus(licenseInfo) {
        var el = document.getElementById('license-status');
        if (!el) return;
        if (licenseInfo.daysLeft <= 30) {
            el.className = 'license-status expiring';
            el.textContent = licenseInfo.planName + ' (残り' + licenseInfo.daysLeft + '日)';
        } else {
            el.className = 'license-status active';
            el.textContent = licenseInfo.planName + ' (' + licenseInfo.expiryStr + 'まで)';
        }
    }

    function updateExportButtons(licenseInfo) {
        var csvBtn = document.getElementById('btn-export-csv');
        var excelBtn = document.getElementById('btn-export-excel');
        var jsonBtn = document.getElementById('btn-export-json');

        if (!licenseInfo || !licenseInfo.valid) {
            if (csvBtn) { csvBtn.classList.add('disabled'); csvBtn.classList.add('btn-locked'); }
            if (excelBtn) { excelBtn.classList.add('disabled'); excelBtn.classList.add('btn-locked'); }
            if (jsonBtn) { jsonBtn.classList.add('disabled'); jsonBtn.classList.add('btn-locked'); }
            return;
        }

        // CSV: 全プランOK
        if (csvBtn) { csvBtn.classList.remove('disabled'); csvBtn.classList.remove('btn-locked'); }

        // Excel/JSON: STD/PROのみ
        if (licenseInfo.features.excelExport) {
            if (excelBtn) { excelBtn.classList.remove('disabled'); excelBtn.classList.remove('btn-locked'); }
        } else {
            if (excelBtn) { excelBtn.classList.add('disabled'); excelBtn.classList.add('btn-locked'); }
        }

        if (licenseInfo.features.jsonExport) {
            if (jsonBtn) { jsonBtn.classList.remove('disabled'); jsonBtn.classList.remove('btn-locked'); }
        } else {
            if (jsonBtn) { jsonBtn.classList.add('disabled'); jsonBtn.classList.add('btn-locked'); }
        }
    }

    // ======== タブ切り替え ========
    function initTabs() {
        var tabs = document.querySelectorAll('.tab');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = this.getAttribute('data-tab');
                tabs.forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(function(c) {
                    c.classList.remove('active');
                });
                document.getElementById('tab-' + target).classList.add('active');
            });
        });
    }

    // ======== ボタンイベント ========
    function initButtons() {
        // 解析ボタン
        document.getElementById('btn-parse').addEventListener('click', function() {
            var text = document.getElementById('paste-area').value;
            if (!text.trim()) {
                showToast('テキストを貼り付けてください', 'warning');
                return;
            }
            runAnalysis(text);
        });

        // サンプルボタン
        document.getElementById('btn-sample').addEventListener('click', function() {
            document.getElementById('paste-area').value = getSampleData();
            // テキスト貼り付けタブに切り替え
            document.querySelector('.tab[data-tab="paste"]').click();
            showToast('サンプルデータを入力しました', 'info');
        });

        // クリアボタン
        document.getElementById('btn-clear').addEventListener('click', function() {
            document.getElementById('paste-area').value = '';
            analyzedProperties = [];
            document.getElementById('results-section').style.display = 'none';
            showToast('クリアしました', 'info');
        });

        // 手動入力フォーム
        document.getElementById('manual-form').addEventListener('submit', function(e) {
            e.preventDefault();
            var formData = new FormData(this);
            var prop = {};
            formData.forEach(function(value, key) {
                if (value.trim()) prop[key] = value.trim();
            });

            if (Object.keys(prop).length < 2) {
                showToast('最低2項目は入力してください', 'warning');
                return;
            }

            var scored = ReinsScorer.evaluateAll([prop]);
            analyzedProperties = analyzedProperties.concat(scored);
            renderResults();
            this.reset();
            showToast('物件を追加しました（合計' + analyzedProperties.length + '件）', 'success');
        });

        // エクスポートボタン
        document.getElementById('btn-export-csv').addEventListener('click', function() {
            exportCSV();
        });
        document.getElementById('btn-export-excel').addEventListener('click', function() {
            exportExcel();
        });
        document.getElementById('btn-export-json').addEventListener('click', function() {
            exportJSON();
        });
        document.getElementById('btn-export-pdf').addEventListener('click', function() {
            exportPDF();
        });
        document.getElementById('btn-export-bank').addEventListener('click', function() {
            exportBankReport();
        });
        // SUUMO入稿関連
        var openBroker = function() {
            if (typeof SuumoUI !== 'undefined') SuumoUI.openBrokerSettings();
        };
        var btnSuumoBroker = document.getElementById('btn-suumo-broker');
        if (btnSuumoBroker) btnSuumoBroker.addEventListener('click', openBroker);
        var btnSuumoBrokerHeader = document.getElementById('btn-suumo-broker-header');
        if (btnSuumoBrokerHeader) btnSuumoBrokerHeader.addEventListener('click', openBroker);

        // 物件マスタ
        var btnPropertyMaster = document.getElementById('btn-property-master-header');
        if (btnPropertyMaster) btnPropertyMaster.addEventListener('click', function() {
            if (typeof PropertyMasterUI !== 'undefined') {
                PropertyMasterUI.openMasterList(function(record) {
                    // 読込時：解析結果として復元
                    analyzedProperties = [record.prop];
                    renderResults();
                    showToast('物件マスタから読み込みました: ' + (record.propertyName || record.address), 'success');
                });
            }
        });
        var btnSaveMaster = document.getElementById('btn-save-master');
        if (btnSaveMaster) btnSaveMaster.addEventListener('click', function() {
            if (!analyzedProperties || analyzedProperties.length === 0) {
                showToast('先に物件を解析してください', 'warning');
                return;
            }
            if (typeof PropertyMasterUI !== 'undefined') {
                PropertyMasterUI.saveFromAnalysis(analyzedProperties[0]);
            }
        });

        // 画像処理
        var btnImageProc = document.getElementById('btn-image-processor-header');
        if (btnImageProc) btnImageProc.addEventListener('click', function() {
            if (typeof ImageProcessorUI !== 'undefined') ImageProcessorUI.open();
        });

        // ポータル横断チェッカー
        var btnPortalChecker = document.getElementById('btn-portal-checker-header');
        if (btnPortalChecker) btnPortalChecker.addEventListener('click', function() {
            if (typeof PortalCheckerUI !== 'undefined') PortalCheckerUI.open();
            else alert('ポータルチェッカーモジュールが読み込まれていません。');
        });

        // 重説下書きジェネレータ
        var btnDisclosure = document.getElementById('btn-disclosure-header');
        if (btnDisclosure) btnDisclosure.addEventListener('click', function() {
            if (typeof DisclosureUI === 'undefined') {
                alert('重説モジュールが読み込まれていません。');
                return;
            }
            var prop = (analyzedProperties && analyzedProperties.length > 0) ? analyzedProperties[0] : null;
            DisclosureUI.open(prop);
        });

        // 売買契約書ジェネレータ
        var btnContract = document.getElementById('btn-contract-header');
        if (btnContract) btnContract.addEventListener('click', function() {
            if (typeof ContractUI === 'undefined') {
                alert('契約書モジュールが読み込まれていません。');
                return;
            }
            var prop = (analyzedProperties && analyzedProperties.length > 0) ? analyzedProperties[0] : null;
            ContractUI.open(prop);
        });

        // 賃貸借契約書ジェネレータ
        var btnRentalContract = document.getElementById('btn-rental-contract-header');
        if (btnRentalContract) btnRentalContract.addEventListener('click', function() {
            if (typeof RentalContractUI === 'undefined') {
                alert('賃貸借契約書モジュールが読み込まれていません。');
                return;
            }
            var prop = (analyzedProperties && analyzedProperties.length > 0) ? analyzedProperties[0] : null;
            RentalContractUI.open(prop);
        });

        // 役所調査チェックリスト
        var btnGovCheck = document.getElementById('btn-govcheck-header');
        if (btnGovCheck) btnGovCheck.addEventListener('click', function() {
            if (typeof GovCheckUI === 'undefined') {
                alert('役所調査モジュールが読み込まれていません。');
                return;
            }
            var prop = (analyzedProperties && analyzedProperties.length > 0) ? analyzedProperties[0] : null;
            GovCheckUI.open(prop);
        });
        var btnSuumoExport = document.getElementById('btn-suumo-export');
        if (btnSuumoExport) btnSuumoExport.addEventListener('click', function() {
            if (!analyzedProperties || analyzedProperties.length === 0) {
                showToast('先に物件を解析してください', 'warning');
                return;
            }
            if (typeof SuumoUI === 'undefined') return;
            // 単一物件 or 一覧から選択
            if (analyzedProperties.length === 1) {
                SuumoUI.exportProperty(analyzedProperties[0]);
            } else {
                // 最高スコアの物件を初期表示（後で複数対応も検討）
                SuumoUI.exportProperty(analyzedProperties[0]);
            }
        });
        document.getElementById('btn-save-history').addEventListener('click', saveToHistory);
        document.getElementById('btn-open-history').addEventListener('click', openHistoryModal);
        document.getElementById('btn-history-close').addEventListener('click', function() {
            document.getElementById('history-modal').style.display = 'none';
        });
        document.getElementById('btn-history-compare').addEventListener('click', compareSelected);
        document.getElementById('btn-compare-close').addEventListener('click', function() {
            document.getElementById('compare-modal').style.display = 'none';
        });

        // カテゴリ変更で区分マンションパネルを表示/非表示
        var catRadios = document.querySelectorAll('input[name="category"]');
        var togglePanel = function() {
            var sel = document.querySelector('input[name="category"]:checked');
            var panel = document.getElementById('condo-panel');
            if (panel) panel.style.display = (sel && sel.value === 'condo') ? 'block' : 'none';
        };
        for (var ci = 0; ci < catRadios.length; ci++) {
            catRadios[ci].addEventListener('change', togglePanel);
        }
        togglePanel();

        // テーブル切り替え
        document.getElementById('btn-table-view').addEventListener('click', function() {
            var table = document.getElementById('table-container');
            var cards = document.getElementById('property-cards');
            if (table.style.display === 'none') {
                table.style.display = 'block';
                cards.style.display = 'none';
                this.textContent = 'カード表示に切り替え';
            } else {
                table.style.display = 'none';
                cards.style.display = 'flex';
                this.textContent = 'テーブル表示に切り替え';
            }
        });
    }

    // ======== ドラッグ&ドロップ ========
    function initDragDrop() {
        var area = document.getElementById('paste-area');
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        area.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });
        area.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            var files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'text/plain') {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    area.value = ev.target.result;
                    showToast('ファイルを読み込みました', 'info');
                };
                reader.readAsText(files[0], 'UTF-8');
            } else {
                var text = e.dataTransfer.getData('text');
                if (text) area.value = text;
            }
        });
    }

    // ======== 解析実行 ========
    function runAnalysis(text) {
        // カテゴリ/モード取得
        if (typeof CategoryLogic !== 'undefined') {
            var catEl = document.querySelector('input[name="category"]:checked');
            var modeEl = document.querySelector('input[name="mode"]:checked');
            CategoryLogic.set(catEl ? catEl.value : 'apartment', modeEl ? modeEl.value : 'investment');
        }

        // パース
        var parsed = ReinsParser.parse(text);
        if (parsed.length === 0) {
            showToast('物件データを検出できませんでした。フォーマットを確認してください。', 'warning');
            return;
        }

        // 区分マンションの追加フィールドを各物件にマージ
        var condoFields = collectCondoFields();
        if (condoFields) {
            parsed.forEach(function(p) {
                for (var k in condoFields) {
                    if (condoFields[k] !== '' && condoFields[k] !== null && p[k] === undefined) {
                        p[k] = condoFields[k];
                    }
                }
            });
        }

        // スコアリング
        var scored = ReinsScorer.evaluateAll(parsed);
        analyzedProperties = scored;

        renderResults();
        showToast(scored.length + '件の物件を解析しました', 'success');

        // 不動産情報ライブラリAPIで取引事例比較（非同期・結果に追記）
        maybeEnrichWithReinfolib(scored);
        // 動的地価公示で積算評価を再計算
        maybeEnrichWithLandPrice(scored);
        // reinfolib 空間API（ハザード・都市計画・生活環境・人口）でスコア補強
        maybeEnhanceWithGeo(scored);
    }

    // reinfolib 空間API統合実行
    function maybeEnhanceWithGeo(properties) {
        if (typeof ReinsScorer === 'undefined' || !ReinsScorer.enhanceAllWithGeo) return;
        if (localStorage.getItem('use_reinfolib') !== '1') return;
        if (!localStorage.getItem('reinfolib_proxy_url') &&
            !localStorage.getItem('reinfolib_api_key')) return;
        if (!properties || properties.length === 0) return;

        showToast('空間API（ハザード/都市計画/生活環境）で詳細評価を開始...', 'info');
        ReinsScorer.enhanceAllWithGeo(properties, function(idx, total, prop) {
            // 進捗は控えめに（物件ごとにトースト出すとUX悪化するのでログのみ）
            if (idx === 0 || idx === total - 1) {
                console.log('[GEO] ' + (idx + 1) + '/' + total + ' ' + (prop['所在地'] || ''));
            }
        }).then(function() {
            analyzedProperties = properties;
            renderResults();
            showToast('空間API解析完了（' + properties.length + '件）', 'success');
        }).catch(function(err) {
            console.error('空間API解析エラー:', err);
            showToast('空間API解析で一部エラー: ' + err.message, 'warning');
        });
    }

    function collectCondoFields() {
        var catEl = document.querySelector('input[name="category"]:checked');
        if (!catEl || catEl.value !== 'condo') return null;
        var g = function(id) {
            var el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        var floor = g('condo-floor'); // "8/15"
        var fld = {};
        if (g('condo-kanri')) fld['管理費(円/月)'] = g('condo-kanri');
        if (g('condo-shuzen')) fld['修繕積立金(円/月)'] = g('condo-shuzen');
        if (g('condo-kikin')) fld['修繕積立金基金(円)'] = g('condo-kikin');
        if (floor) {
            var fm = floor.match(/(\d+)\s*\/\s*(\d+)/);
            if (fm) { fld['所在階'] = fm[1]; fld['総階数'] = fm[2]; }
            else { fld['所在階'] = floor.replace(/[^\d]/g, ''); }
        }
        if (g('condo-direction')) fld['向き'] = g('condo-direction');
        if (g('condo-mgmt')) fld['管理形態'] = g('condo-mgmt');
        if (g('condo-daishu-count')) fld['大規模修繕実施回数'] = g('condo-daishu-count');
        if (g('condo-daishu-year')) fld['大規模修繕直近年'] = g('condo-daishu-year');
        if (g('condo-plan')) fld['長期修繕計画'] = g('condo-plan');
        if (g('condo-loan')) fld['管理組合借入金(万円)'] = g('condo-loan');
        if (g('condo-reserve')) fld['積立金残高(万円)'] = g('condo-reserve');
        if (g('condo-taino')) fld['滞納世帯率(%)'] = g('condo-taino');
        if (g('condo-parking')) fld['駐車場権利'] = g('condo-parking');
        if (g('condo-pet')) fld['ペット可否'] = g('condo-pet');
        return fld;
    }

    function maybeEnrichWithLandPrice(props) {
        var enabled = localStorage.getItem('use_reinfolib') === '1';
        var key = localStorage.getItem('reinfolib_api_key');
        if (!enabled || !key || typeof LandPriceAPI === 'undefined' || typeof Appraisal === 'undefined') return;

        var cache = {};
        var tasks = [];
        props.forEach(function(p) {
            if (!MarketData || !MarketData.resolveAreaCode) return;
            var area = MarketData.resolveAreaCode(p['所在地']);
            if (!area) return;
            var ck = area.prefCode + '-' + area.cityCode;
            if (!cache[ck]) {
                cache[ck] = LandPriceAPI.fetchLandPrice(area.prefCode, area.cityCode)
                    .catch(function(e) { console.warn('landprice', ck, e.message); return null; });
            }
            tasks.push(cache[ck].then(function(lp) {
                if (!lp) return;
                var newApp = Appraisal.evaluate(p, lp);
                if (!newApp) return;
                p['積算価格(万円)'] = newApp.totalValue;
                p['土地積算(万円)'] = newApp.landValue;
                p['建物積算(万円)'] = newApp.buildingValue;
                p['積算比(%)'] = newApp.ratioPct;
                p['土地単価(万円/㎡)'] = newApp.pricePerSqm;
                p['地価出典'] = newApp.priceSource;
                if (typeof Explanation !== 'undefined' && Explanation.appraisal) {
                    p['積算評価_説明'] = Explanation.appraisal(p);
                }
            }));
        });

        if (!tasks.length) return;
        Promise.all(tasks).then(function() {
            renderResults();
            showToast('最新の地価公示データで積算評価を更新しました', 'success');
        });
    }

    function maybeEnrichWithReinfolib(props) {
        var enabled = localStorage.getItem('use_reinfolib') === '1';
        var key = localStorage.getItem('reinfolib_api_key');
        if (!enabled || !key || typeof MarketData === 'undefined') return;

        // 直近年度（1年前）
        var year = new Date().getFullYear() - 1;
        var cache = {};
        var tasks = [];

        props.forEach(function(p) {
            var area = MarketData.resolveAreaCode(p['所在地']);
            if (!area) return;
            var ck = area.prefCode + '-' + area.cityCode;
            if (!cache[ck]) {
                cache[ck] = MarketData.fetchTransactionPrices(area.prefCode, area.cityCode, year)
                    .then(function(json) { return (json && json.data) ? json.data : []; })
                    .catch(function(e) { console.warn('reinfolib', ck, e.message); return []; });
            }
            tasks.push(cache[ck].then(function(txns) {
                var cmp = MarketData.compareToMarket(p, txns);
                if (!cmp) return;
                p['取引事例サンプル数'] = cmp.sample;
                p['取引事例中央値(万円/㎡)'] = cmp.marketMedian;
                p['物件単価(万円/㎡)'] = cmp.propUnit;
                p['取引事例乖離率(%)'] = cmp.deltaPct;
                if (typeof Explanation !== 'undefined' && Explanation.transactions) {
                    p['取引事例_説明'] = Explanation.transactions(p, cmp);
                }
                // 乖離に応じて総合スコアを微調整
                if (cmp.deltaPct <= -15) p['総合スコア'] = (p['総合スコア'] || 0) + 1;
                else if (cmp.deltaPct >= 20) p['総合スコア'] = (p['総合スコア'] || 0) - 1;
            }));
        });

        if (!tasks.length) return;
        Promise.all(tasks).then(function() {
            renderResults();
            showToast('不動産情報ライブラリの取引事例で比較しました', 'success');
        });
    }

    // ======== 結果表示 ========
    function renderResults() {
        var section = document.getElementById('results-section');
        section.style.display = 'block';

        // カウント表示
        document.getElementById('result-count').textContent =
            '（' + analyzedProperties.length + '件）';

        // ランク別カウント
        var counts = { S: 0, A: 0, B: 0, C: 0 };
        analyzedProperties.forEach(function(p) {
            var rank = p['評価ランク'] || 'C';
            if (counts[rank] !== undefined) counts[rank]++;
        });
        document.getElementById('count-s').textContent = counts.S;
        document.getElementById('count-a').textContent = counts.A;
        document.getElementById('count-b').textContent = counts.B;
        document.getElementById('count-c').textContent = counts.C;

        // カード描画
        renderCards();
        // テーブル描画
        renderTable();

        // スクロール
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ======== 詳細レポートブロック（自然文説明） ========
    function buildReportBlock(p) {
        var sections = [
            { title: '積算評価', text: p['積算評価_説明'], cls: ratioClass(p['積算比(%)'], [100, 80, 60]) },
            { title: '収益還元評価', text: p['収益還元_説明'], cls: ratioClass(p['収益還元比(%)'], [110, 95, 80]) },
            { title: '区分マンション健全性', text: p['区分健全性_説明'], cls: '' },
            { title: 'ハザードリスク', text: p['ハザード_説明'], cls: hazardClass(p) },
            { title: '融資適性', text: p['融資判定_説明'], cls: financingClass(p) },
            { title: '将来価値・出口戦略', text: p['将来価値_説明'], cls: fvClass(p['将来価値スコア']) },
            { title: '取引事例比較', text: p['取引事例_説明'], cls: txnClass(p['取引事例乖離率(%)']) },
            { title: '総合判定', text: p['総合判定_説明'], cls: rankClass(p['評価ランク']) }
        ];
        var html = '';
        sections.forEach(function(s) {
            if (!s.text) return;
            // タイトル行を除いた本文のみ整形
            var body = s.text.replace(/^【[^】]+】\n?/, '');
            html += '<details class="report-section ' + s.cls + '" open>' +
                '<summary>' + s.title + '</summary>' +
                '<div class="report-body">' + escapeHtml(body).replace(/\n/g, '<br>') + '</div>' +
                '</details>';
        });
        return html ? '<div class="prop-report">' + html + '</div>' : '';
    }

    function ratioClass(r, thresholds) {
        if (r === undefined || r === null) return '';
        if (r >= thresholds[0]) return 'sec-good';
        if (r >= thresholds[1]) return '';
        if (r >= thresholds[2]) return 'sec-warn';
        return 'sec-bad';
    }
    function hazardClass(p) {
        if (p['ハザード備考'] === undefined) return '';
        var m = Math.max(p['ハザード津波']||0, p['ハザード洪水']||0, p['ハザード土砂']||0);
        return m >= 2 ? 'sec-bad' : (m === 1 ? 'sec-warn' : 'sec-good');
    }
    function financingClass(p) {
        var fin = p['__financing'];
        if (!fin) return '';
        if (fin.verdictClass === 'good') return 'sec-good';
        if (fin.verdictClass === 'bad') return 'sec-bad';
        if (fin.verdictClass === 'warn') return 'sec-warn';
        return '';
    }
    function rankClass(rank) {
        if (rank === 'S') return 'sec-good';
        if (rank === 'A') return '';
        if (rank === 'B') return 'sec-warn';
        return 'sec-bad';
    }
    function fvClass(s) {
        if (s === undefined || s === null) return '';
        if (s >= 8) return 'sec-good';
        if (s >= 5) return '';
        if (s >= 3) return 'sec-warn';
        return 'sec-bad';
    }

    function txnClass(d) {
        if (d === undefined || d === null) return '';
        if (d <= -5) return 'sec-good';
        if (d < 10) return '';
        if (d < 20) return 'sec-warn';
        return 'sec-bad';
    }

    // ======== 詳細ブロック（Phase A/B表示 + 融資判定） ========
    function buildDetailBlock(p) {
        var rows = [];

        // --- 積算評価 ---
        if (p['積算価格(万円)']) {
            var ratio = p['積算比(%)'];
            var cls, theory;
            if (ratio >= 100) { cls = 'detail-good'; theory = '積算≥売出価格。銀行積算でフルローンが出やすい水準です。'; }
            else if (ratio >= 80) { cls = ''; theory = '積算比80-100%。自己資金10-20%でアパートローンが通る想定。'; }
            else if (ratio >= 60) { cls = 'detail-warn'; theory = '積算比60-80%。自己資金30%超が必要、金利も上振れ傾向。'; }
            else { cls = 'detail-bad'; theory = '積算比<60%。担保評価不足で融資困難。現金購入または大幅な頭金が前提。'; }
            rows.push(
                '<div class="detail-row ' + cls + '">' +
                    '<span class="detail-label">積算価格</span>' +
                    '<span class="detail-value">' + formatNumber(p['積算価格(万円)']) + '万円' +
                        '<small>土地' + formatNumber(p['土地積算(万円)']) + ' + 建物' + formatNumber(p['建物積算(万円)']) + '</small>' +
                        '<small class="detail-theory">計算: 敷地×土地単価(' + p['土地単価(万円/㎡)'] + '万円/㎡) + 延床×再調達単価×(残存/耐用年数)</small>' +
                        '<small class="detail-theory">判定: ' + theory + '</small>' +
                    '</span>' +
                    '<span class="detail-ratio">積算比 ' + ratio + '%</span>' +
                '</div>'
            );
        }

        // --- 収益還元 ---
        if (p['収益還元価格(万円)']) {
            var iratio = p['収益還元比(%)'];
            var icls, itheory;
            if (iratio >= 110) { icls = 'detail-good'; itheory = '収益還元比≥110%。NOIに対して売出価格が割安、インカム重視投資家に魅力。'; }
            else if (iratio >= 95) { icls = ''; itheory = '収益還元比95-110%。市場の期待利回りとほぼ整合、適正価格。'; }
            else if (iratio >= 80) { icls = 'detail-warn'; itheory = '収益還元比80-95%。やや割高、賃料下落リスクに注意。'; }
            else { icls = 'detail-bad'; itheory = '収益還元比<80%。NOIが還元利回りに達しておらず、キャッシュフローが回りにくい。'; }
            rows.push(
                '<div class="detail-row ' + icls + '">' +
                    '<span class="detail-label">収益還元</span>' +
                    '<span class="detail-value">' + formatNumber(p['収益還元価格(万円)']) + '万円' +
                        '<small>NOI ' + formatNumber(p['NOI(万円/年)']) + '万/年 ÷ Cap Rate ' + p['還元利回り(%)'] + '%</small>' +
                        '<small class="detail-theory">計算: NOI=価格×表面利回り×75%(運営費20%+空室5%控除)、還元価格=NOI÷エリア別期待利回り</small>' +
                        '<small class="detail-theory">判定: ' + itheory + '</small>' +
                    '</span>' +
                    '<span class="detail-ratio">還元比 ' + iratio + '%</span>' +
                '</div>'
            );
        }

        // --- ハザード ---
        if (p['ハザード備考'] !== undefined) {
            var t = p['ハザード津波'], f = p['ハザード洪水'], l = p['ハザード土砂'];
            var maxR = Math.max(t, f, l);
            var hcls, htheory;
            if (maxR >= 2) { hcls = 'detail-bad'; htheory = '高リスクエリア。保険料上振れ・売却流動性低下・災害時減価リスク。地番単位の確認必須。'; }
            else if (maxR === 1) { hcls = 'detail-warn'; htheory = '一部想定区域あり。国交省「重ねるハザードマップ」で対象地番を確認推奨。'; }
            else { hcls = 'detail-good'; htheory = '市区町村レベルでは主要ハザードなし（ただし地形次第のため個別確認は必要）。'; }
            var lvl = function(v) { return ['低','中','高'][v] || '-'; };
            rows.push(
                '<div class="detail-row ' + hcls + '">' +
                    '<span class="detail-label">ハザード</span>' +
                    '<span class="detail-value">津波:' + lvl(t) + ' / 洪水:' + lvl(f) + ' / 土砂:' + lvl(l) +
                        (p['ハザード備考'] ? '<small>' + escapeHtml(p['ハザード備考']) + '</small>' : '') +
                        '<small class="detail-theory">出典: 国交省ハザードマップ + 自治体公表資料を市区町村単位で集約</small>' +
                        '<small class="detail-theory">判定: ' + htheory + '</small>' +
                    '</span>' +
                '</div>'
            );
        }

        // --- 融資判定 ---
        var fin = p['__financing'];
        if (fin) {
            var fcls = 'detail-' + (fin.verdictClass === 'good' ? 'good' : fin.verdictClass === 'bad' ? 'bad' : fin.verdictClass === 'ok' ? '' : 'warn');
            var dscrText = fin.dscr !== null ? fin.dscr : 'N/A';
            rows.push(
                '<div class="detail-row ' + fcls + '">' +
                    '<span class="detail-label">融資判定</span>' +
                    '<span class="detail-value"><strong>' + fin.verdict + '</strong>' +
                        '<small>想定期間 ' + fin.loanYears + '年（残存耐用 ' + fin.remainYears + '年）' +
                        ' / 金利 ' + fin.rate + '% / LTV ' + fin.ltv + '% (' + escapeHtml(fin.ltvNote) + ')</small>' +
                        '<small>融資額 ' + formatNumber(fin.loanAmount) + '万円 / 年間返済 ' + formatNumber(fin.annualPayment) + '万円 / DSCR ' + dscrText + '</small>' +
                        '<small class="detail-theory">計算: 元利均等返済・銀行積算LTV・DSCR=NOI÷年間返済額</small>' +
                        '<small class="detail-theory">判定根拠: ' + escapeHtml(fin.reasons.join(' / ')) + '</small>' +
                        '<small class="detail-theory">※実際の融資はエリア・属性・金融機関により異なります。あくまで机上目安。</small>' +
                    '</span>' +
                    '<span class="detail-ratio">DSCR ' + dscrText + '</span>' +
                '</div>'
            );
        }

        if (rows.length === 0) return '';
        return '<div class="prop-detail">' + rows.join('') + '</div>';
    }

    // ======== カード描画 ========
    function renderCards() {
        var container = document.getElementById('property-cards');
        container.innerHTML = '';

        analyzedProperties.forEach(function(p) {
            var rank = (p['評価ランク'] || 'C').toLowerCase();
            var name = escapeHtml(p['物件名'] || '物件名未定');
            var score = p['スコア'] || 0;
            var price = p['価格(万円)'] || '-';
            var yld = p['表面利回り(%)'] || '-';
            var loc = escapeHtml(p['所在地'] || '-');
            var station = escapeHtml(p['駅徒歩(分)'] || '-');
            var structure = escapeHtml(p['構造'] || '-');
            var area = p['面積(㎡)'] || p['建物面積(㎡)'] || p['土地面積(㎡)'] || '-';
            if (area !== '-') area = String(area).replace(/[㎡m²\s]+$/g, '');
            var reason = escapeHtml(p['判断根拠'] || '');
            var areaEval = escapeHtml(p['エリア評価'] || '');
            var priority = escapeHtml(p['優先度'] || '');

            var card = document.createElement('div');
            card.className = 'prop-card';
            card.innerHTML =
                '<div class="prop-card-top">' +
                    '<div class="prop-rank-badge rank-' + rank + '">' +
                        '<span class="prop-rank-letter">' + rank.toUpperCase() + '</span>' +
                        '<span class="prop-rank-score">' + score + '/15</span>' +
                    '</div>' +
                    '<div class="prop-card-body">' +
                        '<div class="prop-name">' + name + '</div>' +
                        '<div class="prop-meta">' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">価格</span>' +
                                '<span class="prop-meta-value price">' + formatNumber(price) + '万円</span>' +
                            '</div>' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">表面利回り</span>' +
                                '<span class="prop-meta-value yield-val">' + yld + '%</span>' +
                            '</div>' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">所在地</span>' +
                                '<span class="prop-meta-value">' + loc + '</span>' +
                            '</div>' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">駅</span>' +
                                '<span class="prop-meta-value">' + station + '</span>' +
                            '</div>' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">構造</span>' +
                                '<span class="prop-meta-value">' + structure + '</span>' +
                            '</div>' +
                            '<div class="prop-meta-item">' +
                                '<span class="prop-meta-label">面積</span>' +
                                '<span class="prop-meta-value">' + (area === '-' ? '-' : area + '㎡') + '</span>' +
                            '</div>' +
                        '</div>' +
                        buildDetailBlock(p) +
                        buildReportBlock(p) +
                        '<div class="prop-reason">' +
                            '<strong>' + priority + '</strong> ' + reason +
                            (areaEval ? ' ［' + areaEval + '］' : '') +
                        '</div>' +
                    '</div>' +
                '</div>';

            container.appendChild(card);
        });
    }

    // ======== テーブル描画 ========
    function renderTable() {
        var tbody = document.getElementById('results-tbody');
        tbody.innerHTML = '';

        analyzedProperties.forEach(function(p) {
            var rank = (p['評価ランク'] || 'C');
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td><span class="rank-badge rank-' + rank.toLowerCase() + '">' + rank + '</span></td>' +
                '<td>' + (p['スコア'] || 0) + '/15</td>' +
                '<td>' + escapeHtml(p['物件名'] || '-') + '</td>' +
                '<td>' + escapeHtml(p['所在地'] || '-') + '</td>' +
                '<td>' + formatNumber(p['価格(万円)'] || '-') + '</td>' +
                '<td>' + (p['表面利回り(%)'] || '-') + '</td>' +
                '<td>' + escapeHtml(p['駅徒歩(分)'] || '-') + '</td>' +
                '<td>' + escapeHtml(p['構造'] || '-') + '</td>' +
                '<td>' + escapeHtml(String(p['面積(㎡)'] || p['建物面積(㎡)'] || '-').replace(/[㎡m²\s]+$/g, '')) + '</td>' +
                '<td>' + escapeHtml(p['判断根拠'] || '-') + '</td>';
            tbody.appendChild(tr);
        });
    }

    // ======== CSV エクスポート ========
    function exportCSV() {
        if (!LicenseManager.canExportCSV()) {
            showToast('CSV出力にはライセンスが必要です', 'warning');
            return;
        }
        if (analyzedProperties.length === 0) {
            showToast('エクスポートするデータがありません', 'warning');
            return;
        }

        var headers = getExportHeaders();
        var rows = [headers.join(',')];

        analyzedProperties.forEach(function(p) {
            var row = headers.map(function(h) {
                var val = (p[h] || '').toString();
                // CSVエスケープ: ダブルクォートとカンマ対応
                if (val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            rows.push(row.join(','));
        });

        var csv = '\uFEFF' + rows.join('\n'); // BOM付きUTF-8
        downloadFile(csv, 'reins_analysis_' + getDateStr() + '.csv', 'text/csv;charset=utf-8');
        showToast('CSVをダウンロードしました', 'success');
    }

    // ======== Excel エクスポート（HTML Table形式 .xls） ========
    function exportExcel() {
        if (!LicenseManager.canExportExcel()) {
            showToast('Excel出力はスタンダード以上のプランが必要です', 'warning');
            return;
        }
        if (analyzedProperties.length === 0) {
            showToast('エクスポートするデータがありません', 'warning');
            return;
        }

        var headers = getExportHeaders();

        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
        html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>REINS物件解析</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>';
        html += '<body><table border="1">';

        // ヘッダー行
        html += '<tr>';
        headers.forEach(function(h) {
            html += '<th style="background:#005bac;color:#fff;font-weight:bold;padding:6px;">' + escapeHtml(h) + '</th>';
        });
        html += '</tr>';

        // データ行
        analyzedProperties.forEach(function(p) {
            var rank = p['評価ランク'] || 'C';
            var bgColor = rank === 'S' ? '#FFF8E1' : rank === 'A' ? '#E3F2FD' : rank === 'B' ? '#F5F5F5' : '#FFEBEE';
            html += '<tr style="background:' + bgColor + ';">';
            headers.forEach(function(h) {
                var v = (p[h] === undefined || p[h] === null ? '' : p[h]).toString();
                var cell = escapeHtml(v).replace(/\n/g, '<br>');
                var wrap = v.indexOf('\n') >= 0 ? 'mso-data-placement:same-cell;white-space:normal;vertical-align:top;' : '';
                html += '<td style="padding:4px;' + wrap + '">' + cell + '</td>';
            });
            html += '</tr>';
        });

        html += '</table></body></html>';

        downloadFile(html, 'reins_analysis_' + getDateStr() + '.xls', 'application/vnd.ms-excel;charset=utf-8');
        showToast('Excelをダウンロードしました', 'success');
    }

    // ======== JSON エクスポート ========
    function exportJSON() {
        if (!LicenseManager.canExportJSON()) {
            showToast('JSON出力はスタンダード以上のプランが必要です', 'warning');
            return;
        }
        if (analyzedProperties.length === 0) {
            showToast('エクスポートするデータがありません', 'warning');
            return;
        }

        // 内部用フィールド __financing を除外
        var clean = analyzedProperties.map(function(p) {
            var copy = {};
            for (var k in p) { if (k.charAt(0) !== '_') copy[k] = p[k]; }
            return copy;
        });
        var json = JSON.stringify(clean, null, 2);
        downloadFile(json, 'reins_analysis_' + getDateStr() + '.json', 'application/json;charset=utf-8');
        showToast('JSONをダウンロードしました', 'success');
    }

    // ======== エクスポート用ヘッダー ========
    function getExportHeaders() {
        return [
            'カテゴリ', '分析モード',
            '評価ランク', 'スコア', '優先度', 'リスク評価',
            '物件名', '所在地', '価格(万円)', '表面利回り(%)',
            '実質利回り概算(%)', '駅徒歩(分)', '構造', '築年月', '築年数',
            '面積(㎡)', '建物面積(㎡)', '土地面積(㎡)',
            '間取り', '現況', '総戸数',
            'エリア評価', '判断根拠',
            '用途地域', '建ぺい率', '容積率', '権利', '物件種別',
            // Phase A 積算
            '積算価格(万円)', '土地積算(万円)', '建物積算(万円)', '積算比(%)',
            '土地単価(万円/㎡)', '地価出典',
            // Phase B 収益還元
            'NOI(万円/年)', '還元利回り(%)', '収益還元価格(万円)', '収益還元比(%)',
            // Phase B ハザード
            'ハザード津波', 'ハザード洪水', 'ハザード土砂', 'ハザード備考',
            // 融資判定
            '融資判定', '想定融資期間(年)', '想定LTV(%)', '想定融資額(万円)',
            '想定年間返済(万円)', 'DSCR',
            // 将来価値・市場
            '将来価値スコア', '人口推計2050(%)', 'ブランド指数',
            // 取引事例比較（国交省不動産情報ライブラリ）
            '取引事例サンプル数', '取引事例中央値(万円/㎡)', '物件単価(万円/㎡)', '取引事例乖離率(%)',
            // 詳細説明文（自然文）
            '積算評価_説明', '収益還元_説明', 'ハザード_説明', '融資判定_説明',
            '将来価値_説明', '取引事例_説明', '総合判定_説明', '詳細分析レポート',
            '備考'
        ];
    }

    // ======== サンプルデータ ========
    function getSampleData() {
        return [
            '物件名: 藤沢市南藤沢 一棟マンション',
            '所在地: 神奈川県藤沢市南藤沢3丁目',
            '価格: 4,800万円',
            '表面利回り: 12.5%',
            '交通: JR東海道本線 藤沢駅 徒歩5分',
            '構造: RC造 3階建',
            '築年月: 1998年6月',
            '土地面積: 120.5㎡',
            '建物面積: 280.3㎡',
            '総戸数: 6戸',
            '現況: 賃貸中（満室）',
            '用途地域: 近隣商業地域',
            '建ぺい率: 80%',
            '容積率: 300%',
            '権利: 所有権',
            '',
            '-----',
            '',
            '物件名: 横浜市中区 区分マンション',
            '所在地: 神奈川県横浜市中区山下町',
            '価格: 1,280万円',
            '表面利回り: 8.2%',
            '交通: みなとみらい線 元町・中華街駅 徒歩8分',
            '構造: SRC造 11階建 5階部分',
            '築年月: 2001年3月',
            '専有面積: 42.5㎡',
            '間取り: 1LDK',
            '現況: 賃貸中',
            '用途地域: 商業地域',
            '',
            '-----',
            '',
            '物件名: さいたま市大宮区 一棟アパート',
            '所在地: 埼玉県さいたま市大宮区三橋',
            '価格: 2,800万円',
            '表面利回り: 16.8%',
            '交通: JR大宮駅 徒歩12分',
            '構造: 木造 2階建',
            '築年月: 平成10年5月',
            '土地面積: 150.2㎡',
            '建物面積: 180.6㎡',
            '総戸数: 8戸',
            '現況: 賃貸中（1室空き）',
            '備考: 前面道路6m',
            '',
            '-----',
            '',
            '物件名: 千葉市中央区 一棟マンション',
            '所在地: 千葉県千葉市中央区新田町',
            '価格: 6,500万円',
            '表面利回り: 9.1%',
            '交通: JR千葉駅 徒歩7分',
            '構造: RC造 5階建',
            '築年月: 1992年8月',
            '建物面積: 420.5㎡',
            '土地面積: 95.3㎡',
            '総戸数: 10戸',
            '現況: 賃貸中（満室）',
            '',
            '-----',
            '',
            '物件名: 宮古市 中古戸建',
            '所在地: 岩手県宮古市田老',
            '価格: 380万円',
            '表面利回り: 22.0%',
            '交通: 三陸鉄道 田老駅 徒歩15分',
            '構造: 木造 2階建',
            '築年月: 昭和60年3月',
            '備考: 再建築不可',
        ].join('\n');
    }

    // ======== ユーティリティ ========

    function escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatNumber(val) {
        if (!val || val === '-') return '-';
        var num = parseFloat(val.toString().replace(/,/g, ''));
        if (isNaN(num)) return val;
        return num.toLocaleString();
    }

    function getDateStr() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function downloadFile(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // トースト通知
    function showToast(message, type) {
        // 既存のトーストを削除
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'info');
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 24px;' +
            'border-radius:8px;color:#fff;font-size:14px;font-weight:600;z-index:9999;' +
            'animation:fadeIn 0.3s;box-shadow:0 4px 16px rgba(0,0,0,0.2);';

        var colors = {
            success: '#27ae60', warning: '#f39c12', danger: '#e74c3c', info: '#3498db'
        };
        toast.style.background = colors[type] || colors.info;

        document.body.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    // CSS animation追加
    var style = document.createElement('style');
    style.textContent = '@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);

    // ======== PDFレポート出力 ========
    function exportPDF() {
        if (!analyzedProperties.length) {
            showToast('解析結果がありません', 'warning');
            return;
        }
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            showToast('PDFライブラリの読み込みに失敗しました', 'error');
            return;
        }
        var cards = document.getElementById('property-cards');
        if (!cards || !cards.children.length) {
            showToast('結果カードが描画されていません', 'warning');
            return;
        }
        showToast('PDFレポートを生成中...', 'info');
        var jsPDF = window.jspdf.jsPDF;
        var pdf = new jsPDF('p', 'mm', 'a4');
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var margin = 10;
        var children = Array.prototype.slice.call(cards.children);

        function processCard(idx) {
            if (idx >= children.length) {
                var filename = 'REINS_Report_' + new Date().toISOString().slice(0,10) + '.pdf';
                pdf.save(filename);
                showToast('PDFレポートを保存しました', 'success');
                return;
            }
            html2canvas(children[idx], { scale: 2, backgroundColor: '#ffffff', logging: false })
                .then(function(canvas) {
                    var imgW = pageW - margin * 2;
                    var imgH = canvas.height * imgW / canvas.width;
                    if (idx > 0) pdf.addPage();
                    // 1枚に収まらない場合は分割
                    if (imgH <= pageH - margin * 2) {
                        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgW, imgH);
                    } else {
                        var imgData = canvas.toDataURL('image/png');
                        var remaining = imgH;
                        var offsetY = 0;
                        var first = true;
                        while (remaining > 0) {
                            if (!first) pdf.addPage();
                            pdf.addImage(imgData, 'PNG', margin, margin - offsetY, imgW, imgH);
                            remaining -= (pageH - margin * 2);
                            offsetY += (pageH - margin * 2);
                            first = false;
                        }
                    }
                    processCard(idx + 1);
                })
                .catch(function(err) {
                    console.error(err);
                    showToast('PDF生成失敗: ' + err.message, 'error');
                });
        }
        processCard(0);
    }

    // ======== 銀行担保評価書PDF出力 ========
    function exportBankReport() {
        if (!analyzedProperties.length) {
            showToast('解析結果がありません', 'warning');
            return;
        }
        if (typeof BankReport === 'undefined') {
            showToast('銀行評価モジュール未読込', 'error');
            return;
        }
        // 複数物件の場合は選択、1件なら即出力
        var target;
        if (analyzedProperties.length === 1) {
            target = analyzedProperties[0];
        } else {
            var options = analyzedProperties.map(function(p, i) {
                return (i + 1) + ': ' + (p['物件名'] || p['所在地'] || '物件' + (i+1)) + '（' + (p['評価ランク'] || '') + '）';
            }).join('\n');
            var pick = prompt('銀行評価書を作成する物件番号を選んでください:\n\n' + options, '1');
            if (pick === null) return;
            var idx = parseInt(pick) - 1;
            if (isNaN(idx) || idx < 0 || idx >= analyzedProperties.length) {
                showToast('無効な番号です', 'warning');
                return;
            }
            target = analyzedProperties[idx];
        }
        showToast('担保評価書を生成中...', 'info');
        BankReport.exportPDF(target)
            .then(function() { showToast('担保評価書を保存しました', 'success'); })
            .catch(function(e) {
                console.error(e);
                showToast('生成失敗: ' + e.message, 'error');
            });
    }

    // ======== 履歴保存 ========
    function saveToHistory() {
        if (!analyzedProperties.length) {
            showToast('保存する解析結果がありません', 'warning');
            return;
        }
        if (typeof HistoryDB === 'undefined') {
            showToast('履歴モジュール未読込', 'error');
            return;
        }
        var title = prompt('履歴タイトルを入力してください',
            '解析 ' + new Date().toLocaleString('ja-JP'));
        if (title === null) return;
        var cat = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().category : 'apartment';
        var mode = (typeof CategoryLogic !== 'undefined') ? CategoryLogic.get().mode : 'investment';
        HistoryDB.save(title, cat, mode, analyzedProperties)
            .then(function() { showToast('履歴に保存しました', 'success'); })
            .catch(function(e) { showToast('保存失敗: ' + e.message, 'error'); });
    }

    function openHistoryModal() {
        if (typeof HistoryDB === 'undefined') return;
        var modal = document.getElementById('history-modal');
        var list = document.getElementById('history-list');
        list.innerHTML = '<p>読込中...</p>';
        modal.style.display = 'flex';
        HistoryDB.list().then(function(items) {
            if (!items.length) { list.innerHTML = '<p>履歴がありません</p>'; return; }
            var html = '';
            items.forEach(function(it) {
                var dt = new Date(it.createdAt).toLocaleString('ja-JP');
                html += '<div class="history-item" style="display:flex;align-items:center;gap:12px;padding:8px;border-bottom:1px solid #eee;">' +
                    '<input type="checkbox" class="hist-chk" data-id="' + it.id + '">' +
                    '<div style="flex:1;">' +
                        '<div style="font-weight:600;">' + escapeHtml(it.title) + '</div>' +
                        '<div style="font-size:12px;color:#666;">' + dt + ' / ' + it.count + '件 / ' +
                            escapeHtml(it.category || '') + '・' + escapeHtml(it.mode || '') + '</div>' +
                    '</div>' +
                    '<button class="btn btn-outline btn-sm hist-load" data-id="' + it.id + '">読込</button>' +
                    '<button class="btn btn-outline btn-sm hist-del" data-id="' + it.id + '">削除</button>' +
                '</div>';
            });
            list.innerHTML = html;
            list.querySelectorAll('.hist-load').forEach(function(b) {
                b.addEventListener('click', function() { loadHistoryItem(parseInt(b.dataset.id)); });
            });
            list.querySelectorAll('.hist-del').forEach(function(b) {
                b.addEventListener('click', function() {
                    if (!confirm('この履歴を削除しますか？')) return;
                    HistoryDB.remove(parseInt(b.dataset.id)).then(openHistoryModal);
                });
            });
        });
    }

    function loadHistoryItem(id) {
        HistoryDB.load(id).then(function(rec) {
            if (!rec) return;
            analyzedProperties = rec.props;
            document.getElementById('history-modal').style.display = 'none';
            renderResults();
            showToast('履歴を読込みました: ' + rec.title, 'success');
        });
    }

    function compareSelected() {
        var checks = document.querySelectorAll('.hist-chk:checked');
        if (checks.length !== 2) {
            showToast('2件選択してください', 'warning');
            return;
        }
        var ids = Array.prototype.map.call(checks, function(c) { return parseInt(c.dataset.id); });
        HistoryDB.loadMany(ids).then(function(recs) {
            var body = document.getElementById('compare-body');
            body.innerHTML = renderCompareTable(recs[0], recs[1]);
            document.getElementById('history-modal').style.display = 'none';
            document.getElementById('compare-modal').style.display = 'flex';
        });
    }

    function renderCompareTable(a, b) {
        // 先頭物件同士を比較（シンプル実装）
        var pa = (a.props && a.props[0]) || {};
        var pb = (b.props && b.props[0]) || {};
        var keys = [
            '物件名','所在地','価格(万円)','表面利回り(%)','駅徒歩(分)','構造','築年月',
            '評価ランク','総合スコア','積算価格(万円)','積算比(%)',
            '収益還元価格(万円)','収益還元比(%)','DSCR','融資判定',
            '将来価値スコア','取引事例乖離率(%)'
        ];
        var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr style="background:#f5f5f5;"><th style="padding:8px;border:1px solid #ddd;text-align:left;">項目</th>' +
            '<th style="padding:8px;border:1px solid #ddd;text-align:left;">' + escapeHtml(a.title) + '</th>' +
            '<th style="padding:8px;border:1px solid #ddd;text-align:left;">' + escapeHtml(b.title) + '</th>' +
            '</tr></thead><tbody>';
        keys.forEach(function(k) {
            var va = pa[k] !== undefined ? pa[k] : '-';
            var vb = pb[k] !== undefined ? pb[k] : '-';
            var diffStyle = '';
            if (typeof va === 'number' && typeof vb === 'number' && va !== vb) {
                diffStyle = va > vb ? 'color:#2e7d32;font-weight:600;' : '';
            }
            html += '<tr><td style="padding:6px 8px;border:1px solid #ddd;font-weight:600;">' + k + '</td>' +
                '<td style="padding:6px 8px;border:1px solid #ddd;' + (typeof va==='number'&&va>vb?diffStyle:'') + '">' + escapeHtml(String(va)) + '</td>' +
                '<td style="padding:6px 8px;border:1px solid #ddd;' + (typeof vb==='number'&&vb>va?'color:#2e7d32;font-weight:600;':'') + '">' + escapeHtml(String(vb)) + '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    }

})();
