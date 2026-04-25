# Jarvis + Cabinet Standard Reference (23Apr26)

> **Supersedes:** `Jarvis_Cabinet_Standard_Reference.md` (22Apr26) and all prior Chilly-derived supplements.  
> **Status:** Current as of Thread 4 completion (23 Apr 2026). All 19 agents green. Repo clean and pushed.

---

## 1. High-level architecture

- **Host**: Jarvis — MacBook Pro M4, 32 GB unified memory, macOS, user `mikebird`.
- **Org**: Ocho — multi-agent Oversight Committee for research integrity.
- **Source repo**: `~/cabinet` (fork of `github.com/agenticocho/cabinet`, branch `master`).
- **Core components**:
  - Next.js Cabinet UI — served by `npm run dev` from `~/cabinet`, port **4000**.
  - Cabinet daemon — TypeScript, started by `npm run dev:daemon` from `~/cabinet`, port **4101** (4100 if free).
  - `llama-server` — Homebrew build via Metal GPU acceleration, port **8080**.
  - Data directory: `~/cabinet` (repo root IS the data dir — agents, KB, jobs live here).

> ⚠️ **Critical distinction**: The source repo and the data directory are the same path (`~/cabinet`).  
> Never confuse this with `~/.cabinet/app/v0.3.4/` which is the upstream npm-installed binary. Do not run from there.

---

## 2. Key paths & directories

### 2.1. Repo / data dir (one and the same)

```
~/cabinet/                          ← CABINET_DATA_DIR; git root; npm project root
  .agents/                          ← All 19 agent persona definitions
    <slug>/
      persona.md                    ← YAML frontmatter + instructions body
  .agents/.runtime/                 ← daemon-token (gitignored)
  .agents/.slack/                   ← Slack-channel JSONL logs (gitignored)
  .agents/.memory/                  ← Per-agent memory (gitignored)
  .agents/.history/                 ← Conversation history (gitignored)
  .agents/*/sessions/               ← Session transcripts (gitignored)
  src/                              ← Next.js source (UI + API routes)
    lib/agents/adapters/
      llama-local.ts                ← llama-local adapter (key patch file)
    lib/agents/heartbeat.ts         ← Heartbeat wiring (key patch file)
    app/
      layout.tsx                    ← suppressHydrationWarning on <body>
      agents/conversations/[id]/
        copy-button.tsx             ← suppressHydrationWarning on SVG icons
  server/
    cabinet-daemon.ts               ← Daemon entry point
  .env.local                        ← Primary env config (committed, no secrets)
  .gitignore                        ← Must include .next/, node_modules/, runtime dirs
  docs/                             ← This file and other references
```

### 2.2. Models directory

```
/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/
```

Set via `LLAMA_MODELS_DIR`. The adapter prepends this to bare filenames in `persona.md`.

### 2.3. Upstream binary (DO NOT RUN FROM HERE)

```
~/.cabinet/app/v0.3.4/
```

This is where `npx cabinetai run` installs to. It serves the **upstream unpatched** source with the Cows Colluding demo org. Never use it.

---

## 3. Environment variables

`.env.local` at repo root (committed):

```bash
CABINET_DATA_DIR=/Users/mikebird/cabinet
LLAMA_MODELS_DIR=/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference
LLAMA_SERVER_BIN=/opt/homebrew/bin/llama-server
LLAMA_SERVER_PORT=8080
```

No `NODE_ENV`, no `CABINET_DAEMON_TOKEN` (token is auto-generated to `.agents/.runtime/daemon-token` on first daemon start and read from there automatically).

Shell exports needed at startup (in addition to `.env.local`):

```bash
export CABINET_DATA_DIR=/Users/mikebird/cabinet
```

---

## 4. Starting & stopping services

### 4.1. Standard startup (always use this)

```bash
# Kill any stale processes
pkill -9 -f "next|cabinet-daemon|cabinetai" 2>/dev/null; sleep 2

cd ~/cabinet
export CABINET_DATA_DIR=/Users/mikebird/cabinet

# Start daemon in background
npm run dev:daemon > /tmp/cabinet-daemon.log 2>&1 &
sleep 5

# Verify daemon is up
curl -s http://127.0.0.1:4101/health | jq .
# Expected: { "status": "ok", ... }

# Start Next.js (foreground, or background with & >> /tmp/cabinet-next.log 2>&1)
npm run dev
```

