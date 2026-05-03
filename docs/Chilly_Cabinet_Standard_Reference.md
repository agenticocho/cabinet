# Chilly + Cabinet Standard Reference (02May26 — Thread 15)

> **Last updated:** Thread 15 (02 May 2026). Supersedes all prior versions.
> Keep this file at `~/cabinet/docs/Chilly_Cabinet_Standard_Reference.md`.
> After every thread: edit on disk, commit from `~/cabinet`, push.

---

## 1. High-level architecture

- **Host**: Chilly (Ubuntu server, user `chilly1`, Ryzen 5 / RTX 3060 Ti).
- **Org**: Ocho (Cabinet workspace — non-holomorphic fractals + Oversight Committee).
- **Cabinet version**: v0.4.3.
- **Three separate directories** — do not confuse them:

| Path | Purpose |
|---|---|
| `/home/chilly1/cabinet` | Ocho data dir: personas, KB, docs, `.agents/`. Also a git repo. |
| `/home/chilly1/chilly_containment/cabinet_src` | Cabinet app source (Next.js UI + scripts). Run UI from here. |
| `~/.cabinet/app/v0.3.4` | Legacy Cabinet install. Daemon (`npx tsx server/cabinet-daemon.ts`) runs from here. |

---

## 2. Key paths

### 2.1. Data dir (`~/cabinet`)

- `.agents/` — persona definitions (`persona.md` per agent).
- `.agents/.runtime/daemon-token` — live auth token (gitignored).
- `.agents/.config/providers.json` — provider enable/disable state.
- `data/` — KB and research artifacts.
- `docs/` — this reference and other operational docs.

### 2.2. Cabinet app source (`cabinet_src`)

- `scripts/dev-next.mjs` — started by `npm run dev` (UI on port 4000).
- `scripts/dev-daemon.mjs` — **not used on Chilly** (no `package.json` in data dir).
- `src/` — Next.js app source, patches live under `src/patches/`.

### 2.3. Legacy install (`~/.cabinet/app/v0.3.4`)

- `server/cabinet-daemon.ts` — daemon entry point.
- `src/lib/agents/adapters/llama-local.ts` — llama-local adapter (patched).
- `src/lib/agents/heartbeat.ts` — heartbeat wiring (patched).

### 2.4. Models & llama.cpp

- **Models dir**: `/home/chilly1/moltbook_pipeline/models/`
- **llama-server binary**: `/home/chilly1/llama.cpp/build/bin/llama-server`
- **llama-server port**: `8080`

#### Confirmed GGUFs on disk

| Filename | Assigned to |
|---|---|
| `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` | Available (not currently assigned) |
| `Qwen3.5-4B-UD-Q4_K_XL.gguf` | Editor ✅, CEO ✅, Script Writer, Oversight |
| `Qwen3.5-9B-UD-Q4_K_XL.gguf` | **Do not use** — exceeds VRAM with Xorg running (~6.5GB needed, ~4GB free after Xorg/Chromium) |
| `granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf` | QA |

> Always verify before assigning: `ls -lh /home/chilly1/moltbook_pipeline/models/*.gguf`

---

## 3. Environment variables

Required in every shell that starts the daemon:

```bash
export CABINET_DATA_DIR=/home/chilly1/cabinet
export LLAMA_MODELS_DIR=/home/chilly1/moltbook_pipeline/models
export LLAMA_SERVER_BIN=/home/chilly1/llama.cpp/build/bin/llama-server
```

Token is written at runtime — read it with:
```bash
cat ~/cabinet/.agents/.runtime/daemon-token
```

`cabinet_src` picks up its config from `/home/chilly1/chilly_containment/cabinet_src/.env.local`.

---

## 4. Startup & shutdown

### 4.1. Kill stale processes

```bash
pkill -9 -f "next|cabinet-daemon|cabinetai" 2>/dev/null; sleep 2
```

### 4.2. Start the daemon (terminal 1)

```bash
cd ~/.cabinet/app/v0.3.4
export CABINET_DATA_DIR=/home/chilly1/cabinet
export LLAMA_MODELS_DIR=/home/chilly1/moltbook_pipeline/models
export LLAMA_SERVER_BIN=/home/chilly1/llama.cpp/build/bin/llama-server
npx tsx server/cabinet-daemon.ts
```

Expected output:
```
Cabinet Daemon running on port 4100
DATA_DIR: /home/chilly1/cabinet
Default provider: llama-local
Discovered 1 cabinet(s). Scheduled 0 jobs and 17 heartbeats.
```

