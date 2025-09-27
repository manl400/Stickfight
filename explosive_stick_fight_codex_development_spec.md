# Explosive Stick Fight — Codex Development Spec

> **Scope**: Build, harden, and deploy a browser‑based 1v1 stick‑figure fighting game with explosive meme power‑ups and **secure, easy P2P** connectivity. Include a **room‑code signaling service** and a **WebSocket relay fallback**. This document is developer‑facing and includes APIs, schemas, acceptance criteria, and a QA plan.

---

## 1) Goals & Non‑Goals

**Goals**
- Smooth 60fps canvas fighter with deterministic-enough feel under light latency.
- One‑click **Host / Join via room code**; no SDP copy‑paste.
- Default connection is **WebRTC DataChannel (DTLS‑SRTP E2E encryption)**.
- **TURN support** for strict NATs; **relay fallback** if WebRTC fails.
- Minimal dependencies; straightforward deploy on Vercel/Netlify (client) and Render/Railway/Fly/Glitch (signaling/relay).
- Telemetry, QA matrix, and production runbook.

**Non‑Goals**
- Full rollback netcode / ranked matchmaking.
- Persistent accounts, inventories, or cloud save.
- Mobile touch controls (nice‑to‑have, tracked as future enhancement).

---

## 2) Player Experience

**Loop:** Host creates a 6‑digit room → shares code → Guest joins → P2P connects → fight to K.O. → press **R** to rematch.

**Controls**
- **Host (P1)**: A/D move, W jump, J punch, K kick, E bomb.
- **Guest (P2)**: ←/→ move, ↑ jump, 1 punch, 2 kick, 0 bomb.

**Mechanics (v1)**
- World 960×540, ground at y=460, gravity ≈1500 px/s², jump velocity −600 px/s.
- Accel/Friction/MaxSpeed ≈ 1200 / 800 / 320 px/s.
- Punch: 0.12s active, 6 dmg, short reach; Kick: 0.16s, 10 dmg, longer reach.
- Meme Crates spawn ~every 6s (80% chance). Pickup grants **Meme Bomb** (AoE knockback + 12 dmg + screen shake + particles + random meme text).
- HP 100 → K.O. banner; **R/Enter** resets.

**VFX/UX**
- Canvas‑only rendering (gradients, particles, radial explosions, floating meme texts).
- HP bars (P1 left, P2 right), connection status, room code UI, compact error toasts.

---

## 3) Architecture Overview

```
Client (React + Canvas)         Signaling (Node + ws)           TURN (optional)         Relay Fallback (Node + ws)
┌─────────────────────────┐     ┌───────────────────────┐       ┌──────────────┐        ┌───────────────────────┐
│ Game Loop (RAF)         │     │ /ws: ephemeral rooms  │       │ coturn       │        │ /relay: echo-forward  │
│ Physics/Combat/Render   │<===>│ hello/signal messages │<=====>│ (UDP/TCP/TLS)│        │ 2 peers per room      │
│ WebRTC PC + DataChannel │     │ no game payload       │       └──────────────┘        │ JSON in/out            │
└─────────────────────────┘     └───────────────────────┘                              └───────────────────────┘
```

- **Primary path**: WebRTC DataChannel. Signaling server only brokers SDP/ICE over **WSS**; no game data.
- **Fallback**: WebSocket relay mirrors input/state when P2P unavailable after timeout (configurable).

---

## 4) Frontend Implementation

**Stack**: React 18 (single component ok), Canvas 2D, Tailwind (via CDN), Vite build.

**Key modules**
- `useRaf(cb)`: RAF loop.
- `makePlayer`, `physicsFor`, `tryHit`, `applyExplosions`, `updateFx`.
- Rendering: `drawStick`, bars, crates, particles, radial boom, meme texts.
- Networking: `createPeer`, `wireChannel`, `startHost`, `startGuest`, `acceptAnswer`.
- Signaling client: `connectSignaling({ url, role, room })`.
- Fallback relay: `connectRelay(url)` (only if WebRTC fails).

**State authority**
- Host simulates full state; Guest applies host snapshots at ~10fps and only animates FX locally.

**Rates**
- Input uplink ≈ 30fps; Host → Guest snapshots ≈ 10fps (particles trimmed to ≤60 entries).

**Directory structure (suggested)**
```
/client
  src/
    App.jsx
    net/
      signaling.js
      relay.js
      webrtc.js
    game/
      physics.js
      render.js
      constants.js
    ui/
      RoomConnectPanel.jsx
  index.html
  vite.config.ts

/server
  signaling.js   // WSS WebRTC signaling (rooms)
  relay.js       // WS relay fallback (optional)
  package.json
```

**Env/Config**
- `VITE_SIGNALING_URL=wss://<host>/ws`
- `VITE_RELAY_URL=wss://<host>/relay` (optional)
- `VITE_TURN_URLS=turn:turn.example.com:3478`
- `VITE_TURN_USERNAME=...`
- `VITE_TURN_CREDENTIAL=...`
- `VITE_WEBRTC_TIMEOUT_MS=6000` (before trying relay)