### 4.2. ⚠️ NEVER use these

```bash
npx cabinetai run          # ← Downloads and runs UPSTREAM binary. Wipes your UI patches.
                           #   Agents appear to vanish (shows 5-agent demo org).
                           #   The fix is to pkill and restart with npm run dev.

npx tsx server/cabinet-daemon.ts   # ← Old pattern; no longer applies.
cd ~/.cabinet/app/v0.3.4 && ...    # ← Wrong directory.
```

### 4.3. Health checks

```bash
# UI / Next.js
curl -s http://127.0.0.1:4000/api/health | jq .
# → { "status": "ok", "dataDir": "/Users/mikebird/cabinet", "installKind": "source-custom", ... }

# Daemon
curl -s http://127.0.0.1:4101/health | jq .
# → { "status": "ok", ... }

# Reload cron schedules without restart
curl -sS -X POST http://127.0.0.1:4101/reload-schedules | jq .
```

### 4.4. llama-server

```bash
# Start (if not already running via Cabinet)
/opt/homebrew/bin/llama-server \
  --model /Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/Qwen3.5-4B-UD-Q4_K_XL.gguf \
  --port 8080 &

# Health
curl -s http://127.0.0.1:8080/health | jq .
```

---

## 5. Agents — full roster (19 agents)

All agents live under `~/cabinet/.agents/<slug>/persona.md`.

### 5.1. Persona frontmatter format

```yaml
---
name: Agent Display Name
role: one-line role description
department: department-name
type: specialist          # or: lead, analyst, director, etc.
provider: llama-local
model: Qwen3.5-4B-UD-Q4_K_XL.gguf   # bare filename; adapter prepends MODELS_DIR
active: true
heartbeat: "0 */4 * * *"            # standard 5-field cron expression
workspace: workspace
---
```

Rules:
- **One frontmatter block only** — never two `---` pairs.
- **`model:` in frontmatter only** — never in the body prose.
- **No duplicate `model:` lines** — check with `grep "model:" persona.md`.
- `heartbeat:` accepts any valid 5-field cron string; Cabinet UI presets are just shortcuts.
- `active: false` pauses all scheduled runs for that agent without deleting it.

### 5.2. Agent roster with model assignments

| Slug | Display name | Model | Heartbeat cron |
|---|---|---|---|
| `ceo` | CEO | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 9 * * 1-5` (weekdays 9am) |
| `committee-chair` | Committee Chair | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 */3 * * *` |
| `chief-methodological-officer` | Chief Methodological Officer | `Qwen3.5-9B-UD-Q4_K_XL.gguf`¹ | `0 8,14,20 * * *` |
| `editor` | Editor | `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` | `0 */4 * * *` |
| `linguistic-analysis-chief` | Linguistic Analysis Chief | `Nous-Hermes-2-Mistral-7B-DPO.Q4_K_M.gguf` | `0 10 * * *` |
| `historical-accuracy-monitor` | Historical Accuracy Monitor | `SmolLM3-3B-128K-UD-Q4_K_XL.gguf` | `30 10 * * *` |
| `economic-validation-officer` | Economic Validation Officer | `deepseek-r1-distill-llama-8b-q4.gguf` | `0 11 * * *` |
| `pattern-recognition-director` | Pattern Recognition Director | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 */8 * * *` |
| `data-visualization-inspector` | Data Visualization Inspector | `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` | `30 */8 * * *` |
| `consumer-behavior-verification-officer` | Consumer Behavior Verification Officer | `mistral-7b-instruct-v0.3.gguf` | `30 11 * * *` |
| `cross-industry-intelligence-coordinator` | Cross-Industry Intelligence Coordinator | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 15 * * 2,4` |
| `innovation-assessment-director` | Innovation Assessment Director | `Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf` | `0 11 * * 1,3` |
| `strategic-motivation-analyst` | Strategic Motivation Analyst | `Nous-Hermes-2-Mistral-7B-DPO.Q4_K_M.gguf` | `0 13 * * 2,4` |
| `executive-insights-director` | Executive Insights Director | `Qwen3.5-9B-UD-Q4_K_XL.gguf`¹ | `0 9 * * 1` |
| `strategic-intelligence-officer` | Strategic Intelligence Officer | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 9 * * 1,3,5` |
| `data-analyst` | Data Analyst | `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` | `0 9,17 * * 1-5` |
| `qa` | QA Agent | `Phi-3.5-mini-instruct.Q4_K_M.gguf` | `30 */6 * * *` |
| `researcher` | Researcher | `SmolLM3-3B-128K-UD-Q4_K_XL.gguf` | `0 8,16 * * 1-5` |
| `script-writer` | Script Writer | `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` | `15 */6 * * *` |
| `technical-feasibility-director` | Technical Feasibility Director | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 */6 * * *` |

