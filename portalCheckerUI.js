/**
 * ポータル横断チェッカー UI
 * - ヘッダーボタンから開くモーダル
 * - Step1: 住所入力 + 物件区分選択 → 各ポータルの検索URLボタンを生成
 * - Step2: ユーザーが該当ページHTMLを貼り付け → ローカル解析
 * - Step3: 構造化結果を3グループ（基本/営業/詳細）で表示 + 画像URL一覧 + 物件マスタへ保存
 */
var PortalCheckerUI = (function() {
    'use strict';

    var lastParsed = null;
    var lastSearchAddress = '';

    function open() {
        renderModal();
    }

    function close() {
        var m = document.getElementById('pc-modal');
        if (m) m.remove();
    }

    function renderModal() {
        close();
        var html = '<div class="suumo-modal-overlay" id="pc-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:1100px;">';

        // ヘッダー
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<div>';
        html += '<h2 style="margin:0;">ポータル横断チェッカー</h2>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#666;">住所から SUUMO / atホーム / HOMES の検索URLを生成し、該当物件ページのHTMLを解析して構造化します。</p>';
        html += '</div>';
        html += '<button id="pc-close" class="btn btn-outline">閉じる</button>';
        html += '</div>';

        // 利用ガイダンス
        html += '<div style="background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:12px;color:#1e40af;line-height:1.6;">';
        html += '<b>使い方:</b> ①住所と区分を入れて検索URLを生成 → ②該当ポータルで物件ページを開く → ③ページ上で<b> Ctrl+A → Ctrl+C </b>でHTMLをコピー → ④下のテキストエリアに貼り付け → ⑤「解析」ボタン<br>';
        html += '<span style="color:#7c2d12;">※ 各ポータルの利用規約に従い、業務上必要な範囲で<u>人間が表示・取得</u>したHTMLのみを解析します。自動取得は行いません。</span>';
        html += '</div>';

        // Step1: 物件名 + 住所入力 + 検索URL生成
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:14px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 1: 検索条件を入力</div>';
        html += '<div style="margin-bottom:8px;">';
        html += '<label style="display:block;font-size:11px;color:#555;margin-bottom:3px;">物件名（マンション名・建物名） <span style="color:#dc2626;">★完全一致での特定に必要</span></label>';
        html += '<input type="text" id="pc-name" placeholder="例: ラシェール鎌倉岡本ハイライズ" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">';
        html += '</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px;">';
        html += '<div style="flex:1;min-width:280px;">';
        html += '<label style="display:block;font-size:11px;color:#555;margin-bottom:3px;">所在地（市区町村レベルジャンプに使用・任意）</label>';
        html += '<input type="text" id="pc-addr" placeholder="例: 神奈川県鎌倉市岡本1022番地10" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">';
        html += '</div>';
        html += '<select id="pc-type" style="padding:8px;border:1px solid #ccc;border-radius:4px;height:38px;">';
        html += '<option value="sale_used">中古売買（マンション/戸建）</option>';
        html += '<option value="sale_new">新築売買（マンション/戸建）</option>';
        html += '<option value="sale_land">売土地</option>';
        html += '<option value="rent">賃貸</option>';
        html += '</select>';
        html += '<button id="pc-gen" class="btn btn-primary" style="height:38px;">検索URL生成</button>';
        html += '</div>';
        html += '<div style="font-size:11px;color:#888;margin-bottom:6px;">※ 物件名を入れると<b>3社全てピンポイント特定</b>できます。住所だけでは番地までヒットしません（Google検索の仕様）。</div>';
        html += '<div id="pc-urls"></div>';
        html += '</div>';

        // Step2: HTMLペースト
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:14px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 2: 物件ページのHTMLを貼り付け</div>';
        html += '<textarea id="pc-html" rows="6" placeholder="該当ページで Ctrl+U → Ctrl+A → Ctrl+C でHTMLソースをコピー、または右クリック → 「ページのソースを表示」 で全選択コピーして貼り付け" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-family:Consolas,monospace;font-size:11px;"></textarea>';
        html += '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;">';
        html += '<button id="pc-parse" class="btn btn-primary">解析</button>';
        html += '<button id="pc-clear" class="btn btn-outline">クリア</button>';
        html += '<span id="pc-parse-status" style="font-size:12px;color:#666;"></span>';
        html += '</div>';
        html += '</div>';

        // Step3: 解析結果
        html += '<div id="pc-result"></div>';

        html += '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('pc-close').onclick = close;
        document.getElementById('pc-gen').onclick = generateUrls;
        document.getElementById('pc-parse').onclick = parsePastedHtml;
        document.getElementById('pc-clear').onclick = function() {
            document.getElementById('pc-html').value = '';
            document.getElementById('pc-parse-status').textContent = '';
            document.getElementById('pc-result').innerHTML = '';
            lastParsed = null;
        };
        // Enterで生成
        document.getElementById('pc-name').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') generateUrls();
        });
        document.getElementById('pc-addr').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') generateUrls();
        });
    }

    function generateUrls() {
        var name = document.getElementById('pc-name').value.trim();
        var addr = document.getElementById('pc-addr').value.trim();
        var type = document.getElementById('pc-type').value;
        var box = document.getElementById('pc-urls');
        if (!name && !addr) {
            box.innerHTML = '<div style="color:#c62828;font-size:13px;">物件名または住所を入力してください。</div>';
            return;
        }
        var urls = PortalChecker.buildSearchUrls(addr, type, name);
        if (!urls) {
            box.innerHTML = '<div style="color:#c62828;font-size:13px;">解析に失敗しました。</div>';
            return;
        }
        lastSearchAddress = addr || name;
        var parsed = urls.addressInfo;
        var html = '';

        // 解析サマリ
        if (addr) {
            html += '<div style="font-size:11px;color:#666;margin-bottom:8px;">';
            html += '住所解析: 都道府県=<b>' + esc(parsed.pref || '(不明)') + '</b>';
            if (parsed.prefInferred) {
                html += ' <span style="background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:8px;margin-left:4px;font-size:10px;">辞書から自動補完</span>';
            }
            html += ' / 市区町村=<b>' + esc(parsed.city) + '</b> / 町名=<b>' + esc(parsed.town) + '</b>' + (parsed.banchi ? ' / 番地=<b>' + esc(parsed.banchi) + '</b>' : '');
            if (urls.hasCitySlug) {
                html += ' <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;margin-left:6px;">辞書ヒット</span>';
            } else if (parsed.city) {
                html += ' <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;margin-left:6px;">辞書外</span>';
            }
            html += '</div>';
        }

        // 【最上位】物件名で site:検索（完全一致狙い）
        if (urls.hasPropertyName) {
            html += '<div style="background:#ecfdf5;border:2px solid #10b981;border-radius:8px;padding:12px;margin-bottom:10px;">';
            html += '<div style="font-size:12px;color:#065f46;font-weight:700;margin-bottom:8px;">';
            html += '★★ 物件名で完全一致検索 <span style="font-size:11px;font-weight:400;color:#047857;">「' + esc(urls.propertyName) + '」</span>';
            html += '</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
            html += '<a href="' + urls.googleByName.suumo.url  + '" target="_blank" rel="noopener" style="display:block;padding:10px;background:#0066cc;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;text-align:center;font-weight:700;">SUUMO で探す →</a>';
            html += '<a href="' + urls.googleByName.athome.url + '" target="_blank" rel="noopener" style="display:block;padding:10px;background:#e60012;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;text-align:center;font-weight:700;">atホーム で探す →</a>';
            html += '<a href="' + urls.googleByName.homes.url  + '" target="_blank" rel="noopener" style="display:block;padding:10px;background:#ff6633;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;text-align:center;font-weight:700;">HOMES で探す →</a>';
            html += '</div>';
            html += '<div style="font-size:10px;color:#047857;margin-top:6px;">※ 表記揺れ（ヶ/ケ、ェ/エ等）はGoogleが自動吸収。該当物件が出ない場合は名前の一部（例: 「ラシェール鎌倉」）で再検索を。</div>';
            html += '</div>';
        } else {
            html += '<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:6px;font-size:12px;color:#7f1d1d;margin-bottom:10px;">';
            html += '<b>物件名が未入力です。</b>住所だけでは完全一致は不可能（番地表記揺れでGoogleが弾く）。販売図面の物件名（マンション名）を入力してください。';
            html += '</div>';
        }

        // 【中位】辞書ヒット時のみ、市区町村ダイレクトURL（候補ブラウジング用）
        if (urls.hasCitySlug) {
            html += '<div style="font-size:11px;color:#666;margin-bottom:6px;font-weight:600;">市区町村単位の検索一覧（候補ブラウジング用）</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">';
            html += renderPortalColumn('SUUMO',            '#0066cc', urls.suumo);
            html += renderPortalColumn('atホーム',          '#e60012', urls.athome);
            html += renderPortalColumn("LIFULL HOME'S",   '#ff6633', urls.homes);
            html += '</div>';
        }

        // 【参考】住所での site:検索（精度低・参考）
        if (urls.google && urls.google.suumo) {
            html += '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;color:#666;">参考：住所全文でのGoogle検索（精度低・番地までヒットしない可能性大）</summary>';
            html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px;">';
            html += '<a href="' + urls.google.suumo.url  + '" target="_blank" rel="noopener" style="display:block;padding:6px;background:#fff;border:1px solid #0066cc;color:#0066cc;border-radius:4px;text-decoration:none;font-size:11px;text-align:center;">SUUMO</a>';
            html += '<a href="' + urls.google.athome.url + '" target="_blank" rel="noopener" style="display:block;padding:6px;background:#fff;border:1px solid #e60012;color:#e60012;border-radius:4px;text-decoration:none;font-size:11px;text-align:center;">atホーム</a>';
            html += '<a href="' + urls.google.homes.url  + '" target="_blank" rel="noopener" style="display:block;padding:6px;background:#fff;border:1px solid #ff6633;color:#ff6633;border-radius:4px;text-decoration:none;font-size:11px;text-align:center;">HOMES</a>';
            html += '</div></details>';
        }

        box.innerHTML = html;
    }

    function renderPortalColumn(name, color, list) {
        var html = '<div style="border:1px solid #e3e8ef;border-radius:6px;padding:10px;background:#fafbfc;">';
        html += '<div style="font-weight:600;color:' + color + ';margin-bottom:6px;font-size:13px;">' + esc(name) + '</div>';
        list.forEach(function(u) {
            html += '<a href="' + u.url + '" target="_blank" rel="noopener" style="display:block;padding:5px 8px;margin-bottom:4px;background:' + color + ';color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">' + esc(u.label) + ' →</a>';
        });
        html += '</div>';
        return html;
    }

    function parsePastedHtml() {
        var html = document.getElementById('pc-html').value;
        var statusEl = document.getElementById('pc-parse-status');
        var resultEl = document.getElementById('pc-result');
        if (!html || html.length < 100) {
            statusEl.textContent = 'HTMLが短すぎます。ページ全体のソースを貼り付けてください。';
            statusEl.style.color = '#c62828';
            return;
        }
        statusEl.textContent = '解析中...';
        statusEl.style.color = '#666';
        setTimeout(function() {
            try {
                var parsed = PortalChecker.parseHtml(html);
                if (!parsed) {
                    statusEl.textContent = '解析に失敗しました。';
                    statusEl.style.color = '#c62828';
                    return;
                }
                lastParsed = parsed;
                var portalLabel = { suumo:'SUUMO', athome:'atホーム', homes:"LIFULL HOME'S", unknown:'不明（汎用パース）' }[parsed.portal] || parsed.portal;
                statusEl.textContent = '解析完了: ' + portalLabel + ' / 抽出フィールド ' + Object.keys(parsed.fields).length + '件 / 画像 ' + parsed.images.length + '件';
                statusEl.style.color = '#2e7d32';
                renderResult(parsed);
            } catch (e) {
                statusEl.textContent = 'エラー: ' + e.message;
                statusEl.style.color = '#c62828';
            }
        }, 50);
    }

    function renderResult(parsed) {
        var resultEl = document.getElementById('pc-result');
        var grouped = PortalChecker.classifyFields(parsed.fields);
        var portalLabel = { suumo:'SUUMO', athome:'atホーム', homes:"LIFULL HOME'S", unknown:'汎用' }[parsed.portal] || parsed.portal;

        var html = '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<div style="font-weight:600;">Step 3: 解析結果 <span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px;">' + esc(portalLabel) + '</span></div>';
        html += '<div>';
        html += '<button id="pc-save-master" class="btn btn-primary btn-sm">物件マスタに保存</button> ';
        html += '<button id="pc-copy-json" class="btn btn-outline btn-sm">JSONコピー</button>';
        html += '</div>';
        html += '</div>';

        // 4カラムグリッド
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">';
        html += renderFieldGroup('基本情報', grouped.basic, '#3b82f6');
        html += renderFieldGroup('営業情報', grouped.sales, '#10b981');
        html += renderFieldGroup('詳細条件', grouped.detail, '#8b5cf6');
        html += renderFieldGroup('その他', grouped.other, '#6b7280');
        html += '</div>';

        // 画像URL一覧
        if (parsed.images.length > 0) {
            html += '<div style="margin-top:14px;">';
            html += '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">画像URL一覧 (' + parsed.images.length + '件)</div>';
            html += '<div style="background:#f8fafc;border:1px solid #e3e8ef;border-radius:6px;padding:8px;max-height:200px;overflow:auto;">';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:8px;">';
            parsed.images.slice(0, 24).forEach(function(src) {
                html += '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" loading="lazy" style="width:100%;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;"></a>';
            });
            html += '</div>';
            html += '<details><summary style="cursor:pointer;font-size:12px;color:#3b82f6;">URLリストを表示</summary>';
            html += '<textarea readonly style="width:100%;height:120px;font-family:Consolas,monospace;font-size:10px;border:1px solid #e3e8ef;border-radius:4px;padding:6px;margin-top:6px;">' + esc(parsed.images.join('\n')) + '</textarea>';
            html += '</details>';
            html += '</div></div>';
        }

        html += '</div>';
        resultEl.innerHTML = html;

        document.getElementById('pc-save-master').onclick = function() {
            if (typeof PropertyMaster === 'undefined' || typeof PropertyMasterUI === 'undefined') {
                alert('物件マスタモジュールが読み込まれていません。');
                return;
            }
            var prop = PortalChecker.toMasterProperty(parsed, lastSearchAddress);
            // 既存のsaveFromAnalysisを再利用
            PropertyMasterUI.saveFromAnalysis(prop);
        };
        document.getElementById('pc-copy-json').onclick = function() {
            var payload = {
                portal: parsed.portal,
                searchAddress: lastSearchAddress,
                fields: parsed.fields,
                imagesCount: parsed.images.length,
                images: parsed.images
            };
            var json = JSON.stringify(payload, null, 2);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(json).then(function() {
                    flashStatus(document.getElementById('pc-copy-json'), 'コピー済み');
                });
            } else {
                var ta = document.createElement('textarea');
                ta.value = json; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
                flashStatus(document.getElementById('pc-copy-json'), 'コピー済み');
            }
        };
    }

    function renderFieldGroup(title, fields, color) {
        var keys = Object.keys(fields);
        var html = '<div style="border:1px solid #e3e8ef;border-radius:6px;overflow:hidden;">';
        html += '<div style="background:' + color + '11;color:' + color + ';padding:6px 10px;font-weight:600;font-size:12px;border-bottom:1px solid #e3e8ef;">' + esc(title) + ' (' + keys.length + ')</div>';
        if (keys.length === 0) {
            html += '<div style="padding:10px;color:#999;font-size:11px;">該当項目なし</div>';
        } else {
            html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
            keys.forEach(function(k) {
                html += '<tr style="border-bottom:1px solid #f0f0f0;">';
                html += '<th style="text-align:left;padding:5px 8px;background:#fafbfc;font-weight:500;color:#555;width:38%;vertical-align:top;">' + esc(k) + '</th>';
                html += '<td style="padding:5px 8px;color:#222;">' + esc(fields[k]) + '</td>';
                html += '</tr>';
            });
            html += '</table>';
        }
        html += '</div>';
        return html;
    }

    function flashStatus(btn, msg) {
        var orig = btn.textContent;
        btn.textContent = msg;
        setTimeout(function() { btn.textContent = orig; }, 1500);
    }

    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    return {
        open: open,
        close: close
    };
})();
