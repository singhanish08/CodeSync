# CodeSync — Real-Time Collaborative Code Editor with AI Assistant

A collaborative code editor where multiple users edit the same file in real time with **no merge conflicts** (CRDT-powered sync), and anyone can summon an AI assistant to **explain**, **review**, or **refactor** the current code. AI responses stream live to everyone in the room, and refactor suggestions appear as a diff that any user can **accept** (applied live to all clients as a conflict-free transaction) or **reject**.

Built as a TypeScript monorepo: `client/` (React + Vite) and `server/` (Express + Socket.io).

---

## Features

- **Conflict-free real-time editing** — Yjs CRDT document synced over a custom Socket.io channel (binary updates as base64 strings, *not* a separate y-websocket server).
- **Live presence & cursors** — colored avatar presence bar plus in-editor cursor labels with each collaborator's display name (Yjs awareness protocol).
- **AI assistant (Groq, `openai/gpt-oss-120b`)** — three modes: Explain, Review, and Refactor. Responses stream live to the entire room.
- **Diff-based refactor suggestions** — the AI returns strict JSON (`response_format: json_object`) with line-range changes; accepting applies them via a proper `Y.Doc.transact` on the shared `Y.Text` so they merge safely with concurrent human edits.
- **Tree-sitter context extraction** — the file is parsed and the AI receives a compact structured view (symbol names, signatures, line ranges, plus the enclosing function/class of a selection) instead of a raw file dump. Grammars ship for JavaScript, TypeScript, Python, C, C++, Java, Go, Rust, Ruby, JSON, HTML, CSS and Bash; PHP and Markdown fall back to raw text on this platform (see "Known limitations").
- **Custom JWT auth** — 15-minute access tokens (kept in memory), httpOnly refresh cookies, `tokenVersion` invalidation on password reset, Gmail-based password reset with SHA-256-hashed tokens and anti-enumeration responses.
- **Proactive token refresh** — the client refreshes ~1 minute before expiry and reconnects the socket with the new token, so an active session is never silently dropped. A 401 also triggers a single silent retry.
- **Three themes** — Light, Dark, and a warm low-blue-light **Eye Shield** mode, applied consistently across the app *and* Monaco via three custom registered editor themes. Persisted in `localStorage`.
- **Fully responsive** — desktop gets the editor + docked AI panel; mobile gets a bottom tab bar (Editor / AI Review / Presence), each view full-width.
- **Durable rooms** — Yjs document state is snapshotted to MongoDB every 30s and on last-user-leaves, so content survives server restarts.
- **Cold-start friendly** — a branded "Waking up the server…" state (terminal window + blinking carets) is shown while the backend connects instead of a frozen screen.
- **Landing page** — a 100% client-side marketing site (works even when the free-tier backend is asleep): a live typewriter editor demo, a **real** two-document Yjs CRDT playground with a latency toggle, a scripted AI-stream simulation that renders an actual `diff`, and a theme playground that re-themes live. A ⌘K command palette, scroll-progress navbar, and custom 404 complete it.

---

## Tech stack

| Layer        | Technology                                                                |
| ------------ | ------------------------------------------------------------------------- |
| Frontend     | React 18 + TypeScript + Vite, Tailwind CSS, React Router                  |
| Editor       | Monaco (`@monaco-editor/react`)                                           |
| Real-time    | Yjs + y-protocols, transported over Socket.io (base64)                    |
| Editor binding | y-monaco                                                                |
| Backend      | Node + Express + TypeScript, Socket.io                                    |
| Database     | MongoDB + Mongoose (Atlas)                                                |
| AI           | Groq SDK, model `openai/gpt-oss-120b`                                     |
| Parsing      | tree-sitter (+ javascript / typescript / python / c / cpp / java / go / rust / ruby / json / html / css / bash grammars) |
| Auth         | jsonwebtoken + bcrypt, nodemailer (Gmail SMTP) for resets                 |

---

## Project structure

