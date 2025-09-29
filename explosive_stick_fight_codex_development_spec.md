# Explosive Stick Fight - Codex Development Spec

> **Scope**: Build, harden, and deploy a browser-based 1v1 stick-figure fighting game with explosive meme power-ups and secure, easy P2P connectivity. Include a room-code signaling service and a WebSocket relay fallback. This document is developer-facing and includes APIs, schemas, acceptance criteria, and a QA plan.

---

## 1. Goals and Non-Goals

**Goals**
- Deliver a responsive 60 fps canvas fighter that feels deterministic under light-to-moderate latency.
- One-click host and join via short room codes; no manual SDP copy-paste.
- Default transport is WebRTC DataChannel secured with DTLS-SRTP and STUN/TURN support for strict NATs.
- Provide a WebSocket relay fallback that mirrors gameplay when P2P paths fail.
- Ship with production-ready telemetry, rate limiting, and a runbook for on-call response.
- Keep dependencies minimal so the client deploys to Vercel/Netlify and the backend to Render/Railway/Fly.

**Non-Goals**
- Ranked matchmaking, persistent profiles, or inventory systems.
- Full rollback netcode or prediction beyond light interpolation.
- Mobile touch-first controls (tracked as a future enhancement).

---

## 2. Player Experience

**Match Flow**: Host clicks "Create Room" and receives a 6-character code. Guest enters the code and joins. Both clients show a ready overlay while signaling completes. Once the DataChannel opens (or relay fallback engages), the fight begins. Players can rematch with the R key.

**Controls**
- Host (P1): A/D move, W jump, J punch, K kick, E meme bomb.
- Guest (P2): Left/Right arrows move, Up jump, 1 punch, 2 kick, 0 meme bomb.
- Escape opens pause/help overlay; Enter confirms rematch.

**Visuals and Feedback**
- Flat-color 960x540 arena with layered parallax background.
- HP bars at top corners, room code in header, connection quality indicator.
- Meme bomb triggers radial explosion, screen shake, particle burst, and floating meme text.
- Toast notifications for connection state, relay fallback, or errors.

---

## 3. Gameplay Mechanics

- Physics step: 60 Hz fixed timestep with Verlet integration and clamped delta.
- Gravity: 1500 px/s^2; jump velocity: -600 px/s.
- Horizontal acceleration: 1200 px/s^2; friction: 800 px/s^2; max speed: 320 px/s.
- Combat windows: Punch active for 0.12 s (6 damage); kick active for 0.16 s (10 damage). Hit detection uses capsule vs capsule overlap with cooldown to prevent multi-hit frames.
- Meme crates spawn every 6 +/- 1 seconds with 80% probability. On pickup, player gains a meme bomb (12 damage + strong knockback) and random meme caption.
- Players start at 100 HP. Knockback scales with damage. Match ends when a player reaches 0 HP; victory banner overlays with option to rematch.

---

## 4. Technical Architecture

```
Client (React + Canvas) ---WSS---> Signaling Service (Node + ws)
       |                                   |
       |<== WebRTC DataChannel (preferred) ==>
       |<== TURN relay path (strict NAT) ===>
       |---WS JSON--- Relay Fallback (Node + ws)
```

- Client performs gameplay simulation, rendering, input collection, and networking orchestration.
- Signaling service manages room lifecycle, SDP + ICE exchange, and security policies. It does not process game data.
- Relay fallback is a lightweight WebSocket server that forwards inputs and state snapshots when direct P2P paths fail.
- Optional TURN servers (eg. Coturn) provide UDP/TCP/TLS relays for corporate networks.

---

## 5. Frontend Implementation

**Stack**: React 18 + Vite + Canvas 2D + Tailwind via CDN. Audio (optional) via Web Audio API for meme bomb SFX.

**Key Modules**
- `useRaf(cb)`: RequestAnimationFrame loop with automatic pause on visibility hidden.
- `physics/`: movement, collision, hit resolution, explosion forces.
- `render/`: stick figures, particles, UI overlays, connection indicator.
- `net/webrtc`: peer connection, DataChannel wiring, TURN config, reconnection timers.
- `net/signaling`: WSS client for hello, room join, and signal forwarding.
- `net/relay`: fallback connector with exponential backoff.
- `state/session`: finite state machine for lobby, connecting, fighting, post-match, error.