¹ Upgrade to `DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf` when pulled. Run the two `sed` commands in §8.2.

### 5.3. Confirmed GGUFs on disk (Jarvis)

All located at `/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/`:

```
deepseek-r1-distill-llama-8b-q4.gguf
DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf      ← pull when ready; for CMO + Executive
Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf
FinGPT-MT-Llama-3-8B-LoRA-Q4_K_M.gguf
Llama-3.1-8B-Instruct-abliterated-Q4_K_M.gguf
Llama-3.2-3B-Instruct-Q4_K_M.gguf
mistral-7b-instruct-v0.1.Q4_K_M.gguf
mistral-7b-instruct-v0.3.gguf
mistral-7b-open.gguf
Neural-Chat-7B-Q4_K_M.gguf
Nous-Hermes-2-Mistral-7B-DPO.Q4_K_M.gguf
Phi-3.5-mini-instruct.Q4_K_M.gguf
Phi-3.5-Small-Instruct-UNOFFICAL.Q4_K_M.gguf
Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf
Qwen3.5-0.8B-UD-Q4_K_XL.gguf
Qwen3.5-2B-UD-Q4_K_XL.gguf
Qwen3.5-4B-UD-Q4_K_XL.gguf
Qwen3.5-9B-UD-Q4_K_XL.gguf
Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf              ← MoE; ~3B active params at runtime
SmolLM3-3B-128K-UD-Q4_K_XL.gguf
vicuna-7b-wildchat-rephrase.Q5_K_M.gguf
```

> **Granite is NOT on Jarvis.** It lives only on Chilly (Ryzen 5 / RTX 3060 Ti). QA uses `Phi-3.5-mini` on Jarvis.

---

## 6. Providers, models, and adapters

### 6.1. Llama-local adapter

Source: `~/cabinet/src/lib/agents/adapters/llama-local.ts`

Key behavior:
- Adapter type: `"llama_local"`.
- Provider id: `"llama-local"`.
- Launches `llama-server` as a child process, calls `/v1/chat/completions` on port **8080**.
- Model resolution:
  ```ts
  const MODELS_DIR = process.env.LLAMA_MODELS_DIR
    ?? "/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference";
  // bare filename → MODELS_DIR/filename
  // absolute path → used as-is
  ```
- `effort` mapping: `low` → 2048, `medium` → 8192, `high` → 32768 context tokens.
- Default `temperature`: 0.3.
- Fails with `exitCode: 1` if `adapterConfig.model` is absent.

### 6.2. Heartbeat wiring

Source: `~/cabinet/src/lib/agents/heartbeat.ts`

The key patch that makes per-agent model selection work: `heartbeat.ts` reads `model:` from the persona's YAML frontmatter and passes it into `adapterConfig.model` for each session. Without this patch, all agents fall back to the default model tile regardless of their persona setting.

### 6.3. Session routing

- `/sessions` POST → adapter path (llama_local) if `prompt && adapter && adapter.supportsDetachedRuns`.
- Otherwise falls back to PTY session. PTY path cannot load local GGUFs and will fail.
- All 19 Oversight agents use the adapter path. Verify with daemon log: look for `createAdapterSession`.

---

## 7. Cron / heartbeat schedules

Cabinet's UI heartbeat selector (5m / 15m / 30m / 1h / 4h / Daily 9am / Weekdays / Weekly) is a convenience shortcut only. The daemon reads raw 5-field cron expressions directly from `persona.md`'s `heartbeat:` field. Any valid cron works; the UI will not highlight a preset button if it doesn't match, but the schedule fires correctly.

