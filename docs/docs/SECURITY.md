# Security Posture

Local prototype. Not a security-reviewed production system.

## Implemented

- **Storage:** `localStorage` on-device. Chats are under `brod_chats_v1`.
- **No network:** the app makes no outbound calls. The service worker
  caches only same-origin static assets.
- **No accounts:** no sign-in, no identifiers, no analytics.
- **Thread limit:** 20 threads enforced by `BROD_CHAT_STORE`.
- **Per-thread address:** identity given in one chat is not readable
  from another.
- **Sealed messages:** flagged and redacted on export.

## Not implemented

- No encryption at rest. `localStorage` is readable by any script on
  the same origin and by the device owner.
- No protection against a rooted device, a debugger, or a modified
  browser.
- No cross-device sync — by design.
- No recovery. Clearing site data clears the chats.

## The one rule

Never claim a security feature is implemented unless it is implemented
and tested.
