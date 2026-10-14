'use strict';

/* ------------------------------------------------------------------ */
/* BROD — Gemini-connected shell                                       */
/* ------------------------------------------------------------------ */

(function () {

  const CONTRACT = globalThis.BROD_CONVERSATION_CONTRACT;
  const STORE    = globalThis.BROD_CHAT_STORE;

  const API_KEY_STORAGE = 'brod_gemini_key_v1';
  const GEMINI_MODEL    = 'gemini-2.5-flash';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  const ATTACH_DB = 'brod_attachments_v1';
  const ATTACH_STORE = 'blobs';

  function openAttachDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(ATTACH_DB, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATTACH_STORE)) {
          db.createObjectStore(ATTACH_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }
  async function putBlob(id, blob, meta) {
    const db = await openAttachDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(ATTACH_STORE, 'readwrite');
      tx.objectStore(ATTACH_STORE).put({ id: id, blob: blob, type: blob.type, size: blob.size, name: meta && meta.name ? meta.name : id });
      tx.oncomplete = function () { resolve(true); };
      tx.onerror    = function () { reject(tx.error); };
    });
  }
  async function getBlob(id) {
    const db = await openAttachDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(ATTACH_STORE, 'readonly');
      const req = tx.objectStore(ATTACH_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror   = function () { reject(req.error); };
    });
  }

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
    exportBtn:     document.getElementById('exportBtn'),
    settingsBtn:   document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    apiKeyInput:   document.getElementById('apiKeyInput'),
    saveKeyBtn:    document.getElementById('saveKeyBtn'),
    clearKeyBtn:   document.getElementById('clearKeyBtn'),
    settingsStatus:document.getElementById('settingsStatus'),
    modelBadge:    document.getElementById('modelBadge'),
    micDictateBtn: document.getElementById('micDictateBtn'),
    micRecordBtn:  document.getElementById('micRecordBtn'),
    photoBtn:      document.getElementById('photoBtn'),
    videoBtn:      document.getElementById('videoBtn'),
    fileBtn:       document.getElementById('fileBtn'),
    fileInput:     document.getElementById('fileInput'),
    photoInput:    document.getElementById('photoInput'),
    videoInput:    document.getElementById('videoInput'),
    recorderBar:   document.getElementById('recorderBar'),
    recorderStatus:document.getElementById('recorderStatus'),
    stopRecordBtn: document.getElementById('stopRecordBtn'),
    pendingAttach: document.getElementById('pendingAttach')
  };

  const ui = {
    activeThreadId: null,
    pendingAttachment: null,
    recorder: null,
    recorderChunks: [],
    recorderMode: null,
    blobUrls: new Map(),
    recognition: null,
    dictating: false,
    sending: false
  };

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
    catch (_) { return ''; }
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }
  function newAttachId() {
    return 'at_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function showRecorder(status, show) {
    el.recorderStatus.textContent = status || 'Recording…';
    el.recorderBar.classList.toggle('hidden', !show);
  }
  function setPendingAttachment(attach) {
    ui.pendingAttachment = attach || null;
    el.pendingAttach.textContent = attach ? ('· ' + attach.kind + ' ready') : '';
  }

  /* ---------------- API key ---------------- */

  function getApiKey() { return localStorage.getItem(API_KEY_STORAGE) || ''; }
  function setApiKey(key) { localStorage.setItem(API_KEY_STORAGE, key.trim()); updateModelBadge(); }
  function clearApiKey() { localStorage.removeItem(API_KEY_STORAGE); updateModelBadge(); }
  function updateModelBadge() {
    const key = getApiKey();
    el.modelBadge.textContent = key ? 'Gemini ' + GEMINI_MODEL : 'demo mode';
  }
/* ---------------- Gemini call ---------------- */

function buildSystemPrompt(addressName) {
  return [
    'You are BROD.',
    'Role: ' + CONTRACT.CONTRACT.role,
    'Address rule: ' + CONTRACT.CONTRACT.addressRule.rule,
    addressName
      ? ('Current addressee name: ' + addressName + '. Use it naturally, not mechanically.')
      : 'Addressee name not yet established. Do not invent one.',
    'Posture: ' + CONTRACT.CONTRACT.posture.join(' '),
    'Disclosure: ' + CONTRACT.CONTRACT.disclosure.rules.join(' '),
    'Boundaries: ' + CONTRACT.CONTRACT.boundaries.join(' '),
    'Silence rule: ' + CONTRACT.CONTRACT.silenceRule
  ].join('\n\n');
}

