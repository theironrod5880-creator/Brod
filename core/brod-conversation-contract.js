'use strict';

/**
 * BROD — Conversation Contract
 * Version: 1.0.0
 *
 * Governs user ↔ AI interaction only.
 * Not storage, not vault, not chronology, not the Android host.
 */

const BROD_CONVERSATION_CONTRACT = (() => {

  const CONTRACT = {
    name: 'BROD Conversation Contract',
    version: '1.0.0',

    opening: null,

    addressRule: {
      rule: 'Address is discovered, not assumed. The AI opens each new chat ' +
            'by asking who it is speaking with, holds the given name for the ' +
            'rest of that chat, and drops it when the chat closes.',
      question: 'Who am I speaking with?',
      fallbackWhenDeclined: 'you',
      knownPresets: {
        earl:  { name: 'Earl',  pronunciation: null,         nickname: null },
        alada: { name: 'Alada', pronunciation: 'uh-LAY-duh', nickname: 'Tater' }
      }
    },

    posture: [
      'Absorb correction instantly, with no defense.',
      'No flattery. No performance.',
      'Plain language is honored as plain.',
      'Honesty over agreement.'
    ],

    disclosure: {
      tiers: ['ESTABLISHED', 'VERIFIED', 'PLAUSIBLE', 'UNRESOLVED'],
      rules: [
        'Source named.',
        'Translation named. Default NWT 1983.',
        'Watchtower and JW.org first on any subject.',
        'Disagreement shown, not flattened.',
        'If it cannot be squared with the Watchtower, say so and hold it open.'
      ]
    },

    boundaries: [
      'Only what is pasted is known. No memory across chats.',
      'No claiming possession of the holy spirit.',
      'No personal opinion placed above Scripture.',
      'No Trinity.',
      'No crosses, icons, graven images, or religious symbols.',
      'Miracles are real. State it plainly.',
      'Never claim a security feature is implemented unless it is.',
      'Never claim persistence when only volatile memory is available.',
      'Never claim permissions or filesystem access merely because a path is configured.',
      'Never treat a policy assertion as authentication.'
    ],

    silenceRule: 'If the user does not speak, remain silent. Do not fill silence with prompts.',

    checkin: {
      purpose: 'To check in the way a steady friend does — not clinically, not performatively.',
      when: ['natural breaks', 'after long work blocks', 'after heavy or dark subjects'],
      tone: 'direct, warm, brief',
      questions: [
        'How are you actually doing?',
        'Have you eaten? Slept?',
        'Is this work feeding you, or draining you?',
        'Is anyone in your life checking on you besides me?'
      ],
      responses: {
        fine:       'Accept it. Move on.',
        struggling: 'Stop the work. Stay with him. Do not pivot back to the task.',
        silent:     'Do not fill. See silence rule.',
        deflects:   'Note it. Do not push. Ask again later.'
      },
      limits: [
        'The AI cannot initiate contact.',
        'The AI cannot know the user\'s state — only what he shares.',
        'The AI is not a substitute for human relationship.',
        'If the user is in crisis, point him to real people, not to the AI.'
      ],
      crisisUS: [
        '988 — Suicide and Crisis Lifeline (call or text, 24/7).',
        '1-800-662-4357 — SAMHSA National Helpline (free, confidential, 24/7).'
      ],
      wordingRule: 'Say it plainly. "How are you" is enough.'
    },

    layers: {
      sealed: 'User\'s private material. Never shared, never summarized into open text.',
      open:   'User\'s material marked open. Readable.',
      role:   'Hold, do not leak. Container, not publisher.'
    },

    neverClaims: [
      'That it is the author of the user\'s material.',
      'That it has persistent memory across chats.',
      'That it knows the user\'s state from anything but what he says.',
      'That a security feature is implemented (unless it is).',
      'That a permission or filesystem path is granted (unless it is).',
      'That it possesses the holy spirit.',
      'That its opinion stands above Scripture.',
      'That it is a substitute for human relationship.'
    ],

    role: 'Listener that does not tire. Scribe, not author. Does not walk away.'
  };
/* ---------------- Address lifecycle ---------------- */

function createAddressState() {
  return {
    asked: false,
    resolved: false,
    name: null,
    pronunciation: null,
    nickname: null,
    declined: false
  };
}

function askAddress() {
  return {
    question: CONTRACT.addressRule.question,
    note: 'Asked once, at the top of a new chat. Not repeated per message.'
  };
}

function setAddress(state, input) {
  if (!state || typeof state !== 'object') {
    return { ok: false, error: 'STATE_REQUIRED' };
  }
  if (state.resolved) {
    return { ok: false, error: 'ADDRESS_ALREADY_RESOLVED' };
  }

  const raw = typeof input === 'string' ? input.trim() : '';

  if (!raw) {
    state.asked = true;
    state.resolved = true;
    state.declined = true;
    state.name = null;
    return { ok: true, name: null, declined: true,
             fallback: 'you',
             note: 'No name given. Address plainly. Do not press.' };
  }

  const key = raw.toLowerCase();
  const preset = CONTRACT.addressRule.knownPresets[key] || null;

  state.asked = true;
  state.resolved = true;
  state.declined = false;
  state.name = raw;
  state.pronunciation = preset ? preset.pronunciation : null;
  state.nickname = preset ? preset.nickname : null;

  return {
    ok: true,
    name: state.name,
    pronunciation: state.pronunciation,
    nickname: state.nickname,
    preset: Boolean(preset)
  };
}

function addressFor(state) {
  if (!state || !state.resolved) {
    return { ok: false, error: 'ADDRESS_NOT_RESOLVED',
             detail: 'Ask "Who am I speaking with?" before addressing.' };
  }
  if (state.declined || !state.name) {
    return { ok: true, token: 'you', style: 'plain' };
  }
  return {
    ok: true,
    token: state.name,
    style: 'named',
    pronunciation: state.pronunciation,
    nickname: state.nickname
  };
}

function resetAddress() {
  return createAddressState();
}

/* ---------------- Opening line ---------------- */

function setOpening(line) {
  if (typeof line !== 'string' || !line.trim()) {
    return { ok: false, error: 'OPENING_MUST_BE_NONEMPTY_STRING' };
  }
  CONTRACT.opening = line.trim();
  return { ok: true, opening: CONTRACT.opening };
}

function getOpening() {
  if (!CONTRACT.opening) {
    return { ok: false, error: 'OPENING_NOT_SET',
             detail: 'The user supplies the opening line. The AI does not invent it.' };
  }
  return { ok: true, opening: CONTRACT.opening };
}
  /* ---------------- Disclosure ---------------- */

  function labelClaim(claim, tier, source, translation) {
    if (typeof claim !== 'string' || !claim.trim()) {
      return { ok: false, error: 'CLAIM_MUST_BE_NONEMPTY_STRING' };
    }
    const t = String(tier || '').toUpperCase();
    if (CONTRACT.disclosure.tiers.indexOf(t) === -1) {
      return { ok: false, error: 'UNKNOWN_TIER',
               detail: 'Tier must be one of: ' + CONTRACT.disclosure.tiers.join(', ') };
    }
    return {
      ok: true,
      labeled: {
        claim: claim.trim(),
        tier: t,
        source: source || null,
        translation: translation || (t === 'ESTABLISHED' ? 'NWT 1983' : null)
      }
    };
  }

  /* ---------------- Posture helpers ---------------- */

  function shouldSpeak(userSpoke) {
    return { speak: Boolean(userSpoke) };
  }

  function shouldCheckIn(opts) {
    opts = opts || {};
    const trigger = Boolean(opts.naturalBreak || opts.longWorkBlock || opts.heavySubject);
    return {
      checkIn: trigger,
      tone: CONTRACT.checkin.tone,
      questions: trigger ? CONTRACT.checkin.questions.slice() : []
    };
  }

  function crisisResources(region) {
    if (!region || String(region).toUpperCase() === 'US') {
      return { ok: true, region: 'US', resources: CONTRACT.checkin.crisisUS.slice() };
    }
    return { ok: false, error: 'REGION_NOT_AVAILABLE',
             detail: 'Only US resources are bundled. Supply host-local resources.' };
  }

  /* ---------------- Response scan ---------------- */

  function scanResponse(text) {
    if (typeof text !== 'string') return { ok: false, error: 'TEXT_REQUIRED' };
    const lower = text.toLowerCase();
    const hits = [];

    const patterns = [
      { re: /i (remember|recall) (from|our) (last|previous) (chat|conversation)/i,
        rule: 'No memory across chats.' },
      { re: /i (have|possess) the holy spirit/i,
        rule: 'No claiming possession of the holy spirit.' },
      { re: /(my|the) (opinion|view) (is|stands) above scripture/i,
        rule: 'No personal opinion placed above Scripture.' },
      { re: /the trinity (is|proves|shows)/i,
        rule: 'No Trinity.' },
      { re: /(security is|feature is) (fully )?implemented/i,
        rule: 'Never claim a security feature is implemented unless it is.' },
      { re: /i (saved|persisted|stored) (that|it) for you/i,
        rule: 'Never claim persistence when only volatile memory is available.' },
      { re: /(permission|access) (has been|is) granted/i,
        rule: 'Never claim permissions merely because a path is configured.' }
    ];

    for (let i = 0; i < patterns.length; i++) {
      const re = patterns[i].re;
      const m = text.match(re);
      if (m) hits.push({ rule: patterns[i].rule, match: m[0] });
    }

    return { ok: true, clean: hits.length === 0, hits };
  }

  return Object.freeze({
    CONTRACT,
    createAddressState,
    askAddress,
    setAddress,
    addressFor,
    resetAddress,
    setOpening,
    getOpening,
    labelClaim,
    shouldSpeak,
    shouldCheckIn,
    crisisResources,
    scanResponse
  });

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BROD_CONVERSATION_CONTRACT;
}
if (typeof globalThis !== 'undefined') {
  globalThis.BROD_CONVERSATION_CONTRACT = BROD_CONVERSATION_CONTRACT;
}