```
CodeSync/
├── client/                 # React + Vite + TS frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/         # Design-system primitives (Button, Card, Modal…)
│   │   │   ├── landing/    # Landing sections + client-side demos
│   │   │   ├── editor/     # CodeEditor (Monaco + y-monaco)
│   │   │   ├── ai/         # AIPanel + DiffView (real `diff` package)
│   │   │   └── room/       # StatusBar, PresenceBar, HistoryDrawer, …
│   │   ├── contexts/       # ThemeContext, AuthContext
│   │   ├── pages/          # Landing, Login…ResetPassword, Dashboard,
│   │   │                   #   RoomEditor, NotFound
│   │   ├── hooks/          # useSocket, useYjsDoc, useAuth
│   │   ├── lib/            # api, socket, monacoSetup, themeBus, utils
│   │   └── styles/         # globals.css (theme tokens)
│   └── package.json
├── server/                 # Express + TS backend
│   ├── src/
│   │   ├── models/         # User.ts, Room.ts, EditHistory.ts
│   │   ├── routes/         # authRoutes.ts, roomRoutes.ts
│   │   ├── middleware/     # requireAuth.ts
│   │   ├── sockets/        # socketHandlers.ts (all io.on('connection') logic)
│   │   ├── services/       # groqService.ts, treeSitterService.ts, emailService.ts
│   │   ├── utils/          # jwt.ts, asyncHandler.ts, apiError.ts
│   │   └── index.ts
│   └── package.json
├── .env.example            # combined reference (see server/ and client/ copies)
└── README.md
```

---

## Prerequisites

- **Node.js 18+** and npm
- A **MongoDB** database (local or Atlas — see deployment)
- A **Groq API key** — free at <https://console.groq.com/keys>
- A **Gmail App Password** for password-reset emails (see below)

### Getting a Gmail App Password

Password reset emails use Gmail SMTP. Gmail does not allow your account password for this; you need an **App Password**:

