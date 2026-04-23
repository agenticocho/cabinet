# Jarvis + Cabinet Standard Reference (22Apr26)

> **Delta from Chilly standard**  
> Host: Jarvis MacBook Pro (macOS, user `mikebird`) instead of Chilly Ubuntu (`chilly1`).  
> Data dir: `/Users/mikebird/cabinet` instead of `/home/chilly1/cabinet`.  
> Models dir: `/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference` instead of `/home/chilly1/moltbook_pipeline/models`.  
> Llama server: `/opt/homebrew/bin/llama-server` via Homebrew/Metal instead of source build under `/home/chilly1/llama.cpp`.  
> Runtime: local dev (`next dev -p 4000` + daemon on 4100) instead of production wrapper `npx cabinetai run`.

## 1. High-level architecture

- **Host**: Jarvis MacBook Pro (macOS, user `mikebird`).
- **Org**: Ocho (Cabinet workspace for non-holomorphic fractals + Oversight Committee).
- **Core components**:
  - Next.js Cabinet UI.
  - Cabinet daemon (Node/TypeScript) on port 4100.
  - `llama.cpp` `llama-server` for local GGUF inference on RTX 3060 Ti.
  - Data directory at `/Users/mikebird/cabinet` (agents, KB, jobs, research).

## 2. Key paths & directories

### 2.1. Data dir (Ocho workspace)

- **Root**: `/Users/mikebird/cabinet`.
- Purpose: Holds agents, KB artifacts, jobs, and any files Cabinet agents read/write.
- Important subdirs:
  - `data/`  – KB and research artifacts (e.g., `non-holomorphic-fractals.md`).
  - `data/chilly-containment/` – curated tree for heavy symlinks, used to avoid slow scans.
  - `.agents/` – persona definitions (`persona.md` per agent), schedules, and jobs.
  - `.jobs/` – scheduled job definitions (`.yaml`).

### 2.2. App install dir (Cabinet binaries + UI source)

- **Root**: `/Users/mikebird/.cabinet/app/v0.3.4`.
- Purpose: Versioned Cabinet application code (do NOT store user data here).
- Important paths:
  - `server/cabinet-daemon.ts` – unified daemon (PTY + adapter sessions + scheduler).
  - `src/lib/agents/adapters/llama-local.ts` – llama-local adapter implementation.
  - `heartbeat.ts` – heartbeat job wiring.

### 2.3. Local models & llama.cpp

- **Models directory** (as seen by adapter):
  - `MODELS_DIR = process.env.LLAMA_MODELS_DIR ?? "/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference"`.
- Known GGUFs used:
  - `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` – Editor / coder model.
  - Others (Qwen3.5 4B, Granite variants) live under the same directory.
- `llama.cpp` build:
  - Binary: `/opt/homebrew/bin/llama-server`.

## 3. Environment variables

Set these **before** starting the daemon and UI.

```bash
export CABINET_DATA_DIR=/Users/mikebird/cabinet
export CABINET_DAEMON_TOKEN=$(cat /home/chilly1/.cabinet/app/v0.3.4/daemon-token 2>/dev/null || echo "jarvis-fresh-token")
export NODE_ENV=production
# Optional: explicit model dir and llama-server path
export LLAMA_MODELS_DIR=/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference
export LLAMA_SERVER_BIN=/opt/homebrew/bin/llama-server
```

Notes:
- `CABINET_DATA_DIR` must point at the Ocho data dir; otherwise you fall back to the Cows Colluding demo org.
- `CABINET_DAEMON_TOKEN` must match what the UI and curl tests send as `Authorization: Bearer ...`.

## 4. Starting & stopping services (Jarvis MacBook)

### 4.1. Start the daemon (port 4100)

```bash
cd /Users/mikebird/.cabinet/app/v0.3.4
export CABINET_DATA_DIR=/Users/mikebird/cabinet
export CABINET_DAEMON_TOKEN=jarvis-fresh-token
export NODE_ENV=production
npx tsx server/cabinet-daemon.ts
```

Expected log tail:

