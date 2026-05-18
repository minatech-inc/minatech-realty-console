/**
 * MinaTech AI Chat Widget
 *
 * 使い方:
 *   <link rel="stylesheet" href="chat-widget.css">
 *   <script src="chat-widget.js"
 *           data-endpoint="https://chat-proxy.<subdomain>.workers.dev"
 *           data-tier="public"   <!-- public / standard / professional -->
 *           data-greeting="不動産業務について何でも聞いてください"
 *           defer></script>
 *
 * オプション:
 *   data-tier               : public(LP) / standard / professional
 *   data-endpoint           : Cloudflare Workers の URL
 *   data-greeting           : 初期メッセージ
 *   data-license-localstorage-key : ライセンスキーが保存されている localStorage キー名
 *   data-suggestions        : 初期サジェスト（| 区切り）
 */
(function() {
    'use strict';

    var script = document.currentScript || (function() {
        var s = document.getElementsByTagName('script');
        return s[s.length - 1];
    })();

    var ENDPOINT = script.getAttribute('data-endpoint') || '';
    var TIER = script.getAttribute('data-tier') || 'public';
    var GREETING = script.getAttribute('data-greeting') || 'MinaTech Realty Console について、料金・機能・サポート範囲などお気軽にお尋ねください。';
    var LICENSE_KEY = script.getAttribute('data-license-localstorage-key') || 'reins_analyzer_license';
    var SUGGESTIONS_RAW = script.getAttribute('data-suggestions') || '料金プランを教えて|途中解約はできる?|スコアリングの仕組みは?|データはどこに保存される?';
    var SUGGESTIONS = SUGGESTIONS_RAW.split('|').map(function(s) { return s.trim(); }).filter(Boolean);

    if (!ENDPOINT) {
        console.warn('[MTC Chat] data-endpoint が未設定のためチャットウィジェットは無効化されます');
        return;
    }

    var history = [];

    function getLicense() {
        try { return localStorage.getItem(LICENSE_KEY) || ''; } catch (e) { return ''; }
    }

    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function linkify(text) {
        return esc(text).replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    function el(tag, attrs, children) {
        var e = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'class') e.className = attrs[k];
                else if (k === 'html') e.innerHTML = attrs[k];
                else e.setAttribute(k, attrs[k]);
            }
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(function(c) {
                if (typeof c === 'string') e.appendChild(document.createTextNode(c));
                else if (c) e.appendChild(c);
            });
        }
        return e;
    }

    // ===== UI Build =====
    var toggleBtn = el('button', { class: 'mtc-chat-toggle', 'aria-label': 'AIサポートチャットを開く', html:
        '<span class="mtc-chat-toggle-pulse"></span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
        '</svg>'
    });

    var panel = el('div', { class: 'mtc-chat-panel', role: 'dialog' });

    var header = el('div', { class: 'mtc-chat-header' }, [
        el('div', null, [
            el('div', { class: 'mtc-chat-header-title' }, 'MinaTech AIアシスタント'),
            el('div', { class: 'mtc-chat-header-sub' }, '不動産業務・料金・機能について即答します')
        ]),
        el('button', { class: 'mtc-chat-close', 'aria-label': '閉じる', html:
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        })
    ]);

    var body = el('div', { class: 'mtc-chat-body' });
    var suggestionsBox = el('div', { class: 'mtc-chat-suggestions' });
    var inputWrap = el('div', { class: 'mtc-chat-input-wrap' });
    var input = el('textarea', { class: 'mtc-chat-input', rows: '1', placeholder: 'メッセージを入力（Enterで送信、Shift+Enterで改行）' });
    var sendBtn = el('button', { class: 'mtc-chat-send', 'aria-label': '送信', html:
        '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
    });
    inputWrap.appendChild(input);
    inputWrap.appendChild(sendBtn);

    var quotaInfo = el('span', { class: 'mtc-chat-quota' }, '');
    var footer = el('div', { class: 'mtc-chat-footer' }, [
        quotaInfo,
        el('span', { class: 'mtc-chat-disclaimer' }, 'AI回答は参考情報。最終判断は人間が行ってください')
    ]);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(suggestionsBox);
    panel.appendChild(inputWrap);
    panel.appendChild(footer);

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // ===== Initial greeting =====
    addMessage('bot', GREETING);
    renderSuggestions(SUGGESTIONS);

    // ===== Events =====
    var opened = false;
    toggleBtn.addEventListener('click', function() {
        opened = !opened;
        panel.classList.toggle('in', opened);
        if (opened) {
            input.focus();
            fetchQuota();
        }
    });
    header.querySelector('.mtc-chat-close').addEventListener('click', function() {
        opened = false;
        panel.classList.remove('in');
    });
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    input.addEventListener('input', function() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    function renderSuggestions(items) {
        suggestionsBox.innerHTML = '';
        items.forEach(function(text) {
            var b = el('button', { class: 'mtc-chat-suggestion' }, text);
            b.addEventListener('click', function() {
                input.value = text;
                send();
            });
            suggestionsBox.appendChild(b);
        });
    }

    function addMessage(role, text) {
        var cls = role === 'user' ? 'mtc-chat-msg-user' :
                  role === 'system' ? 'mtc-chat-msg-system' :
                  role === 'error' ? 'mtc-chat-msg-error' : 'mtc-chat-msg-bot';
        var msg = el('div', { class: 'mtc-chat-msg ' + cls, html: linkify(text) });
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
        return msg;
    }

    function addTyping() {
        var t = el('div', { class: 'mtc-chat-typing', html: '<span></span><span></span><span></span>' });
        body.appendChild(t);
        body.scrollTop = body.scrollHeight;
        return t;
    }

    function send() {
        var text = (input.value || '').trim();
        if (!text) return;
        if (text.length > 2000) {
            addMessage('error', 'メッセージが長すぎます（2000文字以内）');
            return;
        }

        addMessage('user', text);
        history.push({ role: 'user', content: text });
        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;
        suggestionsBox.innerHTML = '';

        var typing = addTyping();

        fetch(ENDPOINT.replace(/\/$/, '') + '/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tier: TIER,
                license: getLicense(),
                message: text,
                history: history.slice(0, -1)
            })
        }).then(function(res) {
            return res.json().then(function(data) { return { status: res.status, data: data }; });
        }).then(function(r) {
            typing.remove();
            sendBtn.disabled = false;
            if (r.status === 429) {
                addMessage('system', r.data.error || '今月の利用上限に到達しました');
                return;
            }
            if (r.status !== 200 || !r.data.reply) {
                addMessage('error', r.data.error || 'エラーが発生しました。時間をおいて再度お試しください。');
                return;
            }
            addMessage('bot', r.data.reply);
            history.push({ role: 'assistant', content: r.data.reply });
            if (typeof r.data.quotaUsed === 'number' && typeof r.data.quotaLimit === 'number') {
                quotaInfo.textContent = '今月: ' + r.data.quotaUsed + '/' + r.data.quotaLimit + '問';
            }
        }).catch(function(err) {
            typing.remove();
            sendBtn.disabled = false;
            addMessage('error', '通信エラー: ' + err.message);
        });
    }

    function fetchQuota() {
        var url = ENDPOINT.replace(/\/$/, '') + '/quota?tier=' + encodeURIComponent(TIER);
        if (TIER !== 'public') {
            url += '&license=' + encodeURIComponent(getLicense());
        }
        fetch(url).then(function(r) { return r.json(); }).then(function(d) {
            if (d && typeof d.used === 'number') {
                quotaInfo.textContent = '今月: ' + d.used + '/' + d.limit + '問';
            }
        }).catch(function() { /* silent */ });
    }
})();