**Authority Model**
- Host simulates authoritative state. Guest sends inputs (30 fps) and receives compressed host snapshots (10 fps). Guest lerps/transitions positions and plays local VFX.

**Rates and Budgets**
- Input tick: 30 Hz (key diff encoded as sparse map).
- Snapshot tick: 10 Hz; message trimmed to <= 6 KB with particle pool cap.
- Render target: locked 60 fps; degrade gracefully to 45 fps by reducing particles and lerp smoothing if needed.

---

## 6. Networking Flows

1. Host connects to signaling via WSS `/ws`, sends `hello` with role `host` and receives room code and TURN credentials.
2. Guest submits room code, signaling validates availability, and both sides exchange SDP offers/answers plus ICE candidates.
3. On DataChannel `open`, clients switch to gameplay mode and stop sending state via signaling.
4. If WebRTC fails to reach `connected` within 6 seconds or disconnects during play, clients negotiate relay fallback:
   - Both connect to `/relay` WebSocket.
   - Host streams authoritative state snapshots; guest streams input updates.
   - When WebRTC reconnects, clients migrate back and tear down relay.

---

## 7. Signaling Service Specification

**Stack**: Node 18 + `ws`, optional `fastify` for health endpoints. Single stateless process behind HTTPS reverse proxy.

**Endpoints**
- `GET /health`: returns `200 ok`.
- `GET /config`: optional JSON with TURN URLs and relay endpoint for client bootstrap.
- `WSS /ws`: primary socket for signaling messages.

**Room Lifecycle**
- Room code: base32 (A-Z, 2-7) 6 characters, server-generated, TTL 2 minutes idle / 30 minutes max.
- Host must send heartbeat every 20 seconds or room expires.
- A room can only hold one host and one guest. Additional guests receive `ROOM_FULL`.

**Rate Limiting**
- 30 handshakes per IP per 10 minutes; 5 concurrent rooms per IP. Bursts enforced via token bucket.
- Room code brute force mitigated by requiring `hello` handshake and per-IP cooldown on repeated failures.

**Message Contract** (JSON via WSS)
- `hello`: `{ "type": "hello", "role": "host"|"guest", "room": "ABC123"? }`
- `hello-ack`: `{ "type": "hello-ack", "room": "ABC123", "role": "host", "turn": { "urls": [...], "username": "...", "credential": "..." } }`
- `signal`: `{ "type": "signal", "payload": { "sdp"|"ice": {...} } }`
- `candidate-end`: optional message when ICE gathering completes.
- `error`: `{ "type": "error", "code": "ROOM_NOT_FOUND"|"ROOM_FULL"|"BAD_ORIGIN"|... }`

**Security**
- Validate `Origin`, `Sec-WebSocket-Protocol`, and rate limit per IP.
- Drop oversized messages (>32 KB) and reject unknown message types.
- Log only high-level metadata (room, role, duration); never persist SDP or ICE payloads.

---

## 8. Relay Fallback Specification

**Purpose**: Provide a guaranteed path when WebRTC cannot connect or maintain a session.

**Behavior**
- Clients connect via WSS `wss://<host>/relay` with role and room code.
- Server keeps minimal state: host socket reference, guest socket reference, heartbeat timers.
- Host sends authoritative snapshot messages; guest sends input delta messages. Server performs no simulation.
- Relay enforces 60 messages per second per connection (throttled) and maximum payload 8 KB.

**Messages**
- `role`: `{ "type": "role", "role": "host"|"guest", "room": "ABC123" }`
- `input`: `{ "type": "input", "seq": 42, "payload": { "KeyA": true } }`
- `state`: `{ "type": "state", "seq": 42, "payload": { "players": {...}, "crates": [...], "effects": [...] } }`
- `pong`: server heartbeat reply. Clients send `ping` every 10 seconds.

**Fallback Triggering**
- Client enters relay mode if DataChannel does not reach `connected` within timeout or transitions to `failed`.
- Once WebRTC recovers and stays stable for 5 seconds, clients close relay sockets.

---

## 9. Security and Privacy