- `Initializing Cabinet database...`
- `Database ready.`
- `Cabinet Daemon running on port 4100`
- `DATA_DIR: /Users/mikebird/cabinet`
- `Default provider: llama-local`
- `Discovered 1 cabinet(s). Scheduled 0 jobs and 8 heartbeats.`

### 4.2. Start the UI (bound to Ocho, not demo)

Preferred: run from the **data dir** so the org is Ocho.

```bash
cd /Users/mikebird/cabinet
export CABINET_DATA_DIR=/Users/mikebird/cabinet
npx cabinetai run
```

If you run from `/Users/mikebird/.cabinet/app/v0.3.4` without `CABINET_DATA_DIR`, the UI opens the **Cows Colluding** demo workspace. Always set `CABINET_DATA_DIR` or start from `/Users/mikebird/cabinet` to get Ocho.

### 4.3. Health checks

Quick checks from another terminal:

```bash
curl -s http://localhost:4100/health | jq
# → {"status":"ok","ptySessions":N,"scheduledJobs":0,...}

curl -v http://localhost:4100/sessions   -H "Authorization: Bearer $CABINET_DAEMON_TOKEN"   -H "Content-Type: application/json"   -d '{
    "providerId": "llama-local",
    "adapterType": "llama_local",
    "adapterConfig": {
      "model": "Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf",
      "effort": "medium",
      "temperature": 0.3
    },
    "prompt": "Say hello",
    "cwd": "/Users/mikebird/cabinet"
  }'
```

Expected daemon log snippet for a healthy adapter path:

```text
[daemon] adapter lookup { providerId: 'llama-local', adapterType: 'llama_local', hasAdapter: true, ... }
[daemon] POST /sessions using adapter path session-... llama-local llama_local
[daemon] createAdapterSession session-... llama-local llama_local
LLAMA_SERVER_BIN live /opt/homebrew/bin/llama-server
serverBin resolved to /opt/homebrew/bin/llama-server
llama-local cwd /Users/mikebird/cabinet
[daemon] createAdapterSession complete session-... llama-local llama_local {
  exitCode: 0,
  outputLength: 145,
  outputTail: '...Hello! How can I assist you today?'
}
```

## 5. Providers, models, and adapters

### 5.1. Llama-local adapter

Source: `/Users/mikebird/.cabinet/app/v0.3.4/src/lib/agents/adapters/llama-local.ts`.

Key behavior:

- Adapter type: `"llama_local"`.
- Provider id: `"llama-local"`.
- Execution engine: launches `llama-server` as a child process, then calls `/v1/chat/completions` on port `8421`.
- Resolves model via:

  ```ts
  const MODELS_DIR = process.env.LLAMA_MODELS_DIR ?? "/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference";

  function resolveModel(config: Record<string, unknown>): string | null {
    const m = config["model"];
    if (typeof m !== "string" || !m.trim()) return null;
    const p = m.trim();
    return p.startsWith("/") ? p : `${MODELS_DIR}/${p}`;
  }
  ```

- Requires `adapterConfig.model` to be set for each session; otherwise returns exitCode 1 with error message "No model configured. Set model in agent adapter config.".
- Supports `adapterConfig.effort` in `{low, medium, high}` mapping to `{2048, 8192, 32768}` context sizes.
- Supports `adapterConfig.temperature` (number, default 0.3).

### 5.2. Session routing in the daemon

In `server/cabinet-daemon.ts`:

- `/sessions` POST body fields of interest:

  ```ts
  const { id, providerId, adapterType, adapterConfig, prompt, cwd, timeoutSeconds } = JSON.parse(body);
  ```

- Logic:
  - Resolves provider id and adapter type.
  - Looks up adapter from `agentAdapterRegistry`.
  - If `prompt && adapter && adapter.supportsDetachedRuns`, runs the **adapter path** via `createAdapterSession`.
  - Otherwise falls back to a PTY session via `createDetachedSession` and `getSessionLaunchSpec`.

For llama-local GGUF usage on Chilly you want **all heartbeats** to go through the adapter path, not PTY.

## 6. Using Ocho and Oversight agents

### 6.1. Org and agents