1. Enable **2-Step Verification** on your Google account (<https://myaccount.google.com/security>).
2. Open **App passwords** (<https://myaccount.google.com/apppasswords>).
3. Create a new app password (name it e.g. "CodeSync").
4. Copy the 16-character password — this goes in `GMAIL_APP_PASSWORD`. Your Gmail address goes in `GMAIL_USER`.

> The app still runs without these two variables — the forgot-password endpoint logs a server-side warning and returns the same generic success message. You just won't receive the email.

### Getting a Groq API key

1. Sign in at <https://console.groq.com>.
2. Go to **API Keys → Create API key**.
3. Copy it into `GROQ_API_KEY`. The free tier is generous and fast.

---

## Local setup

### 1. Clone and install

```bash
git clone <your-repo-url> CodeSync
cd CodeSync

# Option A — install both apps from the root (npm workspaces)
npm install --legacy-peer-deps

# Option B — install each app separately
(cd server && npm install --legacy-peer-deps)
(cd client && npm install --legacy-peer-deps)
```

> **Why `--legacy-peer-deps`:** the tree-sitter grammar packages declare a narrow
> peer range for the `tree-sitter` runtime, which conflicts with the runtime
> version this project pins. The combination is tested and works; the flag just
> silences the (harmless) peer resolution error. The grammars ship prebuilt
> binaries, so no native compilation is needed on Windows/macOS/Linux.

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable             | Required | Description                                              |
| -------------------- | -------- | -------------------------------------------------------- |
| `MONGODB_URI`        | yes      | e.g. `mongodb://127.0.0.1:27017/codesync` or an Atlas SRV |
| `JWT_ACCESS_SECRET`  | yes      | Any long random string. Generate with `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | yes      | A different long random string                            |
| `GROQ_API_KEY`       | yes*     | Groq API key (*the app boots without it but AI calls fail) |
| `GMAIL_USER`         | no       | Gmail address for reset emails                            |
| `GMAIL_APP_PASSWORD` | no       | Gmail App Password (see above)                            |
| `FRONTEND_URL`       | no       | Client origin, defaults to `http://localhost:5176`        |
| `PORT`               | no       | Defaults to `5175`                                        |
| `NODE_ENV`           | no       | `development` locally                                     |

> **Note on cookies in development:** the refresh cookie is `Secure` + `SameSite=None` only when `NODE_ENV=production`. Locally the server uses `SameSite=Lax` over plain HTTP, because browsers refuse `Secure` cookies on `http://localhost`.

### 3. Configure the client

```bash
cp client/.env.example client/.env
```

`client/.env` defaults work for local development:

```
VITE_API_URL=http://localhost:5175
VITE_SOCKET_URL=http://localhost:5175
```

### 4. Run both

```bash
# Terminal 1 — backend (http://localhost:5175)
cd server
npm run dev

# Terminal 2 - frontend (http://localhost:5176)
cd client
npm run dev
```

Open <http://localhost:5176>, create an account, create a room, and start editing. Open a second browser (or an incognito window) on the same room to see live collaboration.

**That's it** — no build step or migrations needed; Mongoose creates the collections on first write.

---

## How real-time sync works

1. The client authenticates the socket with `handshake.auth.token` (verified by `io.use()`).
2. `join_room` → the server loads (or restores from MongoDB) the room's `Y.Doc`, replies with `room_state` (full doc state + presence list), and broadcasts `presence_update`.
3. Local edits produce `yjs_update` events (base64). The server applies them to the room doc and relays them to other clients, who `Y.applyUpdate` them.
4. Cursor/selection state rides on `awareness_update` (y-protocols awareness), rendered by y-monaco as colored cursors with name labels.
5. Every 30s (and when the last user leaves), the server snapshots `Y.encodeStateAsUpdate(doc)` into `Room.yjsDocState`.

### Socket.io events

| Event                | Direction | Payload                                                        |
| -------------------- | --------- | -------------------------------------------------------------- |
| `join_room`          | C → S     | `{ roomId }` — the server verifies membership (owner or `members`) before joining the socket to the room |
| `room_state`         | S → C     | `{ update: base64, presence: PresenceUser[] }`                 |
| `yjs_update`         | both      | `{ update: base64 }`                                           |
| `awareness_update`   | both      | `{ update: base64 }`                                           |
| `presence_update`    | S → C     | `{ users: PresenceUser[] }`                                    |
| `summon_ai`          | C → S     | `{ roomId, mode, selectedCode?, fullFileContext, language }`   |
| `ai_stream_chunk`    | S → C     | `{ suggestionId, token }`                                      |
| `ai_stream_end`      | S → C     | `{ suggestionId, mode, summonedByName }`                       |
| `ai_suggestion_ready`| S → C     | `{ suggestionId, explanation, changes: Change[] \| null, summonedByName }` |
| `accept_suggestion`  | C → S     | `{ roomId, suggestionId }`                                     |
| `ai_suggestion_accepted` | S → C | `{ suggestionId }`                                            |
| `reject_suggestion`  | C → S     | `{ roomId, suggestionId }`                                     |
| `ai_suggestion_rejected` | S → C | `{ suggestionId }`                                            |
| `ai_error` / `error` | S → C     | `{ message }`                                                  |

> `summonedBy` / `summonedByName` are optional additive fields (sent when the
> summoning user's name is known) so every client can attribute an AI request —
> the panel shows *"Alice asked for a review"* instead of an anonymous stream.
> Older clients that ignore them keep working unchanged.

---

## Design system

Three modes — **Light "Studio Paper"**, **Dark "Midnight Aurora"**, and **Eye Shield "Amber Terminal"** (warm-only, for low-blue-light hours) — are driven by CSS custom properties on `:root`, switched with a `data-theme` attribute on `<html>`, and exposed as Tailwind utilities (`bg-bg-primary`, `text-text-primary`, `border-border`, …). **Components never contain raw hex values** — the only places a literal colour appears are the token definitions in `globals.css`, the Prism theme objects, and the Monaco theme registrations.

### Tokens

`client/src/styles/globals.css` defines the whole palette; `tailwind.config.js` maps every token to a utility so views stay semantic.

| Token group        | Examples                                                    |
| ------------------ | ----------------------------------------------------------- |
| Core (kept)        | `--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--accent`, `--border`, `--shadow` |
| Extended accents   | `--accent-2`, `--accent-3`, `--accent-foreground`            |
| Status             | `--danger`, `--danger-foreground`, `--success`, `--warning`  |
| Surface effects    | `--glow`, `--grid-line`, `--surface-glass`, `--code-bg`, `--grain` |
| Collaborator colors| `--cursor-1` … `--cursor-8` (warm-only in Eye Shield)        |

Each theme also carries its own backdrop (dotted grid / aurora mesh / amber vignette + scanlines) applied by the `.theme-backdrop` layer, plus a shared SVG `.grain` overlay.

### Signature elements

- **Collaborator cursors with name flags** — awareness colors resolve client-side from `--cursor-N`, so Eye Shield never renders a blue cursor even though the server assigns colors from its own fixed palette.
- **Gradient hairline borders** — `.gradient-border`, plus a cursor-follow `.spotlight` on cards.
- **Keycap chips** — `.kbd` for `⌘K`-style hints.
- **Window-chrome code frames** — `.editor-surface` with traffic-light dots for every code sample.

### Motion

Framer Motion springs (`[0.22, 1, 0.36, 1]`), staggered scroll reveals, and magnetic hover — **transform/opacity only**. Every animation respects `prefers-reduced-motion`, with static fallbacks in `globals.css`.

### Code-splitting

Monaco and Yjs are imported only from the editor route (`React.lazy` in `App.tsx`), and `ThemeContext` talks to Monaco through a zero-dependency pub/sub (`lib/themeBus.ts`) instead of importing it. The landing page loads **zero** Monaco bytes — verified at build time.

### Adding a fourth theme

1. Add a `[data-theme="yourname"]` block in `client/src/styles/globals.css` with every token above (the warm-only rule only applies to Eye Shield; a new theme may use any hue).
2. Add the name to `AppTheme` in `client/src/types.ts` and to `THEME_LABELS` in `lib/utils.ts`.
3. Register a matching Monaco theme in `lib/monacoSetup.ts` (`MONACO_THEME_FOR`) and a `theme-color` in `ThemeContext.tsx`.
4. Add an icon + entry to `OPTIONS` in `components/ThemeToggle.tsx`.

That's the whole surface area — no component needs to change, because nothing reads theme names directly.

---

## Deployment

### A. MongoDB Atlas (database)

1. Create a free **M0** cluster at <https://www.mongodb.com/atlas>.
2. Under **Database Access**, add a user (username + password).
3. Under **Network Access**, allow your IP (and, for Render, allow `0.0.0.0/0` or use Render's static egress IPs).
4. Click **Connect → Drivers**, copy the connection string, and use it as `MONGODB_URI` (replace `<password>` and set a db name, e.g. `?retryWrites=true&w=majority&appName=Cluster0`).

### B. Render (backend — needs a persistent process, *not* serverless)

1. Push the repo to GitHub.
2. In Render, create a new **Web Service** and connect the repo.
3. Configure:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Instance Type:** Free or Starter (a free tier will sleep after inactivity — the frontend shows "Waking up the server…" while it cold-starts)
4. Add environment variables (from `server/.env.example`) — set `NODE_ENV=production`, `FRONTEND_URL` to your Vercel URL, plus your Atlas `MONGODB_URI`, JWT secrets, `GROQ_API_KEY`, and Gmail credentials.
5. Deploy and note the service URL (e.g. `https://codesync-api.onrender.com`).

### C. Vercel (frontend — static Vite build)

1. In Vercel, **Import** the repo.
2. Configure:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (Vercel runs `npm install` automatically)
   - **Output Directory:** `dist`
3. Add environment variables:
   - `VITE_API_URL` = your Render service URL (e.g. `https://codesync-api.onrender.com`)
   - `VITE_SOCKET_URL` = same origin
4. Deploy.

### Production checklist

- ✅ `NODE_ENV=production` on the backend so the refresh cookie is `Secure` + `SameSite=None` (required for the cross-domain Vercel→Render cookie).
- ✅ `FRONTEND_URL` set to the exact Vercel origin — the server's CORS allows only that origin with `credentials: true`.
- ✅ In your browser, third-party cookies must be allowed for the Render domain, or the refresh cookie will be blocked (a limitation of cross-origin httpOnly cookies in 2026-era browsers — if your users have third-party cookies blocked, consider serving the frontend and API from the same domain via a proxy).

---

## API reference

All REST routes are prefixed with `/api`.

### Auth (`/api/auth`)

| Method | Path               | Body                                   | Returns                                   |
| ------ | ------------------ | -------------------------------------- | ----------------------------------------- |
| POST   | `/signup`          | `{ email, password, displayName }`     | `{ accessToken, user }`                   |
| POST   | `/login`           | `{ email, password, rememberMe }`      | `{ accessToken, user }` + refresh cookie  |
| POST   | `/refresh`         | _(cookie)_                             | `{ accessToken, user }`                   |
| POST   | `/logout`          | _(cookie)_                             | `{ message }` (clears cookie)             |
| POST   | `/forgot-password` | `{ email }`                            | `{ message }` (always generic)            |
| POST   | `/reset-password`  | `{ token, newPassword }`               | `{ message }`                             |

### Rooms (`/api/rooms` — `Authorization: Bearer <accessToken>`)

| Method | Path                       | Body                       | Returns                          |
| ------ | -------------------------- | -------------------------- | -------------------------------- |
| GET    | `/`                        | —                          | `{ rooms: RoomDTO[] }`           |
| POST   | `/`                        | `{ name, isPublic, password? }` | `{ room: RoomDTO }` (201). `password` is required for private rooms, ignored for public. |
| GET    | `/:id`                     | —                          | `{ room: RoomDTO }` (**403 unless the caller is the owner or a member** — a non-member is sent to the Join Room flow, even for a public room) |
| PUT    | `/:id`                     | `{ name }`                 | `{ room: RoomDTO }` (**owner only**) |
| GET    | `/:id/visibility`          | —                          | `{ isPublic }` — lightweight probe the "Join room" dialog uses to decide whether to ask for a password |
| POST   | `/:id/join`                | `{ password? }`            | `{ room: RoomDTO }`. Public rooms: no password ever. Private rooms: `bcrypt.compare` unless already owner/member. Adds the caller to `members`. |
| GET    | `/:id/history`             | —                          | `{ history: EditHistoryDTO[] }`  |

**Room access — no links.** There are no invite links, shareable URLs, or tokens anywhere in the app. The only way into a room you do not own is the **Join Room** flow: the **Room ID**, plus the room's **password** if it is private.

- `GET /:id` is membership-gated. A non-member gets a 403 and the client redirects them to the dashboard with the Join Room modal pre-filled with that Room ID (`/dashboard?join=<roomId>`) rather than silently granting access.
- `POST /:id/join` is the single entry point: public rooms admit on the Room ID alone, private rooms also `bcrypt.compare` the supplied password. Membership is persisted, so re-joining (and `GET /:id`) afterwards is seamless.
- The socket layer enforces the same gate — `join_room` verifies owner/member before joining the socket to the room, so knowing a Room ID is never enough on its own.
- Private rooms store a bcrypt `passwordHash` (`select: false`); public rooms never check a password.

---

## Scripts

| Command                     | What it does                          |
| --------------------------- | ------------------------------------- |
| `npm run dev` (in `server`) | `tsx watch` dev server with hot reload |
| `npm run build` (in `server`)| Compiles TypeScript to `dist/`        |
| `npm run start` (in `server`)| Runs the compiled server              |
| `npm run dev` (in `client`) | Vite dev server (HMR)                 |
| `npm run build` (in `client`)| `tsc -b && vite build` → `dist/`      |
| `npm run typecheck` (either)| `tsc --noEmit`                        |

---

## Known limitations & manual-testing notes

- **tree-sitter is best-effort.** The grammars load native modules; each grammar is loaded in its own `try/catch`, so one that fails to install or load only disables that language (the AI pipeline then sends raw text for it). On this machine (Node 24, Windows) the prebuilt binaries load and parse JS/TS/Python plus C, C++, Java, Go, Rust, Ruby, JSON, HTML, CSS and Bash. Two requested languages have no stable 0.21-compatible published grammar on npm and fall back to raw-text context: **PHP** (`tree-sitter-php@0.21` requires a native compile with the MSVC toolchain, which this machine lacks) and **Markdown** (no 0.21-era release; the package split into `tree-sitter-markdown` + `-inline` only at 0.23+). Adding either later is a one-line entry in the `extraGrammars` list in `server/src/services/treeSitterService.ts`.
- **Line numbers in AI diffs** are computed against the file content captured at `summon_ai` time. If collaborators edit the file while a refactor suggestion is pending, the accepted change may land at slightly shifted offsets. It is still applied as a valid CRDT transaction (it never corrupts the doc), but review diffs before accepting on a busy file.
- **The empty-room starter snippet** is seeded by the first client only when it is alone in the room, to avoid duplicate insertions when several people join an empty room simultaneously.
- **Third-party cookies** are required for cross-domain refresh to work in production (see the production checklist above).
- **Bundle size.** Monaco is bundled locally (rather than loaded from a CDN) so the app is self-contained and reliable on Vercel. It lives in a dedicated **lazy chunk** that only the editor route ever imports — the landing page loads zero Monaco bytes (verified at build time: the main chunk contains no `monaco` references). Vercel further serves the language workers as separate lazily-loaded chunks.
- **Edit history** logs human edits in throttled batches (~1 per 3s per room), not per keystroke.
- **`npm install` on Render** runs inside `server/`; because the root declares npm workspaces, npm walks up and may install the client tree too. If that becomes a problem, remove the `workspaces` field from the root `package.json` (it is only a local-dev convenience) or set Render's root directory appropriately.

## License

MIT — build, learn, and remix freely.