### 4.3. Start the UI (terminal 2)

```bash
cd /home/chilly1/chilly_containment/cabinet_src
export CABINET_DATA_DIR=/home/chilly1/cabinet
npm run dev
```

UI available at `http://localhost:4000`. Workspace must say **Ocho**.

> **NEVER** run `npx cabinetai run` — runs the upstream binary, wipes all source patches, shows Cows Colluding demo org.

> **START ORDER**: llama-server must be running **before** `npm run dev`. If llama-server is down when the UI starts, the first heartbeat fires immediately, throws an unhandled fetch rejection, and kills the Next.js process within ~10 seconds.

### 4.4. Health checks

```bash
curl -s http://127.0.0.1:4100/health | jq .status   # "ok"
curl -s http://127.0.0.1:4000/api/health | jq .
```

### 4.5. Reload schedules without restart

```bash
curl -sS -X POST http://127.0.0.1:4100/reload-schedules | jq .
```

---

## 5. Providers, models, and adapters

### 5.1. Llama-local adapter

- **Adapter type** (in code): `"llama_local"` (underscore — never hyphen in adapterType).
- **Provider id**: `"llama-local"`.
- **Source**: `~/.cabinet/app/v0.3.4/src/lib/agents/adapters/llama-local.ts`.
- `supportsDetachedRuns: true` — **confirmed patch, must survive upgrades**.
- llama-server port: `8080`.
- Effort mapping: `low=2048`, `medium=8192`, `high=32768` context tokens.

### 5.2. Per-agent persona requirements

Every agent running on llama-local **must** have in YAML frontmatter:

```yaml
provider: llama-local
adapterType: llama_local
model: <filename.gguf>
active: true
```

- One YAML frontmatter block only (`---` … `---`).
- `model:` in frontmatter **only** — never in body prose.
- No duplicate `model:` lines.
- `heartbeat:` accepts raw 5-field cron (e.g. `"0 */4 * * *"`).

---

## 6. Ocho agents (17 scheduled heartbeats)

### 6.1. Core agents

| Agent | Slug | Model | Cron |
|---|---|---|---|
| Editor | `editor` | `Qwen3.5-4B-UD-Q4_K_XL.gguf` | `50 */4 * * *` |
| CEO | `ceo` | `Qwen3.5-4B-UD-Q4_K_XL.gguf` | `0 */4 * * *` |
| QA | `qa` | `granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf` | `0 14 * * 1-5` |
| Script Writer | `script-writer` | `Qwen3.5-4B-UD-Q4_K_XL.gguf` | `0 9 * * 1-5` |

### 6.2. Oversight Committee agents

All use `Qwen3.5-4B-UD-Q4_K_XL.gguf` and `provider: llama-local`.

| Slug |
|---|
| `committee-chair` |
| `linguistic-analysis-chief` |
| `historical-accuracy-monitor` |
| `economic-validation-officer` |
| `chief-methodological-officer` |
| `executive-insights-director` |
| `strategic-intelligence-officer` |
| `pattern-recognition-director` |
| `data-visualization-inspector` |
| `consumer-behavior-verification-officer` |
| `technical-feasibility-director` |
| `cross-industry-intelligence-coordinator` |
| `innovation-assessment-director` |
| `strategic-motivation-analyst` |

---

## 7. Heartbeat debugging

### 7.1. Manual canary test (Editor)

```bash
TOKEN=$(cat ~/cabinet/.agents/.runtime/daemon-token)
curl -s -X PUT http://localhost:4000/api/agents/personas/editor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"manual"}' | jq .
```

Healthy daemon log: `exitCode: 0` AND `outputLength > 0`.

### 7.2. Fast path

1. Status panel: App Server + Daemon + Llama.cpp all green?
2. `curl http://127.0.0.1:4100/health` → `"ok"`?
3. Editor canary → `exitCode: 0, outputLength > 0`?
4. If Editor green but others red → per-persona issue (frontmatter, model path, budget).
5. **Auto-pause**: after every run the daemon writes `active: false` to persona.md. Before any manual canary run: `sed -i 's/active: false/active: true/' ~/cabinet/.agents/<slug>/persona.md` then reload schedules.
5. `daemonFetch timeout 180000ms` with green health = transient congestion, retry. **Do NOT touch adapter code.**