- Org: **Ocho** (Jarvis MacBook replica of Chilly workspace).
- Primary agents:
  - CEO
  - Editor
  - QA Agent
  - Script Writer
  - Oversight Committee personas: Committee Chair, Linguistic Analysis Chief, Historical Accuracy Monitor, Economic Validation Officer.

The Editor is currently the most reliable, with fully green heartbeats using the Qwen coder 7B model. Other agents need their provider/model mappings aligned to get green heartbeats consistently.

### 6.2. Provider configuration in UI

In the Cabinet UI under **Ocho → Settings → Providers**:

- Default provider: **Llama.cpp (Local GGUF)**.
- Default model tiles include (labels may vary):
  - Qwen3.5 4B (CEO/Script)
  - Qwen2.5.1 Coder 7B (Editor)
  - Granite 3.3 2B Critic (QA)
  - Qwen3.5 9B (Editor alt)
  - Qwen3.5 2B (Fast/Fallback)
  - etc.

Each tile corresponds to a model preset bound to the `llama_local` adapter with a specific `adapterConfig` (model filename, effort, temperature). Editor’s preset is known-good and mapped to `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf`.

### 6.3. Per-agent configuration checklist

For every agent that should run on local GGUF:

1. **Provider**: set to *Llama.cpp (Local GGUF)*.
2. **Adapter type**: `llama_local`.
3. **Model preset**: pick one that has a valid underlying GGUF file.
4. **Effort**: usually `Medium` for general runs, `High` for full context editor passes.

If an agent is still red on heartbeats:

- Confirm in its settings that it is not pointing at a missing API provider (e.g., Anthropic or OpenAI "Coming soon").
- Confirm the model preset’s `adapterConfig.model` matches an existing `.gguf` in `$LLAMA_MODELS_DIR`.

## 7. Heartbeat behavior & debugging

### 7.1. Editor heartbeats

- The Editor heartbeat prompt instructs the agent to modify files directly under `data/` (e.g., `non-holomorphic-fractals.md`) and to append a structured ```memory``` block at the end of each run.
- Successful Editor heartbeat logs:
  - UI: status `completed`, context describing file edits.
  - Daemon: adapter path with `exitCode: 0` and non-empty output.

### 7.2. Common failure modes

1. **Daemon sees provider but no adapter**
   - Log: `Provider llama-local does not define a session launch contract`.
   - Cause: request fell into PTY path; adapterType not recognized or `adapter.supportsDetachedRuns` false.
   - Fix: ensure `adapterType: "llama_local"` and llama-local adapter is registered with `supportsDetachedRuns: true`.

2. **No model configured**
   - Daemon adapter output: `{ exitCode: 1, errorMessage: "No model configured. Set model in agent adapter config." }`.
   - Cause: `adapterConfig.model` missing for the session.
   - Fix: set model in agent provider settings or in the explicit `/sessions` body (curl tests).

3. **Wrong working directory / wrong org (Cows Colluding vs Ocho)**
   - UI shows Cows Colluding tree and demo agents.
   - Cause: `npx cabinetai run` started from `/Users/mikebird/.cabinet/app/v0.3.4` without `CABINET_DATA_DIR`.
   - Fix: start from `/Users/mikebird/cabinet` or export `CABINET_DATA_DIR`.

4. **llama-server path problems**
   - Logs show `llama_server_missing` in `testEnvironment` checks.
   - Fix: ensure `/opt/homebrew/bin/llama-server` exists or set `LLAMA_SERVER_BIN` env.

### 7.3. Manual heartbeat test pattern

When debugging any agent’s heartbeat:

1. Trigger a heartbeat from the UI.
2. Watch daemon logs for that session id (look for `createAdapterSession` lines).
3. If needed, replicate with curl using the same `providerId`, `adapterType`, and `adapterConfig` to isolate adapter vs UI issues.

## 8. Standard operating procedures (SOP)

### 8.1. Daily bring-up

1. Log into Jarvis MacBook as `mikebird` (local shell).
2. Start daemon:

   ```bash
   cd /Users/mikebird/.cabinet/app/v0.3.4
   export CABINET_DATA_DIR=/Users/mikebird/cabinet
   export CABINET_DAEMON_TOKEN=jarvis-fresh-token
   export NODE_ENV=production
   npx tsx server/cabinet-daemon.ts
   ```

