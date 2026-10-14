# BROD

A local chat shell that enforces a conversation contract.

Public model. It asks who it is speaking with, holds the name for that
chat, and drops it when the chat closes. Up to 20 threads, on-device only.
No network. No accounts. No telemetry.

**Live:** https://\<your-username\>.github.io/brod/

---

## What it is

Two modules and a small UI:

| Piece | What it does |
|---|---|
| `core/brod-conversation-contract.js` | The rules of the conversation — address discovery, disclosure tiers, check-in posture, silence rule, forbidden claims. |
| `core/brod-chat-store.js` | Up to 20 chat threads in `localStorage`. Per-thread address state. Sealed messages redacted on export. |
| `index.html` + `app.js` | A local demo shell that wires them together and shows what a compliant AI would do. |

This is a **shell**, not a model. The actual language model runs elsewhere.
This repo demonstrates the contract as executable rules and gives a host
AI a place to plug in.

---

## The conversation rules

Full text: [`docs/CONTRACT.md`](docs/CONTRACT.md).

Summary:

1. **Address is discovered, not assumed.** The AI opens each new chat with
   *"Who am I speaking with?"* It uses the given name for the rest of that
   chat. It drops it when the chat closes.
2. **Silence is legitimate.** If the user does not speak, the AI does not
   fill the silence with prompts.
3. **Disclosure tiers.** Every substantive claim carries one of:
   `ESTABLISHED`, `VERIFIED`, `PLAUSIBLE`, `UNRESOLVED`.
4. **Watchtower first.** On any subject, Watchtower and JW.org speak first.
   Other sources are laid beside them, named honestly, never above them.
5. **No memory across chats.** Only what is pasted is known.
6. **Check-in, not performance.** Steady-friend posture. Crisis resources
   bundled for US. If the user is struggling, stop the work and stay.

---

## Run locally

```bash
git clone https://github.com/<your-username>/brod.git
cd brod
python3 -m http.server 8080
# open http://localhost:8080
```

A service worker needs `https://` or `localhost`. Both work.

---

## Deploy

Push to `main`. The included GitHub Actions workflow publishes the repo
root to GitHub Pages. In **Settings → Pages**, set Source to
**GitHub Actions**.

---

## Privacy

Everything is local. The chat store is `localStorage` under
`brod_chats_v1`. There is no server, no analytics, no outbound network
call. Clearing site data clears the chats.

---

## License

MIT — see `LICENSE`.
