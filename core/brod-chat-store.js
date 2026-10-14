'use strict';

/**
 * BROD — Local Chat Store
 * Up to 20 chat threads, on-device only.
 * No network. No sync. No telemetry.
 */

const BROD_CHAT_STORE = (() => {

  const CONFIG = Object.freeze({
    storageKey: 'brod_chats_v1',
    maxThreads: 20,
    maxMessagesPerThread: 500,
    maxMessageChars: 20000
  });

  /* ---------------- persistence ---------------- */

  function readAll() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeAll(threads) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(threads));
  }

  function nowIso() { return new Date().toISOString(); }

  function newId() {
    return 'th_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- threads ---------------- */

  function list() {
    const threads = readAll();
    return threads
      .slice()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map(t => ({
        id: t.id,
        title: t.title || 'Untitled',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageCount: (t.messages || []).length,
        addressedTo: (t.address && t.address.name) || null
      }));
  }

  function count() { return readAll().length; }

  function canCreate() { return count() < CONFIG.maxThreads; }

  function create(opts) {
    opts = opts || {};
    const threads = readAll();
    if (threads.length >= CONFIG.maxThreads) {
      return {
        ok: false,
        error: 'THREAD_LIMIT_REACHED',
        detail: 'Maximum of ' + CONFIG.maxThreads +
                ' chat threads. Delete one to create another.',
        limit: CONFIG.maxThreads
      };
    }
    const thread = {
      id: newId(),
      title: (typeof opts.title === 'string' && opts.title.trim())
        ? opts.title.trim()
        : 'New chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      address: {
        asked: false,
        resolved: false,
        name: null,
        pronunciation: null,
        nickname: null,
        declined: false
      },
      messages: []
    };
    threads.push(thread);
    writeAll(threads);
    return { ok: true, thread: thread };
  }

  function get(id) {
    const threads = readAll();
    const thread = threads.find(t => t.id === id);
    if (!thread) return { ok: false, error: 'THREAD_NOT_FOUND' };
    return { ok: true, thread: thread };
  }

  function remove(id) {
    const threads = readAll();
    const next = threads.filter(t => t.id !== id);
    if (next.length === threads.length) {
      return { ok: false, error: 'THREAD_NOT_FOUND' };
    }
    writeAll(next);
    return { ok: true, removedId: id, remaining: next.length };
  }

  function rename(id, title) {
    if (typeof title !== 'string' || !title.trim()) {
      return { ok: false, error: 'TITLE_REQUIRED' };
    }
    const threads = readAll();
    const thread = threads.find(t => t.id === id);
    if (!thread) return { ok: false, error: 'THREAD_NOT_FOUND' };
    thread.title = title.trim();
    thread.updatedAt = nowIso();
    writeAll(threads);
    return { ok: true, thread: thread };
  }

  function clearAll() {
    writeAll([]);
    return { ok: true, cleared: true };
  }

  /* ---------------- messages ---------------- */

  function appendMessage(threadId, role, content, attachments) {
    if (role !== 'user' && role !== 'ai' && role !== 'system') {
      return { ok: false, error: 'INVALID_ROLE' };
    }
    if (typeof content !== 'string' || !content) {
      return { ok: false, error: 'CONTENT_REQUIRED' };
    }
    if (content.length > CONFIG.maxMessageChars) {
      return { ok: false, error: 'MESSAGE_TOO_LONG' };
    }

    const threads = readAll();
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return { ok: false, error: 'THREAD_NOT_FOUND' };
    if ((thread.messages || []).length >= CONFIG.maxMessagesPerThread) {
      return { ok: false, error: 'THREAD_FULL' };
    }

    const message = {
      role: role,
      content: content,
      at: nowIso(),
      attachments: Array.isArray(attachments) ? attachments : []
    };
    thread.messages.push(message);
    thread.updatedAt = message.at;

    if (role === 'user' && thread.title === 'New chat') {
      thread.title = content.slice(0, 60) + (content.length > 60 ? '…' : '');
    }

    writeAll(threads);
    return { ok: true, message: message, threadTitle: thread.title };
  }

  function getMessages(threadId) {
    const r = get(threadId);
    if (!r.ok) return r;
    return { ok: true, messages: r.thread.messages || [] };
  }
  /* ---------------- per-thread address ---------------- */

  function setThreadAddress(threadId, addressState) {
    const threads = readAll();
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return { ok: false, error: 'THREAD_NOT_FOUND' };
    thread.address = Object.assign({}, addressState);
    thread.updatedAt = nowIso();
    writeAll(threads);
    return { ok: true, address: thread.address };
  }

  function getThreadAddress(threadId) {
    const r = get(threadId);
    if (!r.ok) return r;
    return { ok: true, address: r.thread.address };
  }

  /* ---------------- export ---------------- */

  function exportThread(threadId, opts) {
    opts = opts || {};
    const redactSealed = opts.redactSealed !== false;
    const r = get(threadId);
    if (!r.ok) return r;
    const copy = JSON.parse(JSON.stringify(r.thread));
    if (redactSealed) {
      copy.messages = copy.messages.map(m =>
        m.sealed ? Object.assign({}, m, { content: '[REDACTED — SEALED]' }) : m
      );
    }
    return { ok: true, thread: copy };
  }

  function exportAll(opts) {
    opts = opts || {};
    const redactSealed = opts.redactSealed !== false;
    const threads = readAll();
    if (!redactSealed) return { ok: true, threads: threads };
    const redacted = threads.map(t => Object.assign({}, t, {
      messages: (t.messages || []).map(m =>
        m.sealed ? Object.assign({}, m, { content: '[REDACTED — SEALED]' }) : m
      )
    }));
    return { ok: true, threads: redacted };
  }

  return Object.freeze({
    CONFIG: CONFIG,
    list: list, count: count, canCreate: canCreate,
    create: create, get: get, remove: remove, rename: rename, clearAll: clearAll,
    appendMessage: appendMessage, getMessages: getMessages,
    setThreadAddress: setThreadAddress, getThreadAddress: getThreadAddress,
    exportThread: exportThread, exportAll: exportAll
  });

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BROD_CHAT_STORE;
}
if (typeof globalThis !== 'undefined') {
  globalThis.BROD_CHAT_STORE = BROD_CHAT_STORE;
}