3. In another terminal, start UI:

   ```bash
   cd /Users/mikebird/cabinet
   export CABINET_DATA_DIR=/Users/mikebird/cabinet
   npx cabinetai run
   ```

4. Open the browser to the UI port (per Cabinet docs). Ensure the workspace says **Ocho**, not Cows Colluding.

### 8.2. Verifying models

- Before long runs, verify the main GGUF files:

  ```bash
  ls -lh /Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/*.gguf
  ```

- If a model is missing, download or copy it into this directory; then add/update its preset in the provider settings.

### 8.3. Updating Cabinet

- Cabinet is installed under `/Users/mikebird/.cabinet/app/v0.3.4`. New versions will appear as new versioned subdirectories.
- When upgrading:
  - Keep `/Users/mikebird/cabinet` unchanged; it carries org data and personas.
  - Re-apply any local adapter patches (e.g., to llama-local) into the new version’s `src/lib/agents/adapters/` directory, or move to a forked repo if supported.

## 9. Known-good configurations snapshot (21Apr26)

- Daemon:
  - Port: 4100.
  - Default provider: `llama-local`.
  - DATA_DIR: `/Users/mikebird/cabinet`.
- llama-local adapter:
  - `supportsDetachedRuns: true`.
  - `LLAMA_SERVER_BIN` at `/opt/homebrew/bin/llama-server`.
  - `MODELS_DIR` default `/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference`.
- Working model:
  - `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` with `effort: "medium"`, `temperature: 0.3`.
- Editor agent:
  - Provider: Llama.cpp (Local GGUF).
  - Model preset: Qwen2.5.1 Coder 7B (Editor).
  - Heartbeats: green; edits `data/non-holomorphic-fractals.md` and writes memory blocks.

---

This document should be kept in `/Users/mikebird/cabinet` (e.g., `docs/Chilly_Cabinet_Standard_Reference.md`) and updated when models, paths, or Cabinet versions change.

# Chilly Cabinet Supplemental Reference — Thread 10 Handoff (21 Apr 26)

> **Purpose:** Append this to `Chilly_Cabinet_Standard_Reference.md`. It records everything determined
> in threads 9–10 that is NOT yet in the standard reference, so the next thread starts cold without
> re-deriving already-settled facts.

---

## S1. Confirmed available GGUF models

All files confirmed present under `/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/`:

| Filename | Assigned to |
|---|---|
| `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` | Editor ✅ (green heartbeats) |
| `Qwen3.5-4B-UD-Q4_K_XL.gguf` | CEO, Script Writer |
| `granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf` | QA |

> **Note:** The Qwen3.5 9B, Qwen3.5 2B, and other model tiles visible in the UI provider panel have
> NOT been verified as actually present on disk in this thread. Before assigning them to any agent,
> run `ls -lh /Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/*.gguf` to confirm.

---

## S2. Daemon token path — RESOLVED

The daemon writes its token to **two** paths depending on `cwd` at startup:

- If started from `/Users/mikebird/.cabinet/app/v0.3.4/`: token lands at  
  `/home/chilly1/.cabinet/app/v0.3.4/.agents/.runtime/daemon-token`
- If started from `/Users/mikebird/cabinet/`: token lands at  
  `/Users/mikebird/cabinet/.agents/.runtime/daemon-token`

Both tokens were confirmed readable in this thread:
```
23a66e299d207f89b8730af8def14855e6020cdbce4e2637459e6f8efc69c3d5  (v0.3.4-relative)
f598df0501eedbadfef606f6b887c834d040905334648de4f6d6a21929fd40da  (cabinet-relative)
```

**Root cause:** `DATA_DIR` in `path-utils.ts` resolves relative to `process.cwd()`, not a fixed path.
The daemon and Next.js resolve to different effective `DATA_DIR` values when started from different
directories.

**Fix (not yet applied):** Set `CABINET_DATA_DIR=/Users/mikebird/cabinet` explicitly in the shell or
`.env` **before** starting both services so both processes share the same `DATA_DIR` and therefore
the same token path.

