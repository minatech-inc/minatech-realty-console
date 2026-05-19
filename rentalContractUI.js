/**
 * 賃貸借契約書UI - 重説と連携してデータ共有
 *
 * フロー: 物件選択 → 書式選択 → 普通/定期借家 → 当事者情報 → 契約条件 → 特約 → 保証
 *        プレビュー / PDF出力 / 重説と一括出力
 */
var RentalContractUI = (function() {
    'use strict';

    var currentProp = null;
    var currentOpts = {
        formatKey: 'rent_residential',
        contractType: 'normal',
        landlord: {},
        tenant: {},
        guarantor: {},
        broker: {},
        contract: {},
        special: {}
    };

    function open(prop, sharedOpts) {
        currentProp = prop || null;
        if (sharedOpts) {
            currentOpts.formatKey = (sharedOpts.formatKey || '').indexOf('rent') === 0 ? sharedOpts.formatKey : 'rent_residential';
            currentOpts.broker = Object.assign({}, sharedOpts.broker || {});
            currentOpts.contract = Object.assign({}, currentOpts.contract, sharedOpts.contract || {});
            currentOpts.special = Object.assign({}, currentOpts.special, sharedOpts.special || {});
        } else {
            currentOpts.broker = loadBrokerFromStorage();
        }
        renderModal();
    }

    function close() {
        var m = document.getElementById('rct-modal');
        if (m) m.remove();
    }

    function loadBrokerFromStorage() {
        try {
            var raw = localStorage.getItem('rc_suumo_broker');
            if (raw) {
                var b = JSON.parse(raw);
                return {
                    name: b.companyName || '', license: b.licenseNo || '',
                    address: b.address || '', tel: b.tel || '',
                    agentName: '', agentLicense: ''
                };
            }
        } catch (e) {}
        return {};
    }

    function renderModal() {
        close();
        var html = '<div class="suumo-modal-overlay" id="rct-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:1100px;">';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<div>';
        html += '<h2 style="margin:0;">賃貸借契約書 下書きジェネレータ</h2>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#666;">借地借家法準拠。普通借家・定期借家の両方に対応。</p>';
        html += '</div>';
        html += '<button id="rct-close" class="btn btn-outline">閉じる</button>';
        html += '</div>';

        html += '<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:6px;font-size:11.5px;color:#7f1d1d;margin-bottom:14px;line-height:1.7;">';
        html += '<b>重要：</b>本書は契約書の<u>下書き</u>です。実際の契約締結には宅地建物取引業者・弁護士の最終確認、当事者の記名押印が必要です。<br><b>定期借家契約</b>は借地借家法第38条により<u>書面または電磁的記録での契約</u>が必須、かつ事前に「期間満了で終了する旨の説明書面」交付が必要です。';
        html += '</div>';

        // Step 0: 書式選択
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 0: 書式の選択</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += '<div><label style="font-size:11px;color:#555;">対象物件種別</label>';
        html += '<select id="rct-format" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">';
        var formats = RentalContract.getFormats();
        Object.keys(formats).forEach(function(k) {
            html += '<option value="' + k + '"' + (currentOpts.formatKey === k ? ' selected' : '') + '>' + esc(formats[k].label) + '</option>';
        });
        html += '</select></div>';
        html += '<div><label style="font-size:11px;color:#555;">契約類型</label>';
        html += '<select id="rct-contract-type" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">';
        html += '<option value="normal"' + (currentOpts.contractType === 'normal' ? ' selected' : '') + '>普通借家（更新あり）</option>';
        html += '<option value="fixed"' + (currentOpts.contractType === 'fixed' ? ' selected' : '') + '>定期借家（更新なし）</option>';
        html += '</select></div>';
        html += '</div></div>';

        // Step 1: 物件
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 1: 対象物件</div>';
        if (currentProp && currentProp['物件名']) {
            html += '<div style="font-size:13px;"><b>' + esc(currentProp['物件名']) + '</b><span style="color:#666;margin-left:10px;">' + esc(currentProp['所在地'] || '') + '</span>';
            html += '<span style="color:#3b82f6;margin-left:10px;font-size:11px;">設定済</span></div>';
        } else {
            html += '<div style="font-size:12px;color:#666;">物件マスタDBから選択してください。</div>';
        }
        html += '<button id="rct-pick-property" class="btn btn-outline btn-sm" style="margin-top:8px;">物件マスタから選択</button>';
        html += '</div>';

        // Step 2: 賃貸人（甲）
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 2: 賃貸人（甲）情報</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('氏名・会社名', 'rct-landlord-name', currentOpts.landlord.name);
        html += inputRow('TEL', 'rct-landlord-tel', currentOpts.landlord.tel);
        html += '</div>';
        html += '<div style="margin-top:8px;"><label style="font-size:11px;color:#555;">住所</label>';
        html += '<input type="text" id="rct-landlord-address" value="' + esc(currentOpts.landlord.address || '') + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"></div>';
        html += '</div>';

        // Step 3: 賃借人（乙）
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 3: 賃借人（乙）情報</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('氏名', 'rct-tenant-name', currentOpts.tenant.name);
        html += inputRow('TEL', 'rct-tenant-tel', currentOpts.tenant.tel);
        html += inputRow('生年月日', 'rct-tenant-dob', currentOpts.tenant.dob, '例: 1985/03/15');
        html += inputRow('職業', 'rct-tenant-occupation', currentOpts.tenant.occupation);
        html += inputRow('勤務先', 'rct-tenant-employer', currentOpts.tenant.employer);
        html += '</div>';
        html += '<div style="margin-top:8px;"><label style="font-size:11px;color:#555;">住所（現住所）</label>';
        html += '<input type="text" id="rct-tenant-address" value="' + esc(currentOpts.tenant.address || '') + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"></div>';
        html += '</div>';

        // Step 4: 契約条件
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 4: 契約条件</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('賃料（円/月）', 'rct-rent', currentOpts.contract.rent, '例: 85000');
        html += inputRow('共益費（円/月）', 'rct-common-fee', currentOpts.contract.commonFee, '例: 5000');
        html += inputRow('敷金（賃料の何ヶ月分）', 'rct-deposit-months', currentOpts.contract.depositMonths || '2');
        html += inputRow('礼金（賃料の何ヶ月分）', 'rct-key-money-months', currentOpts.contract.keyMoneyMonths || '0');
        html += inputRow('契約開始日', 'rct-term-start', currentOpts.contract.termStart, '例: 2026/06/01');
        html += inputRow('契約終了日', 'rct-term-end', currentOpts.contract.termEnd, '例: 2028/05/31');
        html += inputRow('契約年数', 'rct-term-years', currentOpts.contract.termYears || '2');
        html += inputRow('賃料支払日（毎月）', 'rct-payment-day', currentOpts.contract.paymentDay || '末');
        html += inputRow('解約予告期間', 'rct-notice-months', currentOpts.contract.noticeMonths || '1ヶ月');
        html += inputRow('更新料（賃料の何ヶ月分）', 'rct-renewal-fee-months', currentOpts.contract.renewalFeeMonths || '1');
        html += '</div>';
        html += '</div>';

        // Step 5: 保証
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 5: 連帯保証人 または 保証会社</div>';
        html += '<div style="margin-bottom:8px;"><label style="cursor:pointer;font-size:12px;"><input type="checkbox" id="rct-use-company"' + (currentOpts.guarantor.useCompany ? ' checked' : '') + '> 家賃保証会社を利用する（連帯保証人不要）</label></div>';
        html += '<div id="rct-guarantor-fields">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('連帯保証人氏名', 'rct-guarantor-name', currentOpts.guarantor.name);
        html += inputRow('TEL', 'rct-guarantor-tel', currentOpts.guarantor.tel);
        html += inputRow('乙との関係', 'rct-guarantor-relation', currentOpts.guarantor.relation, '例: 父');
        html += inputRow('連帯保証極度額（円）', 'rct-guarantor-max-amount', currentOpts.guarantor.maxAmount, '例: 2040000（賃料24ヶ月分）');
        html += '</div>';
        html += '<div style="margin-top:8px;"><label style="font-size:11px;color:#555;">住所</label>';
        html += '<input type="text" id="rct-guarantor-address" value="' + esc(currentOpts.guarantor.address || '') + '" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"></div>';
        html += '</div>';
        html += '<div id="rct-company-fields" style="display:none;">';
        html += inputRow('家賃保証会社名', 'rct-company-name', currentOpts.guarantor.companyName, '例: 日本セーフティ');
        html += '</div>';
        html += '</div>';

        // Step 6: 媒介業者
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 6: 媒介業者情報</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('業者名', 'rct-broker-name', currentOpts.broker.name);
        html += inputRow('免許番号', 'rct-broker-license', currentOpts.broker.license);
        html += inputRow('業者住所', 'rct-broker-address', currentOpts.broker.address);
        html += inputRow('TEL', 'rct-broker-tel', currentOpts.broker.tel);
        html += inputRow('取引士氏名', 'rct-agent-name', currentOpts.broker.agentName);
        html += inputRow('取引士登録番号', 'rct-agent-license', currentOpts.broker.agentLicense);
        html += '</div>';
        html += '</div>';

        // Step 7: 特約
        html += '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:8px;">Step 7: 特約事項</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += inputRow('使用目的', 'rct-usage-purpose', currentOpts.special.usagePurpose, '例: 居住用');
        html += inputRow('ペット飼育', 'rct-pet-rule', currentOpts.special.petRule, '例: ペット（犬・猫等）の飼育');
        html += inputRow('楽器演奏', 'rct-music-rule', currentOpts.special.musicRule);
        html += inputRow('滞納による解除', 'rct-arrears-months', currentOpts.special.arrearsMonths || '2ヶ月分以上');
        html += inputRow('駐車場', 'rct-parking', currentOpts.special.parkingArrangement, '例: 別途駐車場契約');
        html += inputRow('火災保険', 'rct-insurance', currentOpts.special.insurance);
        html += '</div>';
        html += '<label style="display:block;font-size:11px;color:#555;margin-top:8px;">その他特約（自由記述）</label>';
        html += '<textarea id="rct-other-special" rows="3" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">' + esc(currentOpts.special.otherSpecial || '') + '</textarea>';
        html += '</div>';

        // アクション
        html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid #e3e8ef;">';
        html += '<button id="rct-preview" class="btn btn-outline">プレビュー</button>';
        html += '<button id="rct-export-pdf" class="btn btn-primary">契約書PDF出力</button>';
        html += '<button id="rct-export-both" class="btn btn-primary" title="重説+契約書を同時生成">重説と一括出力</button>';
        html += '</div>';

        html += '<div id="rct-preview-area" style="margin-top:14px;"></div>';
        html += '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('rct-close').onclick = close;
        document.getElementById('rct-format').onchange = function() { currentOpts.formatKey = this.value; };
        document.getElementById('rct-contract-type').onchange = function() { currentOpts.contractType = this.value; };
        document.getElementById('rct-pick-property').onclick = pickProperty;
        document.getElementById('rct-use-company').onchange = toggleGuarantor;
        toggleGuarantor(); // 初期表示
        document.getElementById('rct-preview').onclick = preview;
        document.getElementById('rct-export-pdf').onclick = exportPDF;
        document.getElementById('rct-export-both').onclick = exportBoth;
    }

    function toggleGuarantor() {
        var useCompany = document.getElementById('rct-use-company').checked;
        document.getElementById('rct-guarantor-fields').style.display = useCompany ? 'none' : 'block';
        document.getElementById('rct-company-fields').style.display = useCompany ? 'block' : 'none';
        currentOpts.guarantor.useCompany = useCompany;
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
        var $c = function(id) { var el = document.getElementById(id); return el ? el.checked : false; };
        currentOpts.formatKey = $v('rct-format');
        currentOpts.contractType = $v('rct-contract-type');
        currentOpts.landlord = {
            name: $v('rct-landlord-name'), tel: $v('rct-landlord-tel'), address: $v('rct-landlord-address')
        };
        currentOpts.tenant = {
            name: $v('rct-tenant-name'), tel: $v('rct-tenant-tel'), address: $v('rct-tenant-address'),
            dob: $v('rct-tenant-dob'), occupation: $v('rct-tenant-occupation'), employer: $v('rct-tenant-employer')
        };
        currentOpts.guarantor = {
            useCompany: $c('rct-use-company'),
            name: $v('rct-guarantor-name'), tel: $v('rct-guarantor-tel'),
            address: $v('rct-guarantor-address'), relation: $v('rct-guarantor-relation'),
            maxAmount: $v('rct-guarantor-max-amount'),
            companyName: $v('rct-company-name')
        };
        currentOpts.broker = {
            name: $v('rct-broker-name'), license: $v('rct-broker-license'),
            address: $v('rct-broker-address'), tel: $v('rct-broker-tel'),
            agentName: $v('rct-agent-name'), agentLicense: $v('rct-agent-license')
        };
        currentOpts.contract = {
            rent: $v('rct-rent'), commonFee: $v('rct-common-fee'),
            depositMonths: $v('rct-deposit-months'), keyMoneyMonths: $v('rct-key-money-months'),
            termStart: $v('rct-term-start'), termEnd: $v('rct-term-end'), termYears: $v('rct-term-years'),
            paymentDay: $v('rct-payment-day'), noticeMonths: $v('rct-notice-months'),
            renewalFeeMonths: $v('rct-renewal-fee-months')
        };
        currentOpts.special = Object.assign({}, currentOpts.special, {
            usagePurpose: $v('rct-usage-purpose'),
            petRule: $v('rct-pet-rule'),
            musicRule: $v('rct-music-rule'),
            arrearsMonths: $v('rct-arrears-months'),
            parkingArrangement: $v('rct-parking'),
            insurance: $v('rct-insurance'),
            otherSpecial: $v('rct-other-special')
        });
    }

    function preview() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        collectInputs();
        var html = RentalContract.buildHTML(currentProp, currentOpts);
        document.getElementById('rct-preview-area').innerHTML =
            '<div style="border:1px solid #e3e8ef;border-radius:8px;padding:14px;background:#fff;margin-top:10px;">' + html + '</div>';
        document.getElementById('rct-preview-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function exportPDF() {
        if (!currentProp) { alert('物件を選択してください'); return; }
        collectInputs();
        var btn = document.getElementById('rct-export-pdf');
        btn.disabled = true;
        var orig = btn.textContent;
        btn.textContent = 'PDF生成中...';
        RentalContract.exportPDF(currentProp, currentOpts)
            .then(function() {
                if (typeof showToast === 'function') showToast('賃貸借契約書PDFを保存しました', 'success');
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
        var btn = document.getElementById('rct-export-both');
        btn.disabled = true;
        btn.textContent = '一括生成中...';
        RentalContract.exportPDF(currentProp, currentOpts)
            .then(function() {
                // Disclosure に賃貸書式を引き継ぐ
                return Disclosure.exportPDF(currentProp, currentOpts);
            })
            .then(function() {
                if (typeof showToast === 'function') showToast('賃貸借契約書+重説 PDFを保存しました', 'success');
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
