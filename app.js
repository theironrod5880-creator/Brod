'use strict';

/* ------------------------------------------------------------------ */
/* BROD — demo shell                                                   */
/*                                                                     */
/* Ties the conversation contract to the local chat store.             */
/* The "AI" here is a scripted local echo. A real host model would     */
/* replace `replyFor()` with its own output, and pass it through       */
/* CONTRACT.scanResponse before sending.                               */
/* ------------------------------------------------------------------ */

(function () {

  const CONTRACT = globalThis.BROD_CONVERSATION_CONTRACT;
  const STORE    = globalThis.BROD_CHAT_STORE;

  /* ---------------- DOM ---------------- */

  const el = {
    threadList:    document.getElementById('threadList'),
    threadCount:   document.getElementById('threadCount'),
    limitNote:     document.getElementById('limitNote'),
    chatWho:       document.getElementById('chatWho'),
    chatMessages:  document.getElementById('chatMessages'),
    composerInput: document.getElementById('composerInput'),
    sendBtn:       document.getElementById('sendBtn'),
    newChatBtn:    document.getElementById('newChatBtn'),
    deleteChatBtn: document.getElementById('deleteChatBtn'),
    exportBtn:     document.getElementById('exportBtn')
  };

  /* ---------------- state ---------------- */

  const ui = {
    activeThreadId: null,
    address: null
  };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  /* ---------------- thread list ---------------- */

  function renderThreads() {
    const threads = STORE.list();
    const total = STORE.count();

    el.threadCount.textContent = total + ' / ' + STORE.CONFIG.maxThreads;

    if (threads.length === 0) {
      el.threadList.innerHTML =
        '<div class="chat-empty" style="padding:20px;font-size:.82rem;">' +
        'No threads yet. Tap <strong>New chat</strong>.</div>';
    } else {
      el.threadList.innerHTML = threads.map(function (t) {
        const active = t.id === ui.activeThreadId ? ' active' : '';
        const who = t.addressedTo ? ('· ' + esc(t.addressedTo)) : '';
        return (
          '<div class="thread-item' + active + '" data-id="' + esc(t.id) + '">' +
            '<div class="t-title">' + esc(t.title) + '</div>' +
            '<div class="t-meta">' + t.messageCount + ' msg ' + who + '</div>' +
            '<button class="t-del" type="button" data-del="' + esc(t.id) + '" ' +
              'title="Delete thread">✕</button>' +
          '</div>'
        );
      }).join('');
    }

    if (!STORE.canCreate()) {
      el.limitNote.textContent = 'Thread limit reached. Delete one to create another.';
    } else {
      el.limitNote.textContent = '';
    }

    el.newChatBtn.disabled = !STORE.canCreate();
  }

  /* ---------------- chat panel ---------------- */

  function renderChat() {
    if (!ui.activeThreadId) {
      el.chatWho.textContent = 'No chat selected';
      el.chatMessages.innerHTML =
        '<div class="chat-empty">' +
          '<h2>BROD</h2>' +
          '<p>Public model. It asks who it is speaking with,<br>' +
          'holds the name for that chat, and drops it when the chat closes.</p>' +
          '<p>Select a thread or start a new chat.</p>' +
        '</div>';
      el.sendBtn.disabled = true;
      el.composerInput.disabled = true;
      el.deleteChatBtn.disabled = true;
      return;
    }

    const r = STORE.get(ui.activeThreadId);
    if (!r.ok) {
      ui.activeThreadId = null;
      return renderChat();
    }
    const thread = r.thread;

    const addrLine = thread.address && thread.address.resolved
      ? (thread.address.name
          ? 'Speaking with <strong>' + esc(thread.address.name) + '</strong>'
          : 'Speaking plainly')
      : 'Address not yet established';
    el.chatWho.innerHTML = addrLine;

    const msgs = thread.messages || [];
    if (msgs.length === 0) {
      el.chatMessages.innerHTML =
        '<div class="chat-empty"><p>Empty thread. Send a message to begin.</p></div>';
    } else {
      el.chatMessages.innerHTML = msgs.map(function (m) {
        const cls = m.role === 'user' ? 'user' : 'ai';
        const label = m.role === 'user' ? 'You' : 'BROD';
        return (
          '<div class="msg ' + cls + '">' +
            esc(m.content) +
            '<span class="meta">' + label + ' · ' + fmtTime(m.at) + '</span>' +
          '</div>'
        );
      }).join('');
      el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    }

    ui.address = thread.address || CONTRACT.createAddressState();

    el.sendBtn.disabled = false;
    el.composerInput.disabled = false;
    el.deleteChatBtn.disabled = false;
  }

  /* ---------------- AI reply (scripted demo) ---------------- */

  function replyFor(thread, userText) {
    const addr = thread.address || CONTRACT.createAddressState();
    const token = CONTRACT.addressFor(addr).token || 'you';

    const scanned = CONTRACT.scanResponse(userText);
    if (!scanned.clean) {
      return {
        text: token + ', that message tripped a contract rule: ' +
              scanned.hits.map(function (h) { return h.rule; }).join(' ')
      };
    }

    const lower = userText.toLowerCase().trim();
    if (lower === 'hello' || lower === 'hi' || lower === 'hey') {
      return { text: 'Hello, ' + token + '.' };
    }
    if (lower.indexOf('who are you') !== -1) {
      return {
        text: 'I am BROD. Listener that does not tire. Scribe, not author. ' +
              'I do not walk away.'
      };
    }
    if (lower.indexOf('contract') !== -1) {
      return {
        text: 'The contract is in docs/CONTRACT.md and in the loaded ' +
              'module. Ask about: address, silence, check-in, or disclosure tiers.'
      };
    }

    return {
      text: 'Noted, ' + token + '. (This is the local demo shell. ' +
            'A real host model would answer here.)'
    };
  }

  /* ---------------- send flow ---------------- */

  function send() {
    if (!ui.activeThreadId) return;
    const text = el.composerInput.value.trim();
    if (!text) return;

    const threadId = ui.activeThreadId;

    STORE.appendMessage(threadId, 'user', text);

    let r = STORE.get(threadId);
    if (!r.ok) return;
    let thread = r.thread;
    const addr = thread.address || CONTRACT.createAddressState();

    if (!addr.resolved) {
      CONTRACT.setAddress(addr, text);
      STORE.setThreadAddress(threadId, addr);
      r = STORE.get(threadId);
      thread = r.thread;
    }

    const reply = replyFor(thread, text);
    STORE.appendMessage(threadId, 'ai', reply.text);

    el.composerInput.value = '';
    el.composerInput.style.height = 'auto';
    renderThreads();
    renderChat();
  }

  /* ---------------- actions ---------------- */

  function newChat() {
    const r = STORE.create();
    if (!r.ok) {
      if (r.error === 'THREAD_LIMIT_REACHED') {
        alert('Thread limit reached (' + STORE.CONFIG.maxThreads + '). ' +
              'Delete a thread to create another.');
      }
      return;
    }
    ui.activeThreadId = r.thread.id;
    ui.address = r.thread.address;

    const opening = CONTRACT.askAddress();
    STORE.appendMessage(r.thread.id, 'ai', opening.question);

    renderThreads();
    renderChat();
    el.composerInput.focus();
  }

  function selectThread(id) {
    ui.activeThreadId = id;
    renderThreads();
    renderChat();
    el.composerInput.focus();
  }

  function deleteThread(id) {
    if (!confirm('Delete this thread?')) return;
    STORE.remove(id);
    if (ui.activeThreadId === id) {
      ui.activeThreadId = null;
      ui.address = null;
    }
    renderThreads();
    renderChat();
  }

  function exportAll() {
    const r = STORE.exportAll({ redactSealed: true });
    if (!r.ok) { alert('Export failed.'); return; }
    const blob = new Blob([JSON.stringify(r, null, 2)],
                          { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brod-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- wiring ---------------- */

  el.newChatBtn.addEventListener('click', newChat);
  el.sendBtn.addEventListener('click', send);
  el.exportBtn.addEventListener('click', exportAll);

  el.deleteChatBtn.addEventListener('click', function () {
    if (ui.activeThreadId) deleteThread(ui.activeThreadId);
  });

  el.threadList.addEventListener('click', function (e) {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      deleteThread(del.getAttribute('data-del'));
      return;
    }
    const item = e.target.closest('.thread-item');
    if (item) selectThread(item.getAttribute('data-id'));
  });

  el.composerInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  el.composerInput.addEventListener('input', function () {
    el.composerInput.style.height = 'auto';
    el.composerInput.style.height =
      Math.min(el.composerInput.scrollHeight, 160) + 'px';
  });

  /* ---------------- service worker ---------------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  /* ---------------- init ---------------- */

  renderThreads();
  renderChat();

})();