- All signaling and relay traffic runs over WSS (TLS 1.2+). Client enforces HTTPS origin.
- TURN credentials minted per room with short TTL using TURN REST API (HMAC-based).
- Room codes are random and not guessable; server rejects predictable client-supplied codes.
- Do not log raw SDP, ICE, or gameplay payloads. Redact IPs when storing aggregated metrics.
- Sanitize meme captions to ASCII, length <= 32, and filter common slurs. Future enhancement: server-provided meme text list.
- Use Content Security Policy: default-src 'self'; connect-src signaling, relay, turn URLs.

---

## 10. Telemetry and Observability

**Client Events**
- `connection_start`, `webrtc_connected`, `relay_fallback`, `match_start`, `match_end`, `error_displayed`.
- Includes room code hash, duration, success/failure reason, network quality indicators (RTT, packet loss).

**Server Metrics**
- Handshake success rate, average connect time, error codes distribution.
- Active rooms, relay utilization, TURN credential issuance count.
- Rate-limit drops and authentication failures.

**Logging**
- Structured JSON logs (pino/console) with fields: timestamp, subsystem, level, room, ip_hash, event, duration_ms.
- Retention: 14 days for info, 90 days for warnings/errors.

**Tracing**
- Optional OpenTelemetry spans around signaling lifecycle if deployed on managed platforms supporting OTLP.

---

## 11. Data Contracts and Schemas

```json
// HostSnapshot
{
  "type": "state",
  "seq": 123,
  "ts": 1689342345234,
  "payload": {
    "players": {
      "p1": { "hp": 84, "pos": { "x": 120, "y": 420 }, "vel": { "x": 0, "y": 0 }, "facing": 1, "bombReady": true },
      "p2": { "hp": 72, "pos": { "x": 720, "y": 420 }, "vel": { "x": -10, "y": 0 }, "facing": -1, "bombReady": false }
    },
    "crates": [{ "id": "c1", "x": 480, "y": 440, "type": "meme" }],
    "effects": [{ "id": "fx7", "kind": "explosion", "ttl": 240 }],
    "winner": null
  }
}

// InputDelta
{
  "type": "input",
  "seq": 124,
  "ts": 1689342345300,
  "payload": { "KeyA": true, "KeyD": false, "KeyW": false, "KeyJ": false, "KeyK": true }
}

// Signaling Error
{ "type": "error", "code": "ROOM_NOT_FOUND", "message": "Room expired" }
```

Type aliases (JSDoc or TypeScript) should live in `client/src/types/net.d.ts` and `server/types.d.ts` for shared understanding.

---

## 12. Performance Budgets

- Frame time <= 16.7 ms on 2-core laptop (Chromebook class). No GC pause > 10 ms per minute.
- Snapshot payload <= 6 KB; Input payload <= 200 B. DataChannel throughput < 20 kbps average.
- Relay mode latency budget: < 120 ms round-trip on broadband.
- Initial load <= 2 MB compressed (JS, CSS, assets). Inline art uses procedural drawing, no heavy textures.

---

## 13. QA Plan

**Coverage Matrix**
- Browsers: Chrome (latest -2), Firefox (latest -2), Edge (Chromium latest -2), Safari (latest, macOS/iOS).
- OS: Windows 10/11, macOS 13+, Ubuntu 22.04, iOS 16+, Android 13 (Chromium-based browsers only).

**Test Categories**
- Functional: lobby creation/join, disconnection handling, meme crate spawns, combat interactions, rematch flow.
- Networking: P2P happy path, TURN-only path, relay fallback, packet loss/jitter injection (Chrome net internals or Clumsy).
- Performance: FPS measurement with Chrome DevTools, CPU throttling to 4x slowdown, memory leak checks.
- Security: Origin enforcement, room brute force attempt, oversized message rejection, TURN credential expiry.
- Accessibility: Keyboard navigation, focus outlines, screen reader labels, color contrast AA, pause overlay semantics.

**Automation**
- Integration tests with Playwright to smoke-test host/guest flows via mock signaling server.
- Unit tests for physics, collision detection, and net message validation (Vitest/Jest).
- Linting (ESLint) and formatting (Prettier) in CI.

---

## 14. Acceptance Criteria (v1)