---

## S3. Per-agent heartbeat status as of end of Thread 10

| Agent | Model | Heartbeat status | Notes |
|---|---|---|---|
| Editor | `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` | ✅ Green | Writes `data/non-holomorphic-fractals.md` + memory blocks |
| CEO | `Qwen3.5-4B-UD-Q4_K_XL.gguf` | ✅ Green (confirmed this thread) | `exitCode: 0`, non-empty output; created 3 missions |
| QA | `granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf` | ❌ Red — `exitCode: 1, outputLength: 0` | Triggered at end of thread; failure cause not yet diagnosed |
| Script Writer | `Qwen3.5-4B-UD-Q4_K_XL.gguf` | ❓ Not yet tested this thread | Was triggered in the for-loop but log not captured |
| Oversight Committee agents (Chair, Linguistic, Historical, Economic) | Unknown | ❓ Not tested | Provider/model mapping not verified |

---

## S4. CEO persona.md — duplicate model line fixed

The `persona.md` for CEO had a duplicate `model:` line. This was patched in-thread:

```bash
sed -i '0,/^model: Qwen3.5-4B-UD-Q4_K_XL.gguf/{n; /^model: Qwen3.5-4B-UD-Q4_K_XL.gguf/d}' \
  /Users/mikebird/cabinet/.agents/ceo/persona.md
```

Post-fix `grep "model:" /Users/mikebird/cabinet/.agents/ceo/persona.md` returns a single line:
```
model: Qwen3.5-4B-UD-Q4_K_XL.gguf
```

---

## S5. QA heartbeat failure — next diagnostic steps

QA fails with `exitCode: 1, outputLength: 0`. Pattern is identical to pre-fix CEO. Most likely causes
(in order of probability):

1. **Granite model file does not exist at the resolved path.**  
   Check: `ls /Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference/granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf`  
   If missing: reassign QA to a confirmed-present model (e.g., `Qwen3.5-4B-UD-Q4_K_XL.gguf`).

2. **`adapterConfig.model` is missing or undefined in the QA persona.**  
   Check: `head -15 /Users/mikebird/cabinet/.agents/qa/persona.md`  
   Look for a `model:` line. If absent, add it.

3. **Provider/adapter mismatch** — QA may be pointed at a non-llama-local provider.  
   Check: `grep -i "provider\|adapter" /Users/mikebird/cabinet/.agents/qa/persona.md`

4. **Duplicate model line** (same bug as CEO).  
   Check: `grep "model:" /Users/mikebird/cabinet/.agents/qa/persona.md`

---

## S6. Editor heartbeat — empty output bug (threads 9–10 work)

> **This was the primary investigation of thread 9. It is now RESOLVED.**

The editor persona heartbeat was completing with `exitCode: 0` but `outputLength: 0` for the full
heartbeat prompt. The investigation confirmed:

- Adapter wiring, daemon routing, `agentAdapterRegistry`, and `supportsDetachedRuns` are all correct.
- The empty output was caused by the large heartbeat prompt (persona body + memory + inbox + focus
  areas + goals + tasks) exceeding the default `effort: "medium"` context size of 8192 tokens.
- Fix applied: set `effort: "high"` (ctxSize = 32768) in the editor's adapter config.
- `buildHeartbeatContext` was also exported from `heartbeat.ts` so direct adapter tests are possible:
  ```ts
  export async function buildHeartbeatContext(slug: string, cabinetPath?: string): ...
  ```
- Test helper `server/cabinet-llama-heartbeat-test.ts` now exists and works correctly.

---

## S7. Manual heartbeat trigger pattern (confirmed working)

```bash
# Trigger any agent heartbeat via Next.js API (port 4000)
curl -s -X PUT http://localhost:4000/api/agents/personas/<agent-slug> \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"manual"}' | jq .

# Watch daemon log for the session:
# [daemon] createAdapterSession complete <session-id> llama-local llama_local
#   { exitCode: 0, outputLength: N, outputTail: '...' }
```

Healthy indicator: `exitCode: 0` AND `outputLength > 0`.  
Failure indicator: `exitCode: 1` OR `outputLength: 0`.

---