function buildHistory(thread) {
  const msgs = thread.messages || [];
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m.content || !m.content.trim()) continue;
    if (m.content.indexOf('Who am I speaking with?') === 0) continue;
    out.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    });
  }
  while (out.length && out[out.length - 1].role === 'user') {
    out.pop();
  }
  if (out.length && out[0].role !== 'user') {
    out.shift();
  }
  return out.slice(-20);
}

async function callGemini(systemPrompt, history) {
  const key = getApiKey();
  if (!key) {
    return { ok: false, error: 'NO_API_KEY', message: 'Open Settings and paste your Gemini API key.' };
  }
  const url = GEMINI_ENDPOINT + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      let detail = errText.slice(0, 300);
      try {
        const j = JSON.parse(errText);
        if (j.error && j.error.message) detail = j.error.message;
      } catch (_) {}
      return { ok: false, error: 'API_ERROR', message: detail, status: res.status };
    }
    const data = await res.json();
    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(function (p) { return p.text || ''; }).join('')
      : '';
    if (!text) {
      const block = candidate && candidate.finishReason ? candidate.finishReason : 'unknown';
      return { ok: false, error: 'EMPTY_RESPONSE', message: 'No text returned (finishReason: ' + block + ')' };
    }
    return { ok: true, text: text };
  } catch (e) {
    return { ok: false, error: 'NETWORK_ERROR', message: e.message || 'Could not reach Gemini.' };
  }
}
  /* ---------------- render ---------------- */

  function renderThreads() {
    const threads = STORE.list();
    el.threadCount.textContent = STORE.count() + ' / ' + STORE.CONFIG.maxThreads;
    if (threads.length === 0) {
      el.threadList.innerHTML = '<div class="chat-empty" style="padding:20px;font-size:.82rem;">No threads yet. Tap <strong>New chat</strong>.</div>';
    } else {
      el.threadList.innerHTML = threads.map(function (t) {
        const active = t.id === ui.activeThreadId ? ' active' : '';
        const who = t.addressedTo ? ('· ' + esc(t.addressedTo)) : '';
        return '<div class="thread-item' + active + '" data-id="' + esc(t.id) + '">' +
               '<div class="t-title">' + esc(t.title) + '</div>' +
               '<div class="t-meta">' + t.messageCount + ' msg ' + who + '</div>' +
               '<button class="t-del" type="button" data-del="' + esc(t.id) + '">✕</button>' +
               '</div>';
      }).join('');
    }
    el.limitNote.textContent = STORE.canCreate() ? '' : 'Thread limit reached.';
    el.newChatBtn.disabled = !STORE.canCreate();
  }

  async function attachmentHtml(att) {
    if (!att) return '';
    let url = ui.blobUrls.get(att.id);
    if (!url) {
      try {
        const stored = await getBlob(att.id);
        if (stored && stored.blob) {
          url = URL.createObjectURL(stored.blob);
          ui.blobUrls.set(att.id, url);
        }
      } catch (_) {}
    }
    const sizeStr = att.size ? fmtSize(att.size) : '';
    if (!url) return '<div class="attach attach-missing"><span>' + esc(att.kind) + ' · ' + sizeStr + ' (unavailable)</span></div>';
    if (att.kind === 'image') return '<div class="attach attach-image"><img src="' + url + '" alt="attachment" /></div>';
    if (att.kind === 'audio') return '<div class="attach attach-audio"><audio controls src="' + url + '"></audio></div>';
    if (att.kind === 'video') return '<div class="attach attach-video"><video controls src="' + url + '"></video></div>';
    return '<div class="attach attach-file"><a href="' + url + '" download="' + esc(att.name || 'file') + '">📎 ' + esc(att.name || att.kind) + ' · ' + sizeStr + '</a></div>';
  }

  async function renderChat() {
    if (!ui.activeThreadId) {
      el.chatWho.textContent = 'No chat selected';
      el.chatMessages.innerHTML = '<div class="chat-empty"><h2>BROD</h2><p>Tap <strong>New chat</strong> to begin.</p></div>';
      el.sendBtn.disabled = true;
      el.composerInput.disabled = true;
      el.deleteChatBtn.disabled = true;
      return;
    }
    const r = STORE.get(ui.activeThreadId);
    if (!r.ok) { ui.activeThreadId = null; return renderChat(); }
    const thread = r.thread;
    const addr = thread.address || CONTRACT.createAddressState();
    const addrLine = addr.resolved
      ? (addr.name ? 'Speaking with <strong>' + esc(addr.name) + '</strong>' : 'Speaking plainly')
      : 'Address not yet established';
    el.chatWho.innerHTML = addrLine;

    const msgs = thread.messages || [];
    const rendered = await Promise.all(msgs.map(async function (m) {
      const cls = m.role === 'user' ? 'user' : 'ai';
      const label = m.role === 'user' ? 'You' : 'BROD';
      let body = '';
      if (m.attachments && m.attachments.length) {
        const parts = await Promise.all(m.attachments.map(attachmentHtml));
        body += '<div class="msg-attachments">' + parts.join('') + '</div>';
      }
      if (m.content) body += '<div class="msg-text">' + esc(m.content) + '</div>';
      return '<div class="msg ' + cls + '">' + body + '<span class="meta">' + label + ' · ' + fmtTime(m.at) + '</span></div>';
    }));
    el.chatMessages.innerHTML = rendered.join('');
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    el.sendBtn.disabled = false;
    el.composerInput.disabled = false;
    el.deleteChatBtn.disabled = false;
  }

  async function send() {
    if (!ui.activeThreadId) return;
    if (ui.sending) return;
    const text = el.composerInput.value.trim();
    const pending = ui.pendingAttachment;
    if (!text && !pending) return;

    const threadId = ui.activeThreadId;
    const attachments = pending ? [pending] : [];

    STORE.appendMessage(threadId, 'user', text || '[attachment]', attachments);

    let r = STORE.get(threadId);
    let thread = r.thread;
    const addr = thread.address || CONTRACT.createAddressState();

    let justResolved = false;
    let resolvedToken = null;
    if (!addr.resolved && text) {
      CONTRACT.setAddress(addr, text);
      STORE.setThreadAddress(threadId, addr);
      r = STORE.get(threadId);
      thread = r.thread;
      justResolved = true;
      resolvedToken = CONTRACT.addressFor(addr).token || 'you';
    }

    el.composerInput.value = '';
    el.composerInput.style.height = 'auto';
    setPendingAttachment(null);
    renderThreads();
    await renderChat();

    if (justResolved) {
      STORE.appendMessage(threadId, 'ai', 'Hello, ' + resolvedToken + '. What would you like to talk about?', []);
      renderThreads();
      await renderChat();
      return;
    }

    ui.sending = true;
    el.sendBtn.disabled = true;
    el.sendBtn.textContent = '…';

    const thinkingId = 'thinking';
    const msgBox = el.chatMessages;
    const thinkingHtml = '<div class="msg ai" id="thinking"><span class="meta">BROD is thinking…</span></div>';
    msgBox.insertAdjacentHTML('beforeend', thinkingHtml);
    msgBox.scrollTop = msgBox.scrollHeight;

    const r2 = STORE.get(threadId);
    const systemPrompt = buildSystemPrompt(r2.thread.address && r2.thread.address.name);
    const history = buildHistory(r2.thread);

    const result = await callGemini(systemPrompt, history);

    const t = document.getElementById('thinking');
    if (t) t.remove();

    let replyText;
    if (!result.ok) {
      if (result.error === 'NO_API_KEY') {
        replyText = 'No Gemini API key set. Tap Settings and paste one.';
      } else {
        replyText = 'Gemini error: ' + (result.message || result.error);
      }
    } else {
      const scan = CONTRACT.scanResponse(result.text);
      replyText = result.text;
      if (!scan.clean) {
        replyText = '[contract flag: ' + scan.hits.map(function (h) { return h.rule; }).join(' ') + ']\n\n' + replyText;
      }
    }

    STORE.appendMessage(threadId, 'ai', replyText, []);
    ui.sending = false;
    el.sendBtn.disabled = false;
    el.sendBtn.textContent = 'Send';
    renderThreads();
    await renderChat();
  }

  function newChat() {
    const r = STORE.create();
    if (!r.ok) { alert('Thread limit reached. Delete one.'); return; }
    ui.activeThreadId = r.thread.id;
    STORE.appendMessage(r.thread.id, 'ai', CONTRACT.askAddress().question, []);
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
    if (ui.activeThreadId === id) { ui.activeThreadId = null; }
    setPendingAttachment(null);
    renderThreads();
    renderChat();
  }

  function exportAll() {
    const r = STORE.exportAll({ redactSealed: true });
    if (!r.ok) { alert('Export failed.'); return; }
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brod-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- attachment capture ---------------- */

  function startDictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.'); return; }
    if (ui.dictating) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let base = el.composerInput.value;
    rec.onresult = function (e) {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      el.composerInput.value = (base + ' ' + final + interim).trim();
      if (final) base = el.composerInput.value;
    };
    rec.onerror = function () { stopDictation(); };
    rec.onend   = function () { ui.dictating = false; el.micDictateBtn.classList.remove('active'); };
    ui.recognition = rec;
    ui.dictating = true;
    el.micDictateBtn.classList.add('active');
    rec.start();
  }
  function stopDictation() {
    if (ui.recognition) { try { ui.recognition.stop(); } catch (_) {} }
    ui.dictating = false;
    ui.recognition = null;
    el.micDictateBtn.classList.remove('active');
  }

  async function startRecording(kind) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { audio: true, video: { facingMode: 'environment' } } : { audio: true }
      );
      const mime = kind === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      const rec = new MediaRecorder(stream, { mimeType: mime });
      ui.recorderChunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) ui.recorderChunks.push(e.data); };
      rec.onstop = async function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        const blob = new Blob(ui.recorderChunks, { type: mime.split(';')[0] });
        if (blob.size > 0) {
          const id = newAttachId();
          const kindLabel = kind === 'video' ? 'video' : 'audio';
          try {
            await putBlob(id, blob, { name: kindLabel + '-' + id });
            setPendingAttachment({ id: id, kind: kindLabel, mime: blob.type, size: blob.size });
          } catch (e) { alert('Could not store attachment.'); }
        }
        showRecorder('', false);
        ui.recorder = null;
      };
      rec.start();
      ui.recorder = rec;
      showRecorder(kind === 'video' ? 'Recording video… tap Stop when done.' : 'Recording audio… tap Stop when done.', true);
    } catch (e) { alert('Microphone / camera permission denied.'); }
  }
  function stopRecording() {
    if (ui.recorder && ui.recorder.state !== 'inactive') {
      try { ui.recorder.stop(); } catch (_) {}
    }
  }

  async function handleFilePicked(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('File too large (max 20 MB).'); return; }
    const id = newAttachId();
    const kind = file.type.startsWith('image/') ? 'image'
               : file.type.startsWith('video/') ? 'video'
               : file.type.startsWith('audio/') ? 'audio' : 'file';
    try {
      await putBlob(id, file, { name: file.name });
      setPendingAttachment({ id: id, kind: kind, mime: file.type, size: file.size, name: file.name });
    } catch (e) { alert('Could not store attachment.'); }
  }

  /* ---------------- wiring ---------------- */

  el.newChatBtn.addEventListener('click', newChat);
  el.sendBtn.addEventListener('click', send);
  el.exportBtn.addEventListener('click', exportAll);
  el.deleteChatBtn.addEventListener('click', function () { if (ui.activeThreadId) deleteThread(ui.activeThreadId); });

  el.settingsBtn.addEventListener('click', function () {
    el.settingsPanel.classList.toggle('hidden');
    if (!el.settingsPanel.classList.contains('hidden')) {
      el.apiKeyInput.value = getApiKey();
      el.settingsStatus.textContent = getApiKey() ? 'A key is saved.' : 'No key saved yet.';
    }
  });
  el.saveKeyBtn.addEventListener('click', function () {
    const v = el.apiKeyInput.value.trim();
    if (!v) { el.settingsStatus.textContent = 'Enter a key first.'; return; }
    setApiKey(v);
    el.settingsStatus.textContent = 'Saved.';
    el.apiKeyInput.value = '';
  });
  el.clearKeyBtn.addEventListener('click', function () {
    clearApiKey();
    el.apiKeyInput.value = '';
    el.settingsStatus.textContent = 'Key cleared.';
  });

  el.micDictateBtn.addEventListener('click', function () { if (ui.dictating) stopDictation(); else startDictation(); });
  el.micRecordBtn.addEventListener('click', function () { if (ui.recorder) stopRecording(); else startRecording('audio'); });
  el.photoBtn.addEventListener('click', function () { el.photoInput.click(); });
  el.videoBtn.addEventListener('click', function () { el.videoInput.click(); });
  el.fileBtn.addEventListener('click',  function () { el.fileInput.click(); });
  el.stopRecordBtn.addEventListener('click', stopRecording);

  el.photoInput.addEventListener('change', function (e) { handleFilePicked(e.target.files[0]); e.target.value = ''; });
  el.videoInput.addEventListener('change', function (e) { handleFilePicked(e.target.files[0]); e.target.value = ''; });
  el.fileInput.addEventListener('change',  function (e) { handleFilePicked(e.target.files[0]); e.target.value = ''; });

  el.threadList.addEventListener('click', function (e) {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteThread(del.getAttribute('data-del')); return; }
    const item = e.target.closest('.thread-item');
    if (item) selectThread(item.getAttribute('data-id'));
  });

  el.composerInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  el.composerInput.addEventListener('input', function () {
    el.composerInput.style.height = 'auto';
    el.composerInput.style.height = Math.min(el.composerInput.scrollHeight, 160) + 'px';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  updateModelBadge();
  renderThreads();
  renderChat();

})();