### 7.1. Apply / update a schedule

```bash
# Direct sed
sed -i '' 's|^heartbeat: .*|heartbeat: "0 */3 * * *"|' \
  ~/cabinet/.agents/committee-chair/persona.md

# Reload without restart
curl -sS -X POST http://127.0.0.1:4101/reload-schedules | jq .
```

### 7.2. Verify all schedules loaded

On daemon startup the log lists every scheduled heartbeat and job. After `reload-schedules`, check:
```bash
curl -s http://127.0.0.1:4101/health | jq .scheduledJobs
```

---

## 8. Git & GitHub

### 8.1. Remote

```
git@github.com:agenticocho/cabinet.git  (branch: master)
```

Verify: `git remote -v`

### 8.2. .gitignore (must include)

```
.next/
node_modules/
.agents/.runtime/
.agents/.conversations/
.agents/.slack/
.agents/.history/
.agents/.memory/
.agents/*/sessions/
tmpnext.log
```

Check and patch:
```bash
for pattern in ".next/" "node_modules/" ".agents/.runtime/" ".agents/.slack/" \
               ".agents/.history/" ".agents/.memory/" ".agents/*/sessions/"; do
  grep -qF "$pattern" ~/cabinet/.gitignore || echo "$pattern" >> ~/cabinet/.gitignore
done
```

### 8.3. Safe commit + push pattern

```bash
cd ~/cabinet

# Stage only source and agent config; never stage .next/, node_modules/, runtime state
git add .gitignore
git add src/
git add .agents/*/persona.md
git add .env.local
git add docs/

git status --short   # review before committing

git commit -m "your message"
git push origin master
```

### 8.4. ⚠️ Large file trap

GitHub rejects files > 100 MB. If a push fails with `GH001: Large files detected`:

```bash
# Install git-filter-repo
brew install git-filter-repo

# Purge large paths from ALL history
git filter-repo --invert-paths \
  --path node_modules \
  --path .next \
  --path tmpnext.log \
  --force

# filter-repo removes the 'origin' remote as a safety measure — re-add it
git remote add origin git@github.com:agenticocho/cabinet.git

# Force push the cleaned history
git push origin master --force
```

> After `git filter-repo`, always re-add origin before pushing. This is the one case where `--force` is appropriate.

### 8.5. Sync button

The UI's Sync button (bottom status bar) syncs with `git@github.com:agenticocho/cabinet.git`. The promotional Chat / Contribute / ★ stars strip has been removed from `status-bar.tsx`; only Sync remains.

---

## 9. Known patches to Cabinet source

These changes are committed to `~/cabinet` and will NOT survive an `npx cabinetai run` restart:

| File | Change | Why |
|---|---|---|
| `src/lib/agents/heartbeat.ts` | Reads `model:` from persona frontmatter → passes to `adapterConfig.model` | Per-agent model selection |
| `src/lib/agents/heartbeat.ts` | Fixed `cabinetPath` join bug (double-path concatenation) | Heartbeats finding wrong persona files |
| `src/lib/agents/adapters/llama-local.ts` | Registered with `supportsDetachedRuns: true` | Forces adapter path, not PTY |
| `src/components/status-bar.tsx` | Removed Chat, Contribute, star-count elements; kept Sync only | Remove promo strip |
| `src/app/layout.tsx` | `suppressHydrationWarning` on `<body>` | Dark Reader hydration mismatch |
| `src/app/agents/conversations/[id]/copy-button.tsx` | `suppressHydrationWarning` on SVG icon spans | Dark Reader hydration mismatch on transcript page |

---

## 10. Heartbeat debugging

### 10.1. Fast-path triage

Before touching any code:

1. Check status panel — App Server, Daemon, Llama.cpp (Local GGUF) all green?
2. Confirm `curl http://127.0.0.1:4101/health` returns `ok`.
3. Run a manual Editor heartbeat from UI. If it passes, the pipeline is intact; the issue is agent-specific.

### 10.2. Trigger a manual heartbeat

