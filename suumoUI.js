/**
 * SUUMO 入稿UI
 * - 業者マスタ設定モーダル
 * - 物件→SUUMO入稿シート出力モーダル
 * - 画像コンプライアンス警告
 */
var SuumoUI = (function() {
    'use strict';

    var BROKER_KEY = 'suumo_broker_master';

    function loadBroker() {
        try {
            var raw = localStorage.getItem(BROKER_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return Object.assign({}, SuumoSpec.DEFAULT_BROKER);
    }
    function saveBroker(broker) {
        try { localStorage.setItem(BROKER_KEY, JSON.stringify(broker)); } catch (e) {}
    }

    // ======== 業者マスタ設定モーダル ========
    function openBrokerSettings() {
        var current = loadBroker();
        var html = '<div class="suumo-modal-overlay" id="suumo-broker-modal">';
        html += '<div class="suumo-modal-content">';
        html += '<h2>業者情報マスタ設定（SUUMO入稿用）</h2>';
        html += '<p style="font-size:12px;color:#666;">広告主として表示される情報。物件ごとに個別変更も可能です。</p>';
        var fields = [
            { k: 'social_name',         label: '正式社名（法人格付き）', placeholder: '株式会社MinaTech' },
            { k: 'license_number',      label: '宅建免許番号',         placeholder: '神奈川県知事(1)第○○○○号' },
            { k: 'association',         label: '所属団体',             placeholder: '（公社）神奈川県宅地建物取引業協会会員' },
            { k: 'phone',               label: '問合せ電話番号',       placeholder: '0120-XXX-XXX' },
            { k: 'address',             label: '事務所住所',           placeholder: '〒251-0055 神奈川県藤沢市南藤沢3-12' },
            { k: 'association_council', label: '加盟公取協',           placeholder: '首都圏不動産公正取引協議会加盟事業者' },
            { k: 'commission_note',     label: '仲介手数料表記',       placeholder: '物件本体価格の3.3%+6.6万円（消費税込）' }
        ];
        fields.forEach(function(f) {
            html += '<div style="margin:10px 0;">';
            html += '<label style="display:block;font-size:12px;color:#555;">' + f.label + '</label>';
            html += '<input type="text" id="bf-' + f.k + '" value="' + escapeAttr(current[f.k] || '') +
                '" placeholder="' + escapeAttr(f.placeholder) + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">';
            html += '</div>';
        });
        html += '<div style="text-align:right;margin-top:14px;">';
        html += '<button id="suumo-broker-cancel" class="btn btn-outline">キャンセル</button> ';
        html += '<button id="suumo-broker-save" class="btn btn-primary">保存</button>';
        html += '</div>';
        html += '</div></div>';

        appendModal(html);
        document.getElementById('suumo-broker-cancel').onclick = closeModals;
        document.getElementById('suumo-broker-save').onclick = function() {
            var data = {};
            fields.forEach(function(f) {
                data[f.k] = document.getElementById('bf-' + f.k).value.trim();
            });
            saveBroker(data);
            closeModals();
            if (typeof showToast === 'function') showToast('業者情報を保存しました', 'success');
            else alert('業者情報を保存しました');
        };
    }

    // ======== 物件→SUUMO入稿シート出力モーダル ========
    function exportProperty(prop) {
        var broker = loadBroker();
        if (!broker.social_name || !broker.license_number) {
            alert('先に「業者情報マスタ設定」で社名と宅建免許番号を登録してください');
            openBrokerSettings();
            return;
        }
        var model = SuumoExporter.buildSuumoModel(prop, broker);
        var sheet = SuumoExporter.renderInsertSheet(model);
        var compliance = SuumoExporter.checkCompliance(model);

        var html = '<div class="suumo-modal-overlay" id="suumo-export-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:980px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<h2 style="margin:0;">SUUMO入稿シート</h2>';
        html += '<div>';
        html += '<button id="suumo-export-print" class="btn btn-outline">印刷</button> ';
        html += '<button id="suumo-export-json" class="btn btn-outline">JSON</button> ';
        html += '<button id="suumo-export-csv"  class="btn btn-outline">CSV</button> ';
        html += '<button id="suumo-export-close" class="btn btn-outline">閉じる</button>';
        html += '</div></div>';

        // コンプライアンスチェック結果
        if (compliance.length > 0) {
            html += '<div style="background:#fff3e0;border-left:4px solid #f57c00;padding:10px 14px;margin-bottom:14px;">';
            html += '<b style="color:#e65100;">コンプライアンスチェック: ' + compliance.length + '件の指摘</b>';
            html += '<ul style="margin:6px 0 0 18px;font-size:12px;color:#444;">';
            compliance.forEach(function(c) {
                var color = c.severity === 'error' ? '#c62828' : c.severity === 'warning' ? '#ef6c00' : '#666';
                html += '<li style="color:' + color + ';">[' + c.severity.toUpperCase() + '] ' + escapeHtml(c.message) + '</li>';
            });
            html += '</ul></div>';
        } else {
            html += '<div style="background:#e8f5e9;border-left:4px solid #43a047;padding:10px 14px;margin-bottom:14px;color:#2e7d32;">';
            html += '<b>コンプライアンスチェック: OK</b> 必須項目漏れ・禁止用語ともに問題なし';
            html += '</div>';
        }

        html += '<div id="suumo-sheet-body">' + sheet + '</div>';
        html += '</div></div>';

        appendModal(html);

        // ボタンバインド
        document.getElementById('suumo-export-close').onclick = closeModals;
        document.getElementById('suumo-export-print').onclick = function() {
            var w = window.open('', '_blank');
            w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>SUUMO入稿シート</title></head><body>');
            w.document.write(document.getElementById('suumo-sheet-body').innerHTML);
            w.document.write('</body></html>');
            w.document.close();
            w.print();
        };
        document.getElementById('suumo-export-json').onclick = function() {
            downloadFile('suumo_' + (prop['物件名'] || 'property') + '.json',
                SuumoExporter.exportJSON(model), 'application/json');
        };
        document.getElementById('suumo-export-csv').onclick = function() {
            downloadFile('suumo_' + (prop['物件名'] || 'property') + '.csv',
                SuumoExporter.exportCSV([model]), 'text/csv;charset=utf-8');
        };

        // コピーボタンの動作
        document.querySelectorAll('.suumo-copy-btn').forEach(function(b) {
            b.onclick = function() {
                var span = b.previousElementSibling;
                var text = span.getAttribute('data-copy-text') || span.textContent;
                navigator.clipboard.writeText(text).then(function() {
                    var orig = b.textContent;
                    b.textContent = 'コピー済';
                    b.style.background = '#388e3c';
                    setTimeout(function() {
                        b.textContent = orig;
                        b.style.background = '#4caf50';
                    }, 1200);
                });
            };
        });
    }

    // ======== 画像コンプライアンス簡易チェッカー ========
    // ファイルから画像メタを読み出し、警告を返す（ヒューリスティック）
    function checkImage(file) {
        return new Promise(function(resolve) {
            var img = new Image();
            var url = URL.createObjectURL(file);
            img.onload = function() {
                var warnings = [];
                // サイズチェック（SUUMO推奨 750x500前後）
                if (img.width < 600 || img.height < 400) {
                    warnings.push('解像度が低い可能性: ' + img.width + 'x' + img.height + '（推奨600x400以上）');
                }
                if (img.width > 4000 || img.height > 4000) {
                    warnings.push('解像度が極端に高い: ファイルサイズが大きすぎる可能性');
                }
                // ファイル名にナンバープレートっぽい数字や個人名が含まれる
                var fname = file.name || '';
                if (/(\d{2,4}[-\s]?\d{2,4})/.test(fname)) {
                    warnings.push('ファイル名に数字列: 車ナンバーが含まれていないか確認');
                }
                if (/(様|さん|表札)/.test(fname)) {
                    warnings.push('ファイル名に個人情報的キーワード: 表札・人物の写り込みを確認');
                }
                URL.revokeObjectURL(url);
                resolve({
                    width: img.width, height: img.height,
                    warnings: warnings
                });
            };
            img.onerror = function() {
                URL.revokeObjectURL(url);
                resolve({ width: 0, height: 0, warnings: ['画像読み込みに失敗'] });
            };
            img.src = url;
        });
    }

    // ======== ヘルパー ========
    function appendModal(html) {
        closeModals();
        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);
    }
    function closeModals() {
        ['suumo-broker-modal', 'suumo-export-modal'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.remove();
        });
    }
    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }
    function downloadFile(filename, content, mime) {
        var blob = new Blob([content], { type: mime || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    return {
        openBrokerSettings: openBrokerSettings,
        exportProperty: exportProperty,
        checkImage: checkImage,
        loadBroker: loadBroker,
        saveBroker: saveBroker
    };
})();

// SUUMO モーダル用 CSS
(function() {
    var s = document.createElement('style');
    s.textContent =
        '.suumo-modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:flex-start;padding:30px 20px;overflow:auto;}' +
        '.suumo-modal-content{background:#fff;border-radius:8px;padding:24px;max-width:680px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,0.3);}' +
        '.suumo-modal-content h2{margin-top:0;border-bottom:2px solid #4caf50;padding-bottom:6px;}' +
        '.suumo-copy-btn:hover{background:#388e3c !important;}';
    document.head.appendChild(s);
})();
