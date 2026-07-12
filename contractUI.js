/**
 * 売買契約書UI - 重説と連携してデータ共有
 *
 * 主な動線:
 *   1) 重説で入力したデータを引き継ぐ（DisclosureUI._sharedOpts として保存）
 *   2) 売主・買主情報を追加入力
 *   3) プレビュー / PDF出力
 *   4) 重説と同時にダウンロードもボタン一発
 */
var ContractUI = (function() {
    'use strict';

    var currentProp = null;
    var currentOpts = {
        formatKey: 'sale_condo',
        seller: {},
        buyer: {},
        broker: {},
        contract: {},
        special: {}
    };

    function open(prop, sharedOpts) {
        currentProp = prop || null;
        if (sharedOpts) {
            // 重説から引継ぎ（formatKey が rent系なら売買にスイッチ）
            currentOpts.formatKey = sharedOpts.formatKey || 'sale_condo';
            if (currentOpts.formatKey.indexOf('rent') === 0) currentOpts.formatKey = 'sale_condo';
            currentOpts.broker = Object.assign({}, sharedOpts.broker || {});
            currentOpts.contract = Object.assign({}, sharedOpts.contract || {});
            currentOpts.special = Object.assign({}, sharedOpts.special || {});
        } else {
            currentOpts.broker = loadBrokerFromStorage();
        }
        renderModal();
    }

    function close() {
        var m = document.getElementById('ctr-modal');
        if (m) m.remove();
    }

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

    function renderModal() {
        close();
        var html = '<div class="suumo-modal-overlay" id="ctr-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:1100px;">';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<div>';
        html += '<h2 style="margin:0;">売買契約書 下書きジェネレータ</h2>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#666;">重要事項説明書と内容を共有して、二重入力を排除します。</p>';
        html += '</div>';
        html += '<button id="ctr-close" class="btn btn-outline">閉じる</button>';
        html += '</div>';

        html += '<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:6px;font-size:11.5px;color:#7f1d1d;margin-bottom:14px;line-height:1.7;">';
        html += '<b>重要：</b>本書は契約書の<u>下書き</u>です。実際の契約締結には、宅地建物取引業者・司法書士・弁護士の最終確認、当事者の記名押印が必要です。';
        html += '</div>';

        // 書式選択
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 0: 書式の選択</div>';
        html += '<select id="ctr-format" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">';
        var formats = Contract.getFormats();
        var formatGroups = [
            { label: '個人売主', keys: ['sale_land', 'sale_landhouse', 'sale_condo'] },
            { label: '宅建業者売主', keys: ['sale_land_biz', 'sale_landhouse_biz', 'sale_condo_biz'] }
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
        html += '</div>';

        // 物件
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 1: 対象物件</div>';
        if (currentProp && currentProp['物件名']) {
            html += '<div style="font-size:13px;"><b>' + esc(currentProp['物件名']) + '</b>';
            html += '<span style="color:#666;margin-left:10px;">' + esc(currentProp['所在地'] || '') + '</span>';
            html += '<span style="color:#3b82f6;margin-left:10px;font-size:11px;">設定済</span></div>';
        } else {
            html += '<div style="font-size:12px;color:#666;">物件が未選択です。物件マスタDBから選択してください。</div>';
        }
        html += '<button id="ctr-pick-property" class="btn btn-outline btn-sm" style="margin-top:8px;">物件マスタから選択</button>';
        html += '</div>';

        // 売主
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 2: 売主（甲）情報</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('氏名・会社名', 'ctr-seller-name', currentOpts.seller.name);
        html += inputRow('TEL', 'ctr-seller-tel', currentOpts.seller.tel);
        html += '</div>';
        html += '<div style="margin-top:8px;">';
        html += '<label style="font-size:11px;color:#555;">住所</label>';
        html += '<input type="text" id="ctr-seller-address" value="' + esc(currentOpts.seller.address || '') + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        html += '</div>';
        html += '</div>';

        // 買主
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 3: 買主（乙）情報</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('氏名・会社名', 'ctr-buyer-name', currentOpts.buyer.name);
        html += inputRow('TEL', 'ctr-buyer-tel', currentOpts.buyer.tel);
        html += '</div>';
        html += '<div style="margin-top:8px;">';
        html += '<label style="font-size:11px;color:#555;">住所</label>';
        html += '<input type="text" id="ctr-buyer-address" value="' + esc(currentOpts.buyer.address || '') + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        html += '</div>';
        html += '</div>';

        // 業者
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 4: 媒介業者情報（業者情報マスタから自動取得）</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('業者名', 'ctr-broker-name', currentOpts.broker.name);
        html += inputRow('免許番号', 'ctr-broker-license', currentOpts.broker.license);
        html += inputRow('業者住所', 'ctr-broker-address', currentOpts.broker.address);
        html += inputRow('TEL', 'ctr-broker-tel', currentOpts.broker.tel);
        html += inputRow('取引士氏名', 'ctr-agent-name', currentOpts.broker.agentName);
        html += inputRow('取引士登録番号', 'ctr-agent-license', currentOpts.broker.agentLicense);
        html += '</div>';
        html += '</div>';

        // 契約条件
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 5: 契約条件（重説と同期）</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('手付金（万円）', 'ctr-deposit', currentOpts.contract.deposit, '例: 200');
        html += inputRow('残代金支払期日', 'ctr-payment-date', currentOpts.contract.paymentDate, 'YYYY/MM/DD');
        html += inputRow('引渡期日', 'ctr-delivery-date', currentOpts.contract.deliveryDate, 'YYYY/MM/DD');
        html += inputRow('ローン特約', 'ctr-loan-condition', currentOpts.contract.loanCondition, '例: 有/無');
        html += inputRow('融資金融機関', 'ctr-loan-lender', currentOpts.special.loanLender, '例: ○○銀行');
        html += inputRow('融資金額（万円）', 'ctr-loan-amount', currentOpts.special.loanAmount, '例: 3500');
        html += '</div>';
        html += '</div>';

        // 特約
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 6: 特約事項</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">';
        html += inputRow('残置物', 'ctr-leftovers', currentOpts.special.leftovers, '例: エアコン2台残置、照明撤去');
        html += inputRow('契約不適合 構造責任期間', 'ctr-warranty-structure', currentOpts.special.warrantyStructure || '3ヶ月');
        html += inputRow('契約不適合 通常責任(ヶ月)', 'ctr-warranty-months', currentOpts.special.warrantyMonths || '3');
        html += inputRow('公租公課 起算日', 'ctr-tax-start-date', currentOpts.special.taxStartDate || '1月1日');
        html += '</div>';
        html += '<label style="display:block;font-size:11px;color:#555;margin-top:8px;">その他特約（自由記述）</label>';
        html += '<textarea id="ctr-other-special" rows="3" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">' + esc(currentOpts.special.otherSpecial || '') + '</textarea>';
        html += '</div>';

        // 協会Word様式への自動差し込み（原本ベース・推奨）
        html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-top:12px;">';
        html += '<div style="font-weight:600;margin-bottom:4px;color:#166534;">協会Word様式へ自動入力（原本ベース・推奨）</div>';
        html += '<div style="font-size:11.5px;color:#166534;line-height:1.7;margin-bottom:10px;">';
        html += '協会公式の売買契約書Word様式に、当事者・物件表示・売買代金を自動入力して記入済みWordを生成します。';
        html += '様式ファイルは templates／売買契約書 フォルダから選択してください（現在対応: 区分所有建物用（敷地権）／土地建物公簿用）。';
        html += '</div>';
        html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
        html += '<input type="file" id="ctr-docx-file" accept=".docx" style="font-size:12px;">';
        html += '<button id="ctr-docx-fill" class="btn btn-primary btn-sm">記入済みWordを生成</button>';
        html += '</div>';
        html += '<div id="ctr-docx-status" style="font-size:12px;margin-top:8px;"></div>';
        html += '</div>';

        // アクション
        html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid #e3e8ef;">';
        html += '<button id="ctr-preview" class="btn btn-outline">HTML下書き（参考）</button>';
        html += '<button id="ctr-export-pdf" class="btn btn-primary">契約書PDF出力（参考）</button>';
        html += '<button id="ctr-export-both" class="btn btn-primary" title="重説+契約書を同時生成">重説と一括出力</button>';
        html += '</div>';

        html += '<div id="ctr-preview-area" style="margin-top:14px;"></div>';
        html += '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('ctr-close').onclick = close;
        document.getElementById('ctr-format').onchange = function() { currentOpts.formatKey = this.value; };
        document.getElementById('ctr-pick-property').onclick = pickProperty;
        document.getElementById('ctr-preview').onclick = preview;
        document.getElementById('ctr-export-pdf').onclick = exportPDF;
        document.getElementById('ctr-export-both').onclick = exportBoth;
        document.getElementById('ctr-docx-fill').onclick = fillOfficialDocx;
    }

    // ===== 協会Word様式への差し込み =====
    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    async function fillOfficialDocx() {
        var status = document.getElementById('ctr-docx-status');
        var fileInput = document.getElementById('ctr-docx-file');
        function setStatus(msg, color) { status.textContent = msg; status.style.color = color || '#166534'; }

        if (typeof DisclosureDocx === 'undefined') { setStatus('差し込みエンジンが読み込まれていません', '#dc2626'); return; }
        if (!currentProp) { setStatus('先に対象物件を選択してください', '#dc2626'); return; }
        if (!fileInput.files || !fileInput.files.length) { setStatus('様式ファイル（.docx）を選択してください', '#dc2626'); return; }

        var master = {};
        try { master = JSON.parse(localStorage.getItem('suumo_broker_master') || '{}'); } catch (e) {}
        var broker = {
            social_name: val('ctr-broker-name') || master.social_name || '',
            license_number: val('ctr-broker-license') || master.license_number || '',
            address: val('ctr-broker-address') || master.address || '',
            phone: val('ctr-broker-tel') || master.phone || ''
        };
        var agent = {
            agentName: val('ctr-agent-name'),
            agentReg: val('ctr-agent-license'),
            office: broker.social_name
        };
        var parties = {
            sellerName: val('ctr-seller-name'),
            buyerName: val('ctr-buyer-name')
        };

        setStatus('生成中…');
        try {
            var buf = await fileInput.files[0].arrayBuffer();
            var values = DisclosureDocx.buildValues(currentProp, broker, agent, parties);
            var result = await DisclosureDocx.fill(buf, values);

            var propName = (currentProp['物件名'] || '物件').replace(/[\\/:*?"<>|]/g, '');
            var a = document.createElement('a');
            a.href = URL.createObjectURL(result.blob);
            a.download = '記入済_売買契約書_' + propName + '.docx';
            a.click();
            setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);

            var msg = result.formatTitle + ' に ' + result.filled + '/' + result.mappable + ' 項目を自動入力しました。手付金・支払期日等の取引条件はWord上でご確認・追記ください。';
            if (result.warnings.length) msg += '　注意: ' + result.warnings.join(' ');
            setStatus(msg, result.warnings.length ? '#b45309' : '#166534');
        } catch (e) {
            setStatus('生成に失敗しました: ' + (e && e.message ? e.message : e), '#dc2626');
        }
    }

    function inputRow(label, id, value, placeholder) {
        var h = '<div>';
        h += '<label style="display:block;font-size:11px;color:#555;">' + esc(label) + '</label>';
        h += '<input type="text" id="' + id + '" value="' + esc(value || '') + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
        h += '</div>';
        return h;
    }

    function pickProperty() {
        if (typeof PropertyMasterUI === 'undefined') { alert('物件マスタが利用できません'); return; }
        PropertyMasterUI.openMasterList(function(record) {
            currentProp = record.prop;
            currentProp.id = record.id;
            collectInputs();
            renderModal();
        });
    }

    function collectInputs() {
        var $v = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
        var fmtSel = document.getElementById('ctr-format');
        if (fmtSel) currentOpts.formatKey = fmtSel.value;
        currentOpts.seller = {
            name: $v('ctr-seller-name'), tel: $v('ctr-seller-tel'), address: $v('ctr-seller-address')
        };
        currentOpts.buyer = {
            name: $v('ctr-buyer-name'), tel: $v('ctr-buyer-tel'), address: $v('ctr-buyer-address')
        };
        currentOpts.broker = {
            name: $v('ctr-broker-name'), license: $v('ctr-broker-license'),
            address: $v('ctr-broker-address'), tel: $v('ctr-broker-tel'),
            agentName: $v('ctr-agent-name'), agentLicense: $v('ctr-agent-license')
        };
        currentOpts.contract = {
            deposit: $v('ctr-deposit') ? $v('ctr-deposit') + '万円' : '',
            paymentDate: $v('ctr-payment-date'),
            deliveryDate: $v('ctr-delivery-date'),
            loanCondition: $v('ctr-loan-condition')
        };
        currentOpts.special = Object.assign({}, currentOpts.special, {
            loanLender: $v('ctr-loan-lender'),
            loanAmount: $v('ctr-loan-amount'),
            leftovers: $v('ctr-leftovers'),
            warrantyStructure: $v('ctr-warranty-structure'),
            warrantyMonths: $v('ctr-warranty-months'),
            taxStartDate: $v('ctr-tax-start-date'),
            otherSpecial: $v('ctr-other-special')
        });
    }

    function preview() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        collectInputs();
        var html = Contract.buildHTML(currentProp, currentOpts);
        document.getElementById('ctr-preview-area').innerHTML =
            '<div style="border:1px solid #e3e8ef;border-radius:8px;padding:14px;background:#fff;margin-top:10px;">' + html + '</div>';
        document.getElementById('ctr-preview-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function exportPDF() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        collectInputs();
        var btn = document.getElementById('ctr-export-pdf');
        btn.disabled = true;
        var orig = btn.textContent;
        btn.textContent = 'PDF生成中...';
        Contract.exportPDF(currentProp, currentOpts)
            .then(function() {
                if (typeof showToast === 'function') showToast('売買契約書PDFを保存しました', 'success');
                btn.disabled = false; btn.textContent = orig;
            })
            .catch(function(err) {
                alert('PDF生成失敗: ' + err.message);
                btn.disabled = false; btn.textContent = orig;
            });
    }

    function exportBoth() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        if (typeof Disclosure === 'undefined') { alert('重説モジュール未読込'); return; }
        collectInputs();
        var btn = document.getElementById('ctr-export-both');
        btn.disabled = true;
        btn.textContent = '一括生成中...';
        // 契約書 → 重説 の順
        Contract.exportPDF(currentProp, currentOpts)
            .then(function() {
                return Disclosure.exportPDF(currentProp, currentOpts);
            })
            .then(function() {
                if (typeof showToast === 'function') showToast('売買契約書+重説 PDFを保存しました', 'success');
                btn.disabled = false; btn.textContent = '重説と一括出力';
            })
            .catch(function(err) {
                alert('一括生成失敗: ' + err.message);
                btn.disabled = false; btn.textContent = '重説と一括出力';
            });
    }

    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    return { open: open, close: close };
})();