```bash
TOKEN=$(cat ~/cabinet/.agents/.runtime/daemon-token)
curl -s -X PUT http://localhost:4000/api/agents/personas/editor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"manual"}' | jq .
```

Watch daemon log (`/tmp/cabinet-daemon.log`):
- ✅ `exitCode: 0` + `outputLength > 0` → healthy
- ❌ `exitCode: 1` or `outputLength: 0` → check model path, frontmatter, effort setting

### 10.3. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `exitCode: 1`, `outputLength: 0` | `adapterConfig.model` missing; GGUF file doesn't exist at path | Check `model:` in persona frontmatter; verify file on disk |
| `daemonFetch timeout after 180000ms` | UI timed out waiting for response (llama-server busy) | Transient; retry. Reduce concurrent agent schedules if recurring |
| Shows 5-agent "Cows Colluding" org | Started via `npx cabinetai run` or wrong `CABINET_DATA_DIR` | Kill; restart with `npm run dev` from `~/cabinet` |
| Daemon port 4100 busy → uses 4101 | Stale process on 4100 | `pkill -9 -f cabinet-daemon`; restart |
| Turbopack `Next.js package not found` | `node_modules/` missing (e.g., after `git filter-repo`) | `npm install` from `~/cabinet` |
| `origin does not appear to be a git repository` | `git filter-repo` removed remote | `git remote add origin git@github.com:agenticocho/cabinet.git` |
| "non-holomorphic fractals" in CEO persona | Old context artifact | `sed -i '' '/non-holomorphic/d' ~/cabinet/.agents/ceo/persona.md` |
| Duplicate `model:` line in persona | Manual edit collision | `grep -n "model:" persona.md`; remove duplicate line |
| Green heartbeat, no transcript | Agent found no work (no-op run) | Normal; check Result box for summary |

---

## 11. Daily startup SOP

```bash
# 1. Open terminal in ~/cabinet
cd ~/cabinet

# 2. Ensure env
export CABINET_DATA_DIR=/Users/mikebird/cabinet

# 3. Kill any stale processes
pkill -9 -f "next|cabinet-daemon|cabinetai" 2>/dev/null; sleep 2

# 4. Start daemon
npm run dev:daemon > /tmp/cabinet-daemon.log 2>&1 &
sleep 5

# 5. Verify daemon
curl -s http://127.0.0.1:4101/health | jq .status   # → "ok"

# 6. Start UI
npm run dev

# 7. Open browser → http://127.0.0.1:4000
# Confirm sidebar shows Ocho org with 19 agents, not "Cows Colluding"
```

---

## 12. Pending / future work

| Item | Notes |
|---|---|
| Pull `DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf` | Reassign CMO + Executive Insights Director; see §5.2 footnote |
| UI custom cron input | Cabinet's preset selector doesn't expose arbitrary cron; edit `persona.md` directly or patch the heartbeat settings panel to accept free-form input |
| Promo strip complete removal | Sync button retained; Chat/Contribute/stars removed. Consider further status-bar customization |
| Model upgrade path | When upgrading Cabinet version, re-apply all patches in §9 to the new version's source before running |
| Chilly ↔ Jarvis sync | Chilly uses Granite models not available on Jarvis. Keep separate `persona.md` branches or add a `[hostname]` override mechanism |

---

*Keep this file at `~/cabinet/docs/Jarvis_Cabinet_Standard_Reference.md`. Update after any session that changes startup procedure, model assignments, agent roster, or source patches.*