## S8. Corrected daemon startup (token path fix)

Until the `path-utils.ts` fix is applied, always start the daemon with an explicit env:

```bash
cd /Users/mikebird/.cabinet/app/v0.3.4
export CABINET_DATA_DIR=/Users/mikebird/cabinet
export CABINET_DAEMON_TOKEN=$(cat /Users/mikebird/cabinet/.agents/.runtime/daemon-token)
export LLAMA_MODELS_DIR=/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference
export LLAMA_SERVER_BIN=/opt/homebrew/bin/llama-server
export NODE_ENV=production
npx tsx server/cabinet-daemon.ts
```

Using the `cabinet`-relative token (not the `v0.3.4`-relative one) keeps daemon and Next.js in sync.

---

## S9. What the next thread should do first

1. **Diagnose QA**: `head -15 /Users/mikebird/cabinet/.agents/qa/persona.md` + check granite file exists.
2. **Verify Script Writer**: trigger heartbeat, check daemon log for exitCode/outputLength.
3. **Audit Oversight agents**: for each of Chair/Linguistic/Historical/Economic, confirm `model:` line
   and `provider:` point to a confirmed-present GGUF and `llama-local`.
4. **Do NOT re-verify**: adapter wiring, daemon import of `agentAdapterRegistry`, `adapterType` casing
   (`llama_local`), `supportsDetachedRuns`, or editor heartbeat — all confirmed good.

Addendum – 21Apr26 Chilly Cabinet Thread (Oversight Expansion & Heartbeat Behavior)
This addendum captures what was learned while adding the remaining Oversight Committee agents and stabilizing their heartbeats on Chilly’s llama‑local stack. It assumes the main standard is already in place (daemon on 4100, llama‑local adapter, GGUF via llama-server).

A. Daemon lifecycle, ports, and wrappers
Single owner for the daemon. Run either npx cabinetai run (which starts both the Next.js app on 4000 and the daemon on 4100) or npx tsx server/cabinet-daemon.ts directly, but not both at the same time. Competing processes can cause the daemon to start and then immediately shut down.

Port expectations. The app server always talks to the daemon on 4100. If the daemon starts on 4101 (or any other port), the UI will show the daemon as down or heartbeats as failing, even if the daemon itself is otherwise healthy. Fix by killing anything bound to 4100 and restarting the daemon so it binds to 4100.

Standard startup (recommended).

bash
cd /Users/mikebird/cabinet
export CABINET_DATA_DIR=/Users/mikebird/cabinet
npx cabinetai run
This wrapper takes care of starting the Next.js app on 4000 and the daemon on 4100 with the correct DATA_DIR.

B. Tokens, env, and data‑dir invariants
Token file. The daemon and UI must share the same token from
/Users/mikebird/cabinet/.agents/.runtime/daemon-token.
The daemon should receive this via CABINET_DAEMON_TOKEN, and all manual API calls should read from the same file.

Shared data directory. CABINET_DATA_DIR must be set to /Users/mikebird/cabinet for both the daemon and the app, so they see the same .agents/ tree, KB files, and runtime metadata.

Llama‑local env.

bash
export LLAMA_MODELS_DIR=/Volumes/SanDisk2TB/SanDisk2TB-Mac/models/llm/inference
export LLAMA_SERVER_BIN=/opt/homebrew/bin/llama-server
These must be set in the environment where the daemon runs; the llama‑local adapter expects them and was validated with the Qwen/Granite/Llama GGUFs listed there.

C. New Oversight personas (Ocho)
During this thread, the remaining Oversight roles were added under .agents/ using llama‑local and following the standard persona pattern. Each agent is oversight‑only: they read KB, flag issues, and route concrete work back to Editor/QA/Chair/Script rather than rewriting content.

New agents and their canonical slugs:

Chief Methodological Officer – chief-methodological-officer

Executive Insights Director – executive-insights-director

Strategic Intelligence Officer – strategic-intelligence-officer

Pattern Recognition Director – pattern-recognition-director

Data Visualization Inspector – data-visualization-inspector

Consumer Behavior Verification Officer – consumer-behavior-verification-officer