---

## 5) Signaling Server (WSS) — API & Behavior

**Transport**: WebSocket at `/ws` over **WSS** (TLS via proxy/host). Stateless rooms in memory.

**Room semantics**
- Room key: 6–12 chars, `[A-Z2-9]` recommended, TTL 5 minutes idle.
- Roles: `host`, `guest`. Max 1 per role.

**Messages (JSON)**
```ts
// Client → Server
{ type: 'hello', role: 'host'|'guest', room: string }
{ type: 'signal', payload: { sdp?: RTCSessionDescriptionInit, ice?: RTCIceCandidateInit } }

// Server → Client
{ type: 'hello-ack', role: 'host'|'guest' }
{ type: 'peer-joined' }
{ type: 'peer-left' }
{ type: 'signal', payload: { sdp?: RTCSessionDescriptionInit, ice?: RTCIceCandidateInit } }
{ type: 'error', code: 'ROOM_BUSY'|'ROOM_FULL'|'BAD_ORIGIN'|'BAD_ROLE'|'BAD_ROOM' }
```

**Validation**
- Reject if `origin` not on allow‑list.
- Enforce message size limit (e.g., 64KB) and rate limit (e.g., 20 msgs/sec).
- Sanitize `room` to `[A-Z2-9]{6,12}`.

**Lifecycle**
- On `hello`: attach ws to room role, emit `hello-ack`. If guest connects and host present → send `peer-joined` to host.
- On `signal`: forward payload to the other role if connected.
- On `close`: clear role; notify the other via `peer-left`. GC room when empty.

---

## 6) WebRTC Configuration

**PeerConnection**
```ts
new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Optional, recommended for reliability:
    { urls: ['turns:turn.example.com:5349','turn:turn.example.com:3478'], username: '<u>', credential: '<p>' }
  ]
})
```

**DataChannel**
- Label: `"game"`, `{ ordered: true }` (simple sequenced messages).
- Keep payloads compact JSON; consider binary later.

**Guest smoothing**
- Lerp positions for 1–2 frames between snapshots to hide jitter.

---

## 7) Relay Fallback (WS) — API & Behavior (Optional)

**When**: If WebRTC not `connected` after `VITE_WEBRTC_TIMEOUT_MS` → connect to `/relay`.

**Server**: Holds up to 2 peers per room; forwards any JSON message to the other peer as‑is.

**Client messages (suggested)**
```ts
{ type: 'role', role: 'host'|'guest', room: string }
{ type: 'input', payload: KeyStateMap }         // from each peer continuously
{ type: 'state', payload: HostSnapshot }        // host → guest ~10fps
```

**Security**: WSS required; still no PII. Note: no E2E encryption at transport layer (server can read JSON). Use app‑level AES‑GCM if desired.

---

## 8) Security & Privacy

- **Transport**: WSS for signaling/relay; DTLS‑SRTP for DataChannel (E2E by default).
- **Origin allow‑list** for signaling/relay (reject all others).
- **No logs of SDP/ICE payloads**; emit only connection metrics (counts, durations).
- **Room code TTL** and random generation; deny reuse after idle.
- **Rate limiting** and message size caps.
- **Content Security Policy (CSP)** restricting script origins.
- **App‑layer encryption (optional)**: passphrase → PBKDF2 → AES‑GCM for payloads.

**Threats & Mitigations**
- MITM on signaling → WSS + origin check.
- DoS via room floods → rate limit + IP‑based backoff.
- Data exfil in relay mode → encourage WebRTC path; support optional app‑layer crypto.

---

## 9) Telemetry & Observability

**Client Events**
- `conn_start`, `conn_connected`, `conn_failed`, `conn_fallback_ws`.
- `webrtc_state_change` (iceGathering/connection/datachannel states).
- `rtt_ms` via ping/pong every 5s.
- Gameplay: `match_start`, `match_end`, `winner`, `crates_spawned`, `bombs_used`, `hits_landed`, `duration_s`.

**Server Metrics**
- Active rooms, connect attempts, success rate, median connect time.
- Errors by code; message/sec per IP (for rate limiting).

Use OpenTelemetry or minimal JSON logs -> stdout; scrape via platform provider.

---

## 10) QA Plan

**Browsers**: Chrome (latest −1), Edge (Chromium), Firefox (latest −1), Safari 17+.

**OS**: Windows 10/11, macOS 13+, iOS 17 (view‑only v1), Android 13+.

**Network scenarios**
- Same LAN, both on Wi‑Fi.
- Different ISPs, UPnP on.
- Corporate/VPN (expect TURN path or relay fallback).

**Test cases**
1. Host/Guest connect via room code; DC opens within timeout.
2. Packet loss 5–10%: no desync, acceptable jitter.
3. Guest disconnect mid‑match → host sees toast; reconnects with same room.
4. Relay fallback triggers and gameplay remains responsive.
5. TURN credentials invalid → connection fails → relay fallback works.
6. Rate limit breach → server returns error; UI shows friendly retry guidance.
7. Accessibility: tab‑focus all controls; contrast AA; canvas has accessible name/description.