The standard is solid — architecture, paths, env, startup/health, persona rules, patches table, debug triage, and git workflow are all well-structured and accurate for Thread 4 state. What it's missing is everything that happened in Threads 5–7: the 20th agent, the daemon port correction, the `.agents/.config.json` org fix, Toasty's full pipeline, the KB scaffold, the `focus` slice patch, and the new Rental Property Analyst agent. A full rewrite would bloat it unnecessarily — an appendix is the right call. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/240007/b4de9247-51be-4ad1-ab74-d8253dc04306/Jarvis-Standard-23Apr26.md?AWSAccessKeyId=ASIA2F3EMEYEVPYMY5MM&Signature=609hlFVDjSQQ2X3XFWVUpeX%2FG5U%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEND%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJIMEYCIQCKf2WQzJ2QAHnmKXDw%2B2XSA%2FfVb%2Be8I%2FpjswB9guEOPQIhAO3DOoP79IfXneV%2Fh9C%2BMFpYw4%2B1LxSJ6A0tWDsRRugYKvwECJj%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQARoMNjk5NzUzMzA5NzA1IgwByafcQQC1mLaW6Awq0ASHhbtPl%2FdTA%2FTxDD08%2Bi9dmaGsQlBdFlxQENDof0gg8lr2QL%2FsisMA6z2c15Xqnzl3S0Xp8DeYsKF%2B3cS%2FjcrwE2jfp%2BQDBm5346ruAz2k2uzAKRbCtAXPzd0Pourw5o8LboG7gxIyH5E4F75nr6FtPCod6KWR4T8BldC15DwGB1%2BL1aHVzZKiehn%2F8REfeu%2FVDzsnhteOmEF%2FY77FkzX0Xi0gj3az3Imvt3m5kWUUrwRB62H1kir1YhGgch2mnt%2FRNdLm%2Fg8DU9SJgbTfsYPNMs%2Bi%2B%2FCSQoSUzQeifPDZat4E6yg8PdxiATOlzAWr0C2NNYBjjN5q6Go4gVvgsxGj%2FpB%2FDRkXM6zF7yalAKXz5kqwgbbKhk%2Fo3%2BmBv9SGcEOZMy%2BvIoGKCPYQoiha2XCafJ4UFLrEZET8rMPWBQDMxOHLRVzY1g7hujUSQhksxaKAx79Z6qfm5iWVEHwMP%2BkxwQBAciKrWJki%2Bn5d9AqR%2FWMxZn4Q0ikCRlRSbsKY9g2j5nQwrulu9pctmJwC4Z5aX2ptcLyny0NadjIoRKMIqniGon9aNP6WNxcvpShxDYKvdRUOP1dsn%2FA7A7gXYlcYPXMUlZlN0j01Llun0MkXpLKGZPNrPhassHtKto76HKIupuQhjsbQwdurFhswMmfK2y1nkA6B%2FQB4ZjqX9fMfHT6xCmEc41cg%2BFrHiktxcpcMdbVHOyWUfU5b%2Brr0appY3fARTeDrbNa%2BfwZYrQp9XSnrnhcb9%2BkH0fL3knKiheUaaCJtIUqL24nKBaLfhklHMOOws88GOpcB6XB%2BbbhdKhT2EzoqKbs4P6qYz0s0FdK3Q%2FPC7iAA1N%2BLKRJH03wKzx%2BfjtR3mKZT%2FUGAwDM7t9%2BqJkVDaUNx%2FrMaHnxVLjXs0p7ckMQZYBz2%2Bgu%2BV7Wd9EIbQRHW7r%2Fr1G2%2Fs8MSRN5vpHWEz06JkL2ycNwGzzvqS8sfnsYvzpApj0G98yUDAthGzF3ww43D9%2BTLnNw68w%3D%3D&Expires=1777130723)

Here it is — tack this onto the end of the existing file:

***

````markdown
---

## Appendix A — Thread 5–7 Changes (25 Apr 2026)

> **Supersedes** the §5.2 roster, §11 SOP agent count, and §12 pending items where they conflict.  
> All other sections of the base standard remain accurate.

---

### A.1 Agent count correction — 20 agents (not 19)

The base standard was written after Thread 4 (19 agents). Thread 5 confirmed a 20th agent was already present in the repo:

| Slug | Display Name | Model | Heartbeat |
|---|---|---|---|
| `technical-feasibility-director` | Technical Feasibility Director | `Qwen3.5-9B-UD-Q4_K_XL.gguf` | `0 */6 * * *` |

Add this row to the §5.2 roster. All references to "19 agents" should read **20 agents**. The sidebar should show 20 Ocho agents on a healthy startup.

**Scheduled jobs count** after reload-schedules:
```bash
curl -s http://127.0.0.1:4101/health | jq '.scheduledJobs | length'
# → 21  (20 Ocho agents + ai-tech-scout on Toasty, if Toasty daemon is up)
# → 20  (Jarvis-only, Toasty offline)
```