Technical Feasibility Director – technical-feasibility-director

Cross-Industry Intelligence Coordinator – cross-industry-intelligence-coordinator

Innovation Assessment Director – innovation-assessment-director

Strategic Motivation Analyst – strategic-motivation-analyst

Key persona conventions confirmed in this thread:

Each persona uses either persona.md with a single YAML frontmatter block or the split persona.yaml+body.md pattern, but never multiple frontmatter blocks.

model: must live in YAML frontmatter only (never in the body). There are no duplicate model: lines and no model: text in persona prose.

Default Oversight model is Qwen3.5-4B-UD-Q4_K_XL.gguf (llama‑local provider). Executive Insights Director may optionally use Qwen2.5-7B-Instruct-1M-Q4_K_M.gguf when longer context is needed and the model is confirmed on disk.

All new Oversight agents write to oversight-committee/kb/… paths appropriate to their role (e.g., methodology-flags.md, pattern-flags.md, visualization-flags.md, etc.), and always log short notes with explicit document references.

D. Heartbeat behavior and “red vs green” semantics
This thread clarified how to interpret heartbeat status in the UI versus daemon health.

Green heartbeat with no transcript.
A run can complete successfully (green) while showing “No transcript captured” for both transcript panes. This typically means:

The agent ran, found no inbox items or tasks, and returned a metadata‑only “no-op” result.

The system did not store token‑level output for that run.
This is not an error; the Result box will still show a normal summary such as “No actions were taken this heartbeat…” and the daemon logs will show exitCode: 0 with non‑empty output.

Red heartbeat with daemonFetch timeout after 180000ms.
This error string comes from the Next.js app, not the daemon. It means:

The frontend waited 180 000 ms (3 minutes) for the daemon’s HTTP response for that run.

The response didn’t arrive in time (e.g., model queued behind other agents), so the UI aborted the fetch and marked the run as failed.
The daemon and llama-local adapter can still be healthy; health checks will continue to return 200 and other runs (especially manual ones) may succeed immediately afterward.

Pill color reflects the latest run, not overall health.
An agent’s icon (green vs red) is based on its most recent heartbeat/job:

Manual heartbeat completes quickly → pill turns green.

Later scheduled heartbeat times out or fails → pill flips back to red, even if the previous run was fine.
When investigating a “red” agent, always open the latest run, check the Result message, and consult daemon logs for exitCode and outputLength rather than assuming a persistent failure.

Scheduled vs manual heartbeats.
With many agents on staggered cron schedules a single llama-local backend can occasionally get congested. In this thread, the daemon stayed healthy on 4100 while:

Manual Editor / Oversight heartbeats routinely completed successfully.

Some scheduled heartbeats (especially from newly added agents) timed out at the UI.
Mitigation levers:

Temporarily set non-critical Oversight personas to active: false during heavy debugging.

Or reduce their heartbeat frequency (for example, move some from every 4–6 hours to a nightly cron) to cut down on bursts.

E. Operational checklist for future threads
When anything about agent status looks odd, apply this fast path before touching adapter code or personas again:

Check the status panel.

App Server: Running

Daemon: Running

Llama.cpp (Local GGUF): Ready
If these are all green, the problem is almost always per‑run (timeout, persona) rather than infrastructure.

Confirm daemon port and data dir.

Startup log must say Cabinet Daemon running on port 4100.

DATA_DIR: /Users/mikebird/cabinet.

Run a single manual heartbeat on Editor.

Use the UI or:

bash
TOKEN=$(cat /Users/mikebird/cabinet/.agents/.runtime/daemon-token)
curl -s -X PUT http://localhost:4000/api/agents/personas/editor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"manual"}' | jq .
Check daemon logs: createAdapterSession … llama-local, exitCode: 0, outputLength > 0.
A clean Editor run means the pipeline is intact; focus any further debugging on the specific persona or on timeout behavior, not on global wiring.

Interpret red runs carefully.

If the Result shows daemonFetch timeout after 180000ms and health checks are green, treat as a transient timeout.

Only if the Result or daemon log shows a different error (e.g., “No model configured”, spawn error, parse error) should adapter code, env vars, or persona YAML be modified.