---

## 11) Performance Budgets

- Frame time ≤ 16.7ms on 2‑core laptop; no GC spikes > 10ms.
- Snapshot payload ≤ 6KB; input msg ≤ 200B; average DC throughput < 20kbps.
- Particle cap per frame ≤ 120; explosions ≤ 3 simultaneous.

---

## 12) Accessibility & Intl

- Keyboard‑only operable; visible focus rings.
- Canvas `role="img"` with `aria-label` describing action.
- UI copy externalized for future i18n.

---

## 13) Build, Deploy, and Runbook

**Client**
- Vite build → deploy to Vercel/Netlify; enforce HTTPS; set env with signaling/relay URLs.

**Server**
- Node 18+; `npm i ws`; expose `/ws` and optionally `/relay`.
- Behind reverse proxy (Caddy/Nginx) for TLS; enable compression off for WS; set idle timeouts.
- Health endpoints: `/health` → 200 `ok`.

**Runbook**
- Rollout: blue/green with 1% canary.
- Alarms: connect success rate drops >15% over 10m; 5xx error spike; memory >80%.
- Emergency switch: force **relay mode** via env flag while TURN incident resolves.

---

## 14) Acceptance Criteria (v1)

1. **Room‑code connection**: Host+Guest can connect P2P via WSS signaling in ≤ 6s median on residential networks.
2. **TURN path**: With only TURN reachable, peers still connect and play.
3. **Fallback**: If WebRTC not connected within timeout, relay mode connects and match is playable end‑to‑end.
4. **Security**: WSS enforced; origin allow‑list; no SDP/ICE logs; room TTL; rate limiting enabled.
5. **Gameplay**: All controls responsive; crates spawn; bombs function; K.O. + reset works; 60fps on mid‑tier hardware.
6. **Telemetry**: Events emitted and visible in logs/metrics.
7. **QA matrix**: Browsers/OS coverage passed.

---

## 15) APIs & Schemas

**Signaling**
```jsonc
// hello
{"type":"hello","role":"host","room":"AB12CD"}
// hello-ack
{"type":"hello-ack","role":"host"}
// signal (SDP)
{"type":"signal","payload":{"sdp":{"type":"offer","sdp":"..."}}}
// signal (ICE)
{"type":"signal","payload":{"ice":{"candidate":"...","sdpMid":"0","sdpMLineIndex":0}}}
// errors
{"type":"error","code":"ROOM_FULL"}
```

**Relay** (optional)
```jsonc
{"type":"role","role":"host","room":"AB12CD"}
{"type":"input","payload":{"KeyA":true,"KeyD":false}}
{"type":"state","payload":{"p1":{...},"p2":{...},"crates":[],"winner":null}}
```

**Type Notes**
- `HostSnapshot` trims particles (≤60), explosions (≤3), includes HP/pos/vel of both players.
- `KeyStateMap` is sparse boolean dictionary of pressed keys.

---

## 16) Risks & Mitigations

- **Strict corporate NATs**: include TURN; retain relay fallback.
- **High latency jitter**: increase guest interpolation window; reduce snapshot rate to stabilize.
- **Browser quirks (Safari)**: test DC reliability; polyfill where needed.
- **Abuse**: rate limit handshakes; CAPTCHAs behind reverse proxy if necessary.

---

## 17) Future Enhancements

- Automatic lobby discovery (room directory) with short‑lived tokens.
- Binary snapshots (ArrayBuffer) to reduce payload and GC.
- Gamepad & mobile touch controls; responsive canvas scaling.
- Cosmetics: palette swaps, trails, SFX (CC0/royalty‑free).
- Rollback netcode prototype for competitive feel.

---

## 18) Dev Notes & Conventions

- Code style: Prettier + ESLint (airbnb‑ish). Type JSDoc for shared types.
- Avoid object churn in RAF loop; reuse arrays/objects; pool particles.
- Guard all JSON.parse with try/catch; clamp message sizes.
- Feature flags via env (e.g., `VITE_FORCE_RELAY=true`).

---

### Appendix A — Example Sequence (P2P)
```
Guest UI → enter room → hello(role=guest)
Host UI  → enter room → hello(role=host)
Host PC: createOffer → setLocal → signal(sdp:offer)
Guest PC: setRemote(offer) → createAnswer → setLocal → signal(sdp:answer)
Both: onicecandidate → signal(ice) → addIceCandidate
DataChannel 'open' → start input uplink + host snapshots → match start
```

### Appendix B — Minimal Health Checklist
- [ ] `/health` returns 200.
- [ ] Connect success rate ≥ 90% over last 24h.
- [ ] Median connect time ≤ 6s.
- [ ] Error rate by code below thresholds (ROOM_FULL, BAD_ORIGIN, etc.).
- [ ] Relay fallback rate < 20% on residential networks.