---

### A.2 Daemon port correction

Thread 5 confirmed the daemon reliably starts on **port 4100**, not 4101. Cabinet falls back from 4101 → 4100 when 4100 is available. In practice on Jarvis, 4100 is always free and that's the live port.

**Update all health check commands to use 4100:**
```bash
curl -s http://127.0.0.1:4100/health | jq .status
curl -sS -X POST http://127.0.0.1:4100/reload-schedules \
  -H "Authorization: Bearer $(cat ~/cabinet/.agents/.runtime/daemon-token)" | jq .
```

> The startup SOP's `sleep 5 && curl -s http://127.0.0.1:4101/health` still works as a probe, but use 4100 for all subsequent commands in a session.

---

### A.3 Org name / "Cows Colluding" fix

If the sidebar shows "Cows Colluding" (the upstream demo org) instead of "Ocho", the fix is:

```bash
cat > ~/cabinet/.agents/.config.json << 'EOF'
{
  "orgName": "Ocho",
  "orgDescription": "Ocho Oversight Committee"
}
EOF
# Restart UI to pick up the change
pkill -f "next" && npm run dev
```

This is now committed to master. Do not delete `.agents/.config.json`.

---

### A.4 CEO persona rules (critical)

The CEO persona had two confirmed bugs — both fixed and committed:

1. **`model:` must appear in YAML frontmatter only**, never as a prose line in the body.
2. **`active:` must be `true`** — the CEO was accidentally set to `active: false`.
3. **Cron is `0 9 * * 1-5`** (weekdays 9am), not `30 */4 * * *`.

Verify anytime the CEO persona is edited:
```bash
grep -n "model:\|active:\|heartbeat:" ~/cabinet/.agents/ceo/persona.md
# Expected: exactly 1 line each, all in the frontmatter block (lines 1–25)
```

---

### A.5 heartbeat.ts — additional patch (focus file slice)

In addition to the patches in §9, Thread 5 applied one more change to `heartbeat.ts`:

| File | Change | Why |
|---|---|---|
| `src/lib/agents/heartbeat.ts` | `content.slice(0, 500)` → `content.slice(0, 2000)` | Focus-injected files were truncated too aggressively; 500 chars was too short for meaningful KB content |

This change was applied to **both** the live file and the patches copy:
- `src/lib/agents/heartbeat.ts`
- `src/patches/v0.3.4/src/lib/agents/heartbeat.ts`

---

### A.6 KB scaffold — directories seeded

The following directories were created and committed:

```
~/cabinet/
  oversight-committee/kb/        ← Committee oversight notes, verdicts
    index.md
  researcher/kb/                 ← Researcher output
    ai-scout/                    ← Toasty rsync target (see A.7)
  data-analyst/kb/               ← Data Analyst output
  data-analyst/inbox/            ← Drop zone for structured data files
  script-writer/kb/              ← Script Writer output
  researcher/queries.md          ← Active research topic queue
  rentals/statements/            ← Rental Analyst input (gitignored)
  rentals/kb/                    ← Rental Analyst output (gitignored, except status.md)
    status.md
  .jobs/
    researcher-daily-scan.yaml   ← Recurring researcher job
```

**gitignore additions** (append to §8.2):
```
rentals/statements/
rentals/kb/[^s]*
```

---

### A.7 Toasty AI Tech Scout — cross-machine pipeline

**Toasty** is a separate Ubuntu machine (Ryzen 5, 64 GB RAM, RTX 3060 Ti, user `toasty1`) running a single-agent Cabinet installation. It is **not** part of the Ocho org — it's a standalone intelligence cell.

**Toasty pipeline (confirmed operational as of 24 Apr 2026):**

| Stage | Script | Output |
|---|---|---|
| 1 | `hf-scout.py` | `toastyscout/raw/hf-YYYY-MM-DD.jsonl` |
| 2 | `gh-scout.py` | `toastyscout/raw/gh-YYYY-MM-DD.jsonl` |
| 3 | `arxiv-scout.py` | `toastyscout/raw/arxiv-YYYY-MM-DD.jsonl` |
| 4 | `ranker.py` | `toastyscout/processed/ranked-YYYY-MM-DD.jsonl` + `state/seen.db` |
| 5 | `reporter.py` | `toastyscout/reports/ai-scout-YYYY-MM-DD.md` + `toastyscout/kb/index.md` |