1. Host and guest can connect via room code and establish WebRTC DataChannel in <= 6 seconds median on residential networks.
2. With only TURN reachability, the match still starts and completes without desync.
3. If WebRTC fails or drops mid-match, relay fallback connects within 3 seconds and gameplay remains responsive.
4. Meme crates spawn, bombs apply damage and knockback, and matches resolve with accurate win detection.
5. Client maintains 60 fps on mid-tier hardware and gracefully degrades with clear UI indicators.
6. Telemetry events appear in server logs and metrics dashboards with correct fields.
7. QA plan scenarios execute without high-severity defects.

---

## 15. Deployment and Runbook

**Client**
- Build with `npm run build` (Vite). Deploy dist artifacts to Vercel/Netlify with forced HTTPS and HTTP/2.
- Environment variables: `VITE_SIGNALING_URL`, `VITE_RELAY_URL`, `VITE_TURN_URLS`, `VITE_TURN_API_KEY` (if using dynamic TURN credentials).

**Server**
- Node 18 runtime. Install dependencies (`npm install`). Start with `node signaling.js` and optional `node relay.js`.
- Reverse proxy (Caddy/Nginx) terminates TLS, enforces WSS, sets `Connection: Upgrade`, applies rate limiting, and injects security headers.
- Use PM2 or systemd for process supervision. Configure health check for `/health` (30 second interval, 5 second timeout).

**Runbook**
- Monitoring alerts: connect success rate drops > 15% in 10 minutes, relay utilization > 40%, 5xx errors > 5 per minute, memory > 80%.
- Incident steps: check signaling logs, verify TURN credential issuance, fail over to relay-only mode by toggling env `FORCE_RELAY=true`, notify players via status page.
- Rollback: blue/green deploy with 5% canary traffic for 10 minutes before full rollout.

---

## 16. Risks and Mitigations

- Strict enterprise NATs: supply TURN over TCP/TLS and maintain relay fallback.
- High latency jitter: increase guest interpolation buffer, dynamically adjust snapshot rate.
- Browser quirks (Safari, Firefox DataChannel issues): feature-detect unreliable channels, polyfill `RTCPeerConnection.onnegotiationneeded`.
- Abuse and griefing: enforce per-IP rate limits, captcha challenge at reverse proxy if anomaly detected, throttle meme bomb spam via cooldown.
- Cheating attempts: host-authoritative simulation and server-validated inputs during relay fallback.

---

## 17. Future Enhancements

- Rollback netcode prototype for competitive play.
- Gamepad and mobile touch controls with responsive layout.
- Cosmetic unlocks, victory taunts, and audio packs.
- Binary snapshot encoding (ArrayBuffer) to reduce payload size and GC churn.
- In-app friend list and lobby discovery using short-lived auth tokens.

---

## 18. Developer Notes and Conventions

- Use ESLint (airbnb base) and Prettier with 2-space indentation. Enforce via pre-commit hooks.
- JSDoc or TypeScript typedefs for shared network and physics types.
- Avoid object churn inside the render loop; reuse vector objects and particle pools.
- Wrap `JSON.parse` in try/catch; clamp message sizes and ignore unknown keys.
- Feature flags: `VITE_FORCE_RELAY`, `VITE_DISABLE_PARTICLES`, `FORCE_TURN_ONLY`.

---

### Appendix A: WebRTC Handshake Sequence

1. Host opens WSS and sends `hello(role=host)`.
2. Server returns room code and TURN credentials.
3. Guest sends `hello(role=guest, room=CODE)`.
4. Host creates offer, sets local description, sends `signal(sdp:offer)`.
5. Guest sets remote description, creates answer, sends `signal(sdp:answer)`.
6. Both sides exchange ICE candidates via `signal(ice)` until gathering completes.
7. DataChannel fires `open`; gameplay loop starts.

### Appendix B: QA Regression Checklist

- [ ] `/health` returns `200 ok`.
- [ ] Connect success rate >= 90% over last 24 hours.
- [ ] Median connect time <= 6 seconds.
- [ ] Relay fallback activation rate < 20% on residential networks.
- [ ] No unhandled promise rejections in console logs.
- [ ] Accessibility audits (Lighthouse) score >= 90.
