/**
 * 重説下書き生成 UI
 * - 物件マスタDBから選択 or 解析中の物件を対象
 * - チェックボックス・特約入力・IT重説URL入力
 * - プレビュー表示
 * - PDFエクスポート
 *
 * UIパターン: 既存 PropertyMasterUI と統一（suumo-modal-overlay クラス利用）
 */
var DisclosureUI = (function() {
    'use strict';

    var currentProp = null;
    var currentOpts = {
        formatKey: null,
        broker: {},
        itDisclosure: { enabled: false },
        contract: {},
        special: {}
    };

    function loadBrokerFromStorage() {
        try {
            var raw = localStorage.getItem('rc_suumo_broker');
            if (raw) {
                var b = JSON.parse(raw);
                return {
                    name: b.companyName || '',
                    license: b.licenseNo || '',
                    address: b.address || '',
                    tel: b.tel || '',
                    agentName: '',
                    agentLicense: ''
                };
            }
        } catch (e) {}
        return {};
    }

    function open(prop) {
        currentProp = prop || null;
        currentOpts.broker = Object.assign({}, loadBrokerFromStorage());
        if (!currentOpts.formatKey && currentProp) {
            currentOpts.formatKey = Disclosure.inferFormatKey(currentProp);
        }
        if (!currentOpts.formatKey) currentOpts.formatKey = 'sale_condo';
        renderModal();
    }

    function close() {
        var m = document.getElementById('dsc-modal');
        if (m) m.remove();
    }

    function renderModal() {
        close();
        var html = '<div class="suumo-modal-overlay" id="dsc-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:1100px;">';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<div>';
        html += '<h2 style="margin:0;">重要事項説明書 下書きジェネレータ</h2>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#666;">宅地建物取引業法第35条の重要事項説明書を、物件マスタDBから下書きとして生成します。</p>';
        html += '</div>';
        html += '<button id="dsc-close" class="btn btn-outline">閉じる</button>';
        html += '</div>';

        // 免責
        html += '<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:6px;font-size:11.5px;color:#7f1d1d;margin-bottom:14px;line-height:1.7;">';
        html += '<b>重要：</b>本機能は重説の<u>下書き作成支援</u>に限定されます。実際の重説は宅地建物取引士の対面/IT重説による説明・記名押印が必要であり、本書面の自動生成は宅建業法上の説明責任を免除しません。記載内容の最終確認は宅建士本人の責任で行ってください。';
        html += '</div>';

        // Step 0: 書式選択
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 0: 書式の選択</div>';
        html += '<select id="dsc-format" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">';
        var formats = Disclosure.getFormats();
        var formatGroups = [
            { label: '売買・交換（個人売主）', keys: ['sale_land', 'sale_landhouse', 'sale_condo'] },
            { label: '売買・交換（宅建業者売主）', keys: ['sale_land_biz', 'sale_landhouse_biz', 'sale_condo_biz'] },
            { label: '賃借', keys: ['rent_residential', 'rent_commercial', 'rent_landhouse'] }
        ];
        formatGroups.forEach(function(g) {
            html += '<optgroup label="' + esc(g.label) + '">';
            g.keys.forEach(function(k) {
                if (formats[k]) {
                    html += '<option value="' + k + '"' + (currentOpts.formatKey === k ? ' selected' : '') + '>' + esc(formats[k].label) + '</option>';
                }
            });
            html += '</optgroup>';
        });
        html += '</select>';
        html += '<div style="font-size:11px;color:#666;margin-top:6px;">物件の種別・売主区分・取引形態に応じた書式を選択してください。書式により記載項目が変わります。</div>';
        html += '</div>';

        // Step 1: 物件選択
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 1: 対象物件</div>';
        if (currentProp && currentProp['物件名']) {
            html += '<div style="font-size:13px;">';
            html += '<b>' + esc(currentProp['物件名']) + '</b>';
            html += '<span style="color:#666;margin-left:10px;">' + esc(currentProp['所在地'] || '') + '</span>';
            html += '<span style="color:#3b82f6;margin-left:10px;font-size:11px;">物件マスタから選択済</span>';
            html += '</div>';
        } else {
            html += '<div style="font-size:12px;color:#666;">物件が未選択です。下のボタンから物件マスタDBで選択してください。</div>';
        }
        html += '<button id="dsc-pick-property" class="btn btn-outline btn-sm" style="margin-top:8px;">物件マスタから選択</button>';
        html += '</div>';

        // Step 2: 業者情報
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 2: 業者情報（業者情報マスタから自動取得）</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('業者名', 'dsc-broker-name', currentOpts.broker.name);
        html += inputRow('免許番号', 'dsc-broker-license', currentOpts.broker.license);
        html += inputRow('業者住所', 'dsc-broker-address', currentOpts.broker.address);
        html += inputRow('TEL', 'dsc-broker-tel', currentOpts.broker.tel);
        html += inputRow('取引士氏名', 'dsc-agent-name', currentOpts.broker.agentName);
        html += inputRow('取引士登録番号', 'dsc-agent-license', currentOpts.broker.agentLicense);
        html += '</div>';
        html += '</div>';

        // Step 3: 契約条件
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 3: 契約条件</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('手付金（万円）', 'dsc-deposit', currentOpts.contract.deposit, '例: 200');
        html += inputRow('残代金支払期日', 'dsc-payment-date', currentOpts.contract.paymentDate, '例: 2026/08/01');
        html += inputRow('引渡期日', 'dsc-delivery-date', currentOpts.contract.deliveryDate, '例: 2026/08/01');
        html += inputRow('ローン特約', 'dsc-loan-condition', currentOpts.contract.loanCondition, '例: 融資金額3500万円、承認期日2026/07/15');
        html += '</div>';
        html += '</div>';

        // Step 4: 特約
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 4: 主要特約（任意・空欄でも下書き生成可）</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('所有者', 'dsc-owner', '');
        html += inputRow('抵当権抹消の見込み', 'dsc-mortgage-release', '');
        html += inputRow('私道負担', 'dsc-private-road', '', '例: 有 (持分1/4、面積5㎡)');
        html += inputRow('飲用水', 'dsc-water', '');
        html += inputRow('下水', 'dsc-sewage', '');
        html += inputRow('ガス', 'dsc-gas', '');
        html += inputRow('残置物', 'dsc-leftovers', '', '例: エアコン2台残置、照明器具・カーテン撤去');
        html += inputRow('契約不適合責任', 'dsc-warranty', '', '例: 引渡から3ヶ月');
        html += '</div>';
        html += '<label style="display:block;font-size:11px;color:#555;margin-top:8px;">その他特約（自由記述）</label>';
        html += '<textarea id="dsc-other-special" rows="3" placeholder="その他必要な特約を記載" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"></textarea>';
        html += '</div>';

        // Step 5: IT重説
        html += '<div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;color:#1e40af;">';
        html += '<label style="cursor:pointer;"><input type="checkbox" id="dsc-it-enabled" style="margin-right:6px;"> Step 5: IT重要事項説明として実施する</label>';
        html += '</div>';
        html += '<div id="dsc-it-fields" style="display:none;margin-top:6px;">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('説明日時', 'dsc-it-datetime', '', '例: 2026/07/20 14:00');
        html += inputRow('使用ソフトウェア', 'dsc-it-software', '', '例: Zoom');
        html += '</div>';
        html += '<div style="margin-top:8px;">';
        html += '<label style="display:block;font-size:11px;color:#555;">ビデオ通話URL</label>';
        html += '<input type="url" id="dsc-it-meeting-url" placeholder="https://zoom.us/j/..." style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        html += '</div>';
        html += '<div style="margin-top:8px;">';
        html += '<label style="display:block;font-size:11px;color:#555;">録画の有無</label>';
        html += '<select id="dsc-it-recording" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        html += '<option value="">選択してください</option>';
        html += '<option value="録画あり（買主同意取得済）">録画あり（買主同意取得済）</option>';
        html += '<option value="録画なし">録画なし</option>';
        html += '</select>';
        html += '</div>';
        html += '<div style="font-size:11px;color:#1e40af;margin-top:8px;line-height:1.7;">';
        html += '国土交通省「ITを活用した重要事項説明に係るマニュアル」遵守事項：通信状態確認、本人確認、書面到達確認の実施を生成PDFに明示します。';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        // アクション
        html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid #e3e8ef;">';
        html += '<button id="dsc-preview" class="btn btn-outline">プレビュー</button>';
        html += '<button id="dsc-export-pdf" class="btn btn-primary">PDF出力</button>';
        html += '</div>';

        // プレビューエリア
        html += '<div id="dsc-preview-area" style="margin-top:14px;"></div>';

        html += '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('dsc-close').onclick = close;
        var fmtSelect = document.getElementById('dsc-format');
        if (fmtSelect) fmtSelect.onchange = function() { currentOpts.formatKey = this.value; };
        document.getElementById('dsc-pick-property').onclick = pickPropertyFromMaster;
        document.getElementById('dsc-it-enabled').onchange = function() {
            document.getElementById('dsc-it-fields').style.display = this.checked ? 'block' : 'none';
        };
        document.getElementById('dsc-preview').onclick = preview;
        document.getElementById('dsc-export-pdf').onclick = exportPDF;
    }

    function inputRow(label, id, value, placeholder) {
        var h = '<div>';
        h += '<label style="display:block;font-size:11px;color:#555;">' + esc(label) + '</label>';
        h += '<input type="text" id="' + id + '" value="' + esc(value || '') + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        h += '</div>';
        return h;
    }

    function pickPropertyFromMaster() {
        if (typeof PropertyMasterUI === 'undefined') {
            alert('物件マスタモジュールが読み込まれていません');
            return;
        }
        // PropertyMasterUI のリスト画面から選択 → currentProp に設定して再レンダリング
        PropertyMasterUI.openMasterList(function(record) {
            currentProp = record.prop;
            currentProp.id = record.id;
            collectInputs();
            renderModal();
        });
    }

    function collectInputs() {
        // 既に入力されている値を currentOpts に保存（再レンダリング時の損失防止）
        var $v = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
        var fmtSel = document.getElementById('dsc-format');
        if (fmtSel) currentOpts.formatKey = fmtSel.value;
        currentOpts.broker = {
            name: $v('dsc-broker-name'),
            license: $v('dsc-broker-license'),
            address: $v('dsc-broker-address'),
            tel: $v('dsc-broker-tel'),
            agentName: $v('dsc-agent-name'),
            agentLicense: $v('dsc-agent-license')
        };
        currentOpts.contract = {
            deposit: $v('dsc-deposit') ? $v('dsc-deposit') + '万円' : '',
            paymentDate: $v('dsc-payment-date'),
            deliveryDate: $v('dsc-delivery-date'),
            loanCondition: $v('dsc-loan-condition')
        };
        currentOpts.special = {
            owner: $v('dsc-owner'),
            mortgageRelease: $v('dsc-mortgage-release'),
            privateRoad: $v('dsc-private-road'),
            water: $v('dsc-water'),
            sewage: $v('dsc-sewage'),
            gas: $v('dsc-gas'),
            leftovers: $v('dsc-leftovers'),
            warranty: $v('dsc-warranty'),
            otherSpecial: $v('dsc-other-special')
        };
        var itEnabled = document.getElementById('dsc-it-enabled');
        currentOpts.itDisclosure = {
            enabled: itEnabled ? itEnabled.checked : false,
            datetime: $v('dsc-it-datetime'),
            software: $v('dsc-it-software'),
            meetingUrl: $v('dsc-it-meeting-url'),
            recording: $v('dsc-it-recording')
        };
    }

    function preview() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        collectInputs();
        var html = Disclosure.buildHTML(currentProp, currentOpts);
        var area = document.getElementById('dsc-preview-area');
        area.innerHTML = '<div style="border:1px solid #e3e8ef;border-radius:8px;padding:14px;background:#fff;margin-top:10px;">' + html + '</div>';
        area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function exportPDF() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            alert('PDFライブラリが読み込まれていません。ページを再読み込みしてからお試しください。');
            return;
        }
        collectInputs();
        var btn = document.getElementById('dsc-export-pdf');
        var orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'PDF生成中...';
        Disclosure.exportPDF(currentProp, currentOpts)
            .then(function() {
                btn.textContent = 'PDF生成完了';
                if (typeof showToast === 'function') showToast('重説下書きPDFを保存しました', 'success');
                setTimeout(function() { btn.textContent = orig; btn.disabled = false; }, 1200);
            })
            .catch(function(err) {
                alert('PDF生成失敗: ' + err.message);
                btn.textContent = orig;
                btn.disabled = false;
            });
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