- **Cron on Toasty:** `0 5 * * *` (5am daily)
- **Cabinet heartbeat:** `0 7 * * *` (agent reads `kb/index.md` via `focus: [toastyscoutkb]`)
- **Delivery to Jarvis:** rsync `toastyscout/kb/` → `mikebird@jarvis:~/cabinet/researcher/kb/ai-scout/` (Thread 6 wiring — confirm SSH key is set up)
- **Toasty agent:** `ai-tech-scout`, model `SmolLM3-3B-128K-UD-Q4_K_XL.gguf`, CPU-only
- **Key fix:** Persona uses fill-in-the-blank template (not free-recall) to prevent SmolLM3 hallucination. Do not rewrite the persona body without testing.
- **Hallucination recovery:** `rm -f ~/cabinet/.agents/ai-tech-scout/sessions/*.txt` on Toasty, then reload + re-fire.

Scripts are committed under `toastyscout/scripts/` using `git add -f` (directory is gitignored for runtime data; scripts are an exception).

---

### A.8 Rental Property Analyst — new agent (Thread 7)

A standalone financial analysis agent was created for external distribution. It is installed on Jarvis for testing and will be packaged for a third-party user.

| Field | Value |
|---|---|
| Slug | `rental-property-analyst` |
| Model | `Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf` |
| Heartbeat | `0 9 * * 1,4` (Mon + Thu 9am) |
| Input | `rentals/statements/*.md` (or `.csv`, `.txt`) |
| Output | `rentals/kb/<slug>-analysis-<YYYY-MM>.md` |
| Verdict | `BUY / SELL / HOLD / NEEDS DATA` (bold, top of file) |
| Metrics | NOI, Cap Rate, Cash Flow, Cash-on-Cash Return, Expense Ratio, Vacancy Rate |

**Install:**
```bash
mkdir -p ~/cabinet/.agents/rental-property-analyst
cp rental-analyst-persona.md ~/cabinet/.agents/rental-property-analyst/persona.md
mkdir -p ~/cabinet/rentals/statements ~/cabinet/rentals/kb
```

**Smoke-test expected values** (for `test-unit-apr2026.md` sample statement):
- NOI: $1,247/mo (`$1,850 − ($148 + $75 + $200 + $180)`)
- Cap Rate: ~5.25% (`$1,247 × 12 / $285,000`) → **HOLD** verdict expected
- Cash Flow: $297/mo (`$1,247 − $950`)

This agent is **not part of the Ocho Oversight Committee** — it runs alongside the 20 Ocho agents as an independent specialist. Scheduled jobs count after install: **22** (20 Ocho + ai-tech-scout + rental-property-analyst), or **21** if Toasty is offline.

---

### A.9 Updated §12 Pending Items

| Item | Status |
|---|---|
| Pull `DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf` | Still pending. When ready: `sed -i '' "s/^model: .*/model: DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf/" .agents/chief-methodological-officer/persona.md` (and executive-insights-director). Then reload. |
| UI custom cron input | Deferred to future thread. Edit `persona.md` directly for now. |
| Toasty → Jarvis rsync | SSH key setup pending (Thread 6 work). Confirm with `ssh mikebird@<JARVIS_LAN_IP> echo ok` from Toasty. |
| Rental Analyst packaging for Neil | Thread 7 work. Deliver: `rental-analyst-persona.md` + `install-instructions.md` + `sample-statement.md`. |
| Agent job assignments | Researcher has `researcher-daily-scan.yaml`. All others still running no-op heartbeats. Full job queue assignment is Thread 7+ work. |

---

*Appendix A added 25 Apr 2026 after Threads 5–7. Next revision should roll Appendix A into the main body and re-date the document as `Jarvis-Standard-25Apr26.md`.*
````

***

**One note:** the base standard still says "19 agents" in the §11 SOP comment and the header status line. The appendix overrides those, but when you next do a full revision, the document should be re-dated `Jarvis-Standard-25Apr26.md` with Appendix A folded in. The appendix is ready to paste as-is until then.