/**
 * Realty Console ライセンス管理パネル
 * - オーナーモード（URL に ?owner=minatech）でのみアクセス可能
 * - localStorage に Workers URL + ADMIN_TOKEN を保存
 * - 発行 / 一覧 / 統計 / 設定 の4タブ
 */
(function() {
    'use strict';

    var STORAGE_ENDPOINT = 'rc_license_admin_endpoint';
    var STORAGE_TOKEN    = 'rc_license_admin_token';

    // オーナーモードチェック
    function isOwner() {
        var host = location.hostname;
        if (host === '127.0.0.1' || host === 'localhost') return true;
        if (location.search.indexOf('owner=minatech') >= 0) {
            try { localStorage.setItem('reins_owner_mode', 'minatech'); } catch (e) {}
            return true;
        }
        try { return localStorage.getItem('reins_owner_mode') === 'minatech'; } catch (e) { return false; }
    }

    if (!isOwner()) {
        document.body.innerHTML = '<div style="padding:80px;text-align:center;font-family:sans-serif;color:#475569;">' +
            '<h1 style="color:#dc2626;">403 Forbidden</h1>' +
            '<p>このページはMinaTech社内専用です。<br>オーナー認証が必要です: <code>?owner=minatech</code></p>' +
            '<p style="margin-top:20px;"><a href="/" style="color:#3b82f6;">← トップへ戻る</a></p>' +
            '</div>';
        return;
    }

    var endpoint = localStorage.getItem(STORAGE_ENDPOINT) || '';
    var token    = localStorage.getItem(STORAGE_TOKEN) || '';

    // ===== Auth Gate =====
    if (!endpoint || !token) {
        showAuthGate();
    } else {
        showMain();
    }

    function showAuthGate() {
        document.getElementById('auth-gate').style.display = 'block';
        document.getElementById('main-content').style.display = 'none';
        var btn = document.getElementById('btn-auth-login');
        if (btn && !btn._wired) {
            btn._wired = true;
            btn.onclick = function() {
                var e = document.getElementById('auth-endpoint').value.trim().replace(/\/$/, '');
                var t = document.getElementById('auth-token').value.trim();
                if (!e || !t) {
                    showAuthErr('URLとTOKENの両方を入力してください');
                    return;
                }
                btn.disabled = true;
                btn.textContent = '認証確認中…';
                // /admin/stats で疎通+認証チェック
                fetch(e + '/admin/stats', {
                    headers: { 'X-Admin-Token': t }
                }).then(function(r) {
                    if (r.status === 401) {
                        showAuthErr('ADMIN_TOKEN が不一致です');
                        btn.disabled = false; btn.textContent = 'ログイン';
                        return;
                    }
                    if (!r.ok) {
                        showAuthErr('Workersへの接続に失敗しました (HTTP ' + r.status + ')');
                        btn.disabled = false; btn.textContent = 'ログイン';
                        return;
                    }
                    endpoint = e; token = t;
                    localStorage.setItem(STORAGE_ENDPOINT, e);
                    localStorage.setItem(STORAGE_TOKEN, t);
                    document.getElementById('auth-gate').style.display = 'none';
                    showMain();
                }).catch(function(err) {
                    showAuthErr('通信エラー: ' + err.message);
                    btn.disabled = false; btn.textContent = 'ログイン';
                });
            };
        }
    }
    function showAuthErr(msg) {
        var el = document.getElementById('auth-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function showMain() {
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('auth-gate').style.display = 'none';
        initTabs();
        initIssue();
        initList();
        initStats();
        initSettings();
    }

    // ===== Tabs =====
    function initTabs() {
        var tabs = document.querySelectorAll('.tab');
        var panels = document.querySelectorAll('.tab-panel');
        tabs.forEach(function(t) {
            t.onclick = function() {
                tabs.forEach(function(x) { x.classList.remove('active'); });
                t.classList.add('active');
                var name = t.getAttribute('data-tab');
                panels.forEach(function(p) {
                    p.style.display = (p.getAttribute('data-panel') === name) ? 'block' : 'none';
                });
                if (name === 'list') loadList();
                if (name === 'stats') loadStats();
                if (name === 'settings') fillSettings();
            };
        });
    }

    // ===== Issue =====
    function initIssue() {
        // 既定の有効期限: 1年後
        var defaultExpiry = new Date();
        defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
        document.getElementById('issue-expiry').value = defaultExpiry.toISOString().slice(0, 10);

        document.getElementById('btn-issue').onclick = function() {
            var plan = document.getElementById('issue-plan').value;
            var expiryRaw = document.getElementById('issue-expiry').value;
            var companyCode = document.getElementById('issue-company-code').value.trim().toUpperCase();
            var name = document.getElementById('issue-customer-name').value.trim();
            var email = document.getElementById('issue-customer-email').value.trim();
            var notes = document.getElementById('issue-notes').value.trim();

            if (!expiryRaw) { toast('有効期限を入力', 'error'); return; }
            if (!/^[A-Z0-9]{4}$/.test(companyCode)) { toast('会社コードは英数4文字（例: M001）', 'error'); return; }

            var expiryDate = expiryRaw.replace(/-/g, '');
            var btn = document.getElementById('btn-issue');
            btn.disabled = true; btn.textContent = '発行中…';

            api('POST', '/admin/issue', { plan: plan, expiryDate: expiryDate, companyCode: companyCode, customer: { name: name, email: email, notes: notes } })
                .then(function(data) {
                    btn.disabled = false; btn.textContent = '発行';
                    var html = '<div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:14px;">';
                    html += '<div style="font-weight:600;color:#065f46;margin-bottom:8px;">発行成功</div>';
                    html += '<div style="font-family:monospace;font-size:13px;background:#fff;padding:10px;border-radius:4px;border:1px solid #d1fae5;word-break:break-all;">';
                    html += esc(data.key);
                    html += ' <button class="btn btn-sm" style="margin-left:8px;" onclick="navigator.clipboard.writeText(\'' + data.key + '\');this.textContent=\'コピー済\';">コピー</button>';
                    html += '</div>';
                    html += '<div style="font-size:12px;color:#065f46;margin-top:8px;">';
                    html += '顧客: ' + esc(name || '(未入力)') + ' / プラン: ' + plan + ' / 有効: ' + expiryRaw;
                    html += '</div></div>';
                    document.getElementById('issue-result').innerHTML = html;
                    toast('ライセンスキーを発行しました', 'success');
                    // フォームクリア
                    document.getElementById('issue-customer-name').value = '';
                    document.getElementById('issue-customer-email').value = '';
                    document.getElementById('issue-notes').value = '';
                })
                .catch(function(err) {
                    btn.disabled = false; btn.textContent = '発行';
                    toast('発行失敗: ' + err.message, 'error');
                });
        };
    }

    // ===== List =====
    function initList() {
        document.getElementById('btn-list-refresh').onclick = loadList;
        document.getElementById('list-filter').oninput = renderListCached;
        document.getElementById('list-status-filter').onchange = renderListCached;
    }
    var lastListData = [];
    function loadList() {
        var el = document.getElementById('list-table');
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">読込中...</div>';
        api('GET', '/admin/list')
            .then(function(data) {
                lastListData = data.items || [];
                document.getElementById('list-count').textContent = '(全 ' + lastListData.length + ' 件)';
                renderListCached();
            })
            .catch(function(err) {
                el.innerHTML = '<div style="color:#dc2626;">' + esc(err.message) + '</div>';
            });
    }
    function renderListCached() {
        var filter = document.getElementById('list-filter').value.toLowerCase();
        var status = document.getElementById('list-status-filter').value;
        var items = lastListData.filter(function(r) {
            if (status === 'active' && !(r.status === 'active' && (!r.expiry || parseDate(r.expiry) > new Date()))) return false;
            if (status === 'revoked' && r.status !== 'revoked') return false;
            if (status === 'expired') {
                if (r.status === 'revoked') return false;
                if (r.expiry && parseDate(r.expiry) >= new Date()) return false;
            }
            if (filter) {
                var blob = (r.key + ' ' + (r.customer ? (r.customer.name + ' ' + r.customer.email) : '')).toLowerCase();
                if (blob.indexOf(filter) < 0) return false;
            }
            return true;
        });
        if (items.length === 0) {
            document.getElementById('list-table').innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;">該当ライセンスなし</div>';
            return;
        }
        var html = '<table><thead><tr>';
        html += '<th>キー</th><th>プラン</th><th>顧客</th><th>状態</th><th>発行日</th><th>有効期限</th><th>デバイス</th><th>最終アクセス</th><th>操作</th>';
        html += '</tr></thead><tbody>';
        items.forEach(function(r) {
            var statusKind = r.status === 'revoked' ? 'revoked' :
                             (r.expiry && parseDate(r.expiry) < new Date()) ? 'expired' : 'active';
            var statusLabel = { active: 'アクティブ', revoked: '無効化', expired: '期限切れ' }[statusKind];
            html += '<tr>';
            html += '<td class="key">' + esc(r.key) + '</td>';
            html += '<td>' + esc(r.plan) + '</td>';
            html += '<td>' + esc((r.customer && r.customer.name) || '-') + '<br><span style="font-size:10px;color:#94a3b8;">' + esc((r.customer && r.customer.email) || '') + '</span></td>';
            html += '<td><span class="status-' + statusKind + '">' + statusLabel + '</span></td>';
            html += '<td>' + esc(r.issuedAt ? r.issuedAt.slice(0,10) : '-') + '</td>';
            html += '<td>' + esc(r.expiry ? (r.expiry.slice(0,4)+'/'+r.expiry.slice(4,6)+'/'+r.expiry.slice(6,8)) : '-') + '</td>';
            html += '<td>' + ((r.devices || []).length) + '</td>';
            html += '<td>' + esc(r.lastAccess ? r.lastAccess.slice(0,10) : '-') + '</td>';
            html += '<td>';
            if (statusKind === 'revoked') {
                html += '<button class="btn btn-sm" onclick="window._adm.restore(\'' + r.key + '\')">復活</button>';
            } else {
                html += '<button class="btn btn-sm btn-danger" onclick="window._adm.revoke(\'' + r.key + '\')">無効化</button>';
            }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('list-table').innerHTML = html;
    }

    // ===== Stats =====
    function initStats() {}
    function loadStats() {
        var el = document.getElementById('stats-grid');
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;grid-column:1/-1;">読込中...</div>';
        api('GET', '/admin/stats')
            .then(function(s) {
                var html = '';
                html += card(s.total, '発行総数');
                html += card(s.active, 'アクティブ');
                html += card(s.revoked, '無効化済');
                html += card(s.expired, '期限切れ');
                html += card(s.byPlan.TRL, 'Trial');
                html += card(s.byPlan.STD, 'Standard');
                html += card(s.byPlan.PRO, 'Professional');
                html += card(s.thisMonth, '今月発行');
                el.innerHTML = html;
            })
            .catch(function(err) {
                el.innerHTML = '<div style="color:#dc2626;grid-column:1/-1;">' + esc(err.message) + '</div>';
            });
    }
    function card(num, label) {
        return '<div class="stat-card"><div class="stat-num">' + num + '</div><div class="stat-label">' + esc(label) + '</div></div>';
    }

    // ===== Settings =====
    function initSettings() {
        document.getElementById('btn-save-settings').onclick = function() {
            var e = document.getElementById('setting-endpoint').value.trim().replace(/\/$/, '');
            var t = document.getElementById('setting-admin-token').value.trim();
            if (!e || !t) { toast('URLとTOKENの両方を入力', 'error'); return; }
            localStorage.setItem(STORAGE_ENDPOINT, e);
            localStorage.setItem(STORAGE_TOKEN, t);
            endpoint = e; token = t;
            toast('設定を保存しました', 'success');
        };
        document.getElementById('btn-logout').onclick = function() {
            if (!confirm('保存された URL と TOKEN を消去します')) return;
            localStorage.removeItem(STORAGE_ENDPOINT);
            localStorage.removeItem(STORAGE_TOKEN);
            location.reload();
        };
    }
    function fillSettings() {
        document.getElementById('setting-endpoint').value = endpoint || '';
        document.getElementById('setting-admin-token').value = token || '';
    }

    // ===== Helpers =====
    window._adm = {
        revoke: function(key) {
            var reason = prompt('無効化の理由（メモ）:', '');
            if (reason === null) return;
            api('POST', '/admin/revoke', { key: key, reason: reason })
                .then(function() { toast('ライセンスを無効化', 'success'); loadList(); })
                .catch(function(err) { toast('失敗: ' + err.message, 'error'); });
        },
        restore: function(key) {
            if (!confirm('このライセンスを復活させますか？')) return;
            api('POST', '/admin/restore', { key: key })
                .then(function() { toast('ライセンスを復活', 'success'); loadList(); })
                .catch(function(err) { toast('失敗: ' + err.message, 'error'); });
        }
    };

    function api(method, path, body) {
        return fetch(endpoint + path, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': token
            },
            body: body ? JSON.stringify(body) : undefined
        }).then(function(r) {
            return r.json().then(function(data) {
                if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
                return data;
            });
        });
    }

    function toast(msg, type) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = type || '';
        t.classList.add('in');
        clearTimeout(t._timer);
        t._timer = setTimeout(function() { t.classList.remove('in'); }, 2500);
    }

    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function parseDate(yyyymmdd) {
        return new Date(parseInt(yyyymmdd.slice(0,4)), parseInt(yyyymmdd.slice(4,6))-1, parseInt(yyyymmdd.slice(6,8)));
    }
})();