### 7.3. Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `spawn claude ENOENT` | `adapterType` missing → falls back to `claude` | Add `adapterType: llama_local` to frontmatter |
| `exitCode: 1, outputLength: 0` | Missing `model:` or GGUF not on disk | Check frontmatter; verify file exists |
| `No model configured` | `adapterConfig.model` not passed | Set `model:` in persona YAML frontmatter |
| Daemon on 4101/4102 | Stale process holding 4100 | `pkill -9 -f "cabinet-daemon"`, restart |
| "Cows Colluding" org | Missing `CABINET_DATA_DIR` | Set env before starting UI |
| `daemonFetch timeout` | Model queue congestion | Retry; reduce Oversight cron frequency |
| `"Agent inactive or over budget"` after successful run | Auto-pause: daemon writes `active: false` post-run | `sed -i 's/active: false/active: true/'` persona.md + reload |
| `exitCode: 1, outputLength: 0` (CEO) | Duplicate `model:` lines in frontmatter → YAML parse fails | Remove duplicate `model:` line; keep exactly one |
| `/api/agents/providers 500` | Daemon not running | Start daemon first, then UI |

---

## 8. Known patches (must survive upgrades to `~/.cabinet/app/v0.3.4`)

| File | Patch |
|---|---|
| `src/lib/agents/heartbeat.ts` | Reads `model:` from persona frontmatter → `adapterConfig.model` |
| `src/lib/agents/heartbeat.ts` | Fixed `cabinetPath` join bug |
| `src/lib/agents/adapters/llama-local.ts` | `supportsDetachedRuns: true` |

Patches in `cabinet_src` (`/home/chilly1/chilly_containment/cabinet_src`):

| File | Patch |
|---|---|
| `src/app/layout.tsx` | `suppressHydrationWarning` on `<body>` |
| `src/app/agents/conversations/[id]/copy-button.tsx` | `suppressHydrationWarning` on SVG icon spans |
| `src/components/layout/status-bar.tsx` | Added `ArrowRight` to lucide-react imports |

> **Do NOT touch**: adapter wiring, `supportsDetachedRuns`, `agentAdapterRegistry`, `adapterType` casing (`llama_local`). All confirmed good.

---

## 9. Git workflow

Repo root: `~/cabinet` (data dir, personas, docs only — no app source).

```bash
# Safe to stage:
git add src/ .agents/*/persona.md .agents/.config/ .env.local docs/

# Never stage (gitignored):
# .next/ node_modules/ .agents/.runtime/ .agents/.slack/
# .agents/.history/ .agents/.memory/ .agents/*/sessions/ .cabinet-state/
```

Always edit files on disk and push from Chilly. Never push from GitHub UI to avoid divergence.

Remote: `git@github.com:agenticocho/cabinet.git`

---

## 10. Known-good snapshot (02 May 2026 — end of Thread 15)

| Item | Value |
|---|---|
| Cabinet version | v0.4.3 |
| Daemon binary | `~/.cabinet/app/v0.3.4` via `npx tsx server/cabinet-daemon.ts` |
| UI source | `/home/chilly1/chilly_containment/cabinet_src` via `npm run dev` |
| Daemon port | 4100 |
| UI port | 4000 |
| llama-server port | 8080 |
| Daemon token | `~/cabinet/.agents/.runtime/daemon-token` (rotated Thread 14) |
| Editor heartbeat | ✅ Green (Qwen3.5-4B) |
| CEO heartbeat | ✅ Green (outputLength: 1820 — mission planning) |
| Scheduled heartbeats | 17 |
| Cron collision fix | `*/4` agents staggered by 10min offsets (0,10,20,30,40,50 min) |
| linguistic-analysis-chief | Fixed from `0 * * * *` (hourly) → `0 */6 * * *` |

---

## 11. Thread 16 starting checklist

1. Kill stale processes (§4.1).
2. Start daemon from `~/.cabinet/app/v0.3.4` (§4.2) — confirm port 4100 and `DATA_DIR: /home/chilly1/cabinet`.
3. Start UI from `cabinet_src` (§4.3) — confirm Ocho workspace.
4. Health checks (§4.4) — both 4000 and 4100 green.
5. Editor canary (§7.1) — `exitCode: 0, outputLength > 0`.
6. Canary remaining unverified agents: QA (Granite), Script Writer, and spot-check Oversight agents.
7. Consider patching heartbeat.ts to skip auto-pause (`active: false` write) for llama-local adapter — prevents manual canary friction.
7. Fix any red agents (frontmatter, model file, adapterType).
8. Edit this file on disk, commit from `~/cabinet`, push.
