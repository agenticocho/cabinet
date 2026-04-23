# Chilly + Cabinet Standard Reference (21Apr26)

## 1. High-level architecture

- **Host**: Chilly (Ubuntu server, user `chilly1`).
- **Org**: Ocho (Cabinet workspace for non-holomorphic fractals + Oversight Committee).
- **Core components**:
  - Next.js Cabinet UI.
  - Cabinet daemon (Node/TypeScript) on port 4100.
  - `llama.cpp` `llama-server` for local GGUF inference on RTX 3060 Ti.
  - Data directory at `/home/chilly1/cabinet` (agents, KB, jobs, research).

## 2. Key paths & directories

### 2.1. Data dir (Ocho workspace)

- **Root**: `/home/chilly1/cabinet`.
- Purpose: Holds agents, KB artifacts, jobs, and any files Cabinet agents read/write.
- Important subdirs:
  - `data/`  – KB and research artifacts (e.g., `non-holomorphic-fractals.md`).
  - `data/chilly-containment/` – curated tree for heavy symlinks, used to avoid slow scans.
  - `.agents/` – persona definitions (`persona.md` per agent), schedules, and jobs.
  - `.jobs/` – scheduled job definitions (`.yaml`).

### 2.2. App install dir (Cabinet binaries + UI source)

- **Root**: `~/.cabinet/app/v0.3.4`.
- Purpose: Versioned Cabinet application code (do NOT store user data here).
- Important paths:
  - `server/cabinet-daemon.ts` – unified daemon (PTY + adapter sessions + scheduler).
  - `src/lib/agents/adapters/llama-local.ts` – llama-local adapter implementation.
  - `heartbeat.ts` – heartbeat job wiring.

### 2.3. Local models & llama.cpp

- **Models directory** (as seen by adapter):
  - `MODELS_DIR = process.env.LLAMA_MODELS_DIR ?? "/home/chilly1/moltbook_pipeline/models"`.
- Known GGUFs used:
  - `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` – Editor / coder model.
  - Others (Qwen3.5 4B, Granite variants) live under the same directory.
- `llama.cpp` build:
  - Binary: `/home/chilly1/llama.cpp/build/bin/llama-server`.

## 3. Environment variables

Set these **before** starting the daemon and UI.

```bash
export CABINET_DATA_DIR=/home/chilly1/cabinet
export CABINET_DAEMON_TOKEN=$(cat /home/chilly1/.cabinet/app/v0.3.4/daemon-token 2>/dev/null || echo "chilly-fresh-token")
export NODE_ENV=production
# Optional: explicit model dir and llama-server path
export LLAMA_MODELS_DIR=/home/chilly1/moltbook_pipeline/models
export LLAMA_SERVER_BIN=/home/chilly1/llama.cpp/build/bin/llama-server
```

Notes:
- `CABINET_DATA_DIR` must point at the Ocho data dir; otherwise you fall back to the Cows Colluding demo org.
- `CABINET_DAEMON_TOKEN` must match what the UI and curl tests send as `Authorization: Bearer ...`.

## 4. Starting & stopping services

### 4.1. Start the daemon (port 4100)

```bash
cd ~/.cabinet/app/v0.3.4
export CABINET_DATA_DIR=/home/chilly1/cabinet
export CABINET_DAEMON_TOKEN=chilly-fresh-token
export NODE_ENV=production
npx tsx server/cabinet-daemon.ts
```

Expected log tail:

- `Initializing Cabinet database...`
- `Database ready.`
- `Cabinet Daemon running on port 4100`
- `DATA_DIR: /home/chilly1/cabinet`
- `Default provider: llama-local`
- `Discovered 1 cabinet(s). Scheduled 0 jobs and 8 heartbeats.`

### 4.2. Start the UI (bound to Ocho, not demo)

Preferred: run from the **data dir** so the org is Ocho.

```bash
cd /home/chilly1/cabinet
export CABINET_DATA_DIR=/home/chilly1/cabinet
npx cabinetai run
```

If you run from `~/.cabinet/app/v0.3.4` without `CABINET_DATA_DIR`, the UI opens the **Cows Colluding** demo workspace. Always set `CABINET_DATA_DIR` or start from `/home/chilly1/cabinet` to get Ocho.

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
    "cwd": "/home/chilly1/cabinet"
  }'
```

Expected daemon log snippet for a healthy adapter path:

```text
[daemon] adapter lookup { providerId: 'llama-local', adapterType: 'llama_local', hasAdapter: true, ... }
[daemon] POST /sessions using adapter path session-... llama-local llama_local
[daemon] createAdapterSession session-... llama-local llama_local
LLAMA_SERVER_BIN live /home/chilly1/llama.cpp/build/bin/llama-server
serverBin resolved to /home/chilly1/llama.cpp/build/bin/llama-server
llama-local cwd /home/chilly1/cabinet
[daemon] createAdapterSession complete session-... llama-local llama_local {
  exitCode: 0,
  outputLength: 145,
  outputTail: '...Hello! How can I assist you today?'
}
```

## 5. Providers, models, and adapters

### 5.1. Llama-local adapter

Source: `~/.cabinet/app/v0.3.4/src/lib/agents/adapters/llama-local.ts`.

Key behavior:

- Adapter type: `"llama_local"`.
- Provider id: `"llama-local"`.
- Execution engine: launches `llama-server` as a child process, then calls `/v1/chat/completions` on port `8421`.
- Resolves model via:

  ```ts
  const MODELS_DIR = process.env.LLAMA_MODELS_DIR ?? "/home/chilly1/moltbook_pipeline/models";

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

- Org: **Ocho**.
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
   - Cause: `npx cabinetai run` started from `~/.cabinet/app/v0.3.4` without `CABINET_DATA_DIR`.
   - Fix: start from `/home/chilly1/cabinet` or export `CABINET_DATA_DIR`.

4. **llama-server path problems**
   - Logs show `llama_server_missing` in `testEnvironment` checks.
   - Fix: ensure `/home/chilly1/llama.cpp/build/bin/llama-server` exists or set `LLAMA_SERVER_BIN` env.

### 7.3. Manual heartbeat test pattern

When debugging any agent’s heartbeat:

1. Trigger a heartbeat from the UI.
2. Watch daemon logs for that session id (look for `createAdapterSession` lines).
3. If needed, replicate with curl using the same `providerId`, `adapterType`, and `adapterConfig` to isolate adapter vs UI issues.

## 8. Standard operating procedures (SOP)

### 8.1. Daily bring-up

1. SSH into Chilly as `chilly1`.
2. Start daemon:

   ```bash
   cd ~/.cabinet/app/v0.3.4
   export CABINET_DATA_DIR=/home/chilly1/cabinet
   export CABINET_DAEMON_TOKEN=chilly-fresh-token
   export NODE_ENV=production
   npx tsx server/cabinet-daemon.ts
   ```

3. In another terminal, start UI:

   ```bash
   cd /home/chilly1/cabinet
   export CABINET_DATA_DIR=/home/chilly1/cabinet
   npx cabinetai run
   ```

4. Open the browser to the UI port (per Cabinet docs). Ensure the workspace says **Ocho**, not Cows Colluding.

### 8.2. Verifying models

- Before long runs, verify the main GGUF files:

  ```bash
  ls -lh /home/chilly1/moltbook_pipeline/models/*.gguf
  ```

- If a model is missing, download or copy it into this directory; then add/update its preset in the provider settings.

### 8.3. Updating Cabinet

- Cabinet is installed under `~/.cabinet/app/v0.3.4`. New versions will appear as new versioned subdirectories.
- When upgrading:
  - Keep `/home/chilly1/cabinet` unchanged; it carries org data and personas.
  - Re-apply any local adapter patches (e.g., to llama-local) into the new version’s `src/lib/agents/adapters/` directory, or move to a forked repo if supported.

## 9. Known-good configurations snapshot (21Apr26)

- Daemon:
  - Port: 4100.
  - Default provider: `llama-local`.
  - DATA_DIR: `/home/chilly1/cabinet`.
- llama-local adapter:
  - `supportsDetachedRuns: true`.
  - `LLAMA_SERVER_BIN` at `/home/chilly1/llama.cpp/build/bin/llama-server`.
  - `MODELS_DIR` default `/home/chilly1/moltbook_pipeline/models`.
- Working model:
  - `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` with `effort: "medium"`, `temperature: 0.3`.
- Editor agent:
  - Provider: Llama.cpp (Local GGUF).
  - Model preset: Qwen2.5.1 Coder 7B (Editor).
  - Heartbeats: green; edits `data/non-holomorphic-fractals.md` and writes memory blocks.

---

This document should be kept in `/home/chilly1/cabinet` (e.g., `docs/Chilly_Cabinet_Standard_Reference.md`) and updated when models, paths, or Cabinet versions change.

# Chilly Cabinet Supplemental Reference — Thread 10 Handoff (21 Apr 26)

> **Purpose:** Append this to `Chilly_Cabinet_Standard_Reference.md`. It records everything determined
> in threads 9–10 that is NOT yet in the standard reference, so the next thread starts cold without
> re-deriving already-settled facts.

---

## S1. Confirmed available GGUF models

All files confirmed present under `/home/chilly1/moltbook_pipeline/models/`:

| Filename | Assigned to |
|---|---|
| `Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf` | Editor ✅ (green heartbeats) |
| `Qwen3.5-4B-UD-Q4_K_XL.gguf` | CEO, Script Writer |
| `granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf` | QA |

> **Note:** The Qwen3.5 9B, Qwen3.5 2B, and other model tiles visible in the UI provider panel have
> NOT been verified as actually present on disk in this thread. Before assigning them to any agent,
> run `ls -lh /home/chilly1/moltbook_pipeline/models/*.gguf` to confirm.

---

## S2. Daemon token path — RESOLVED

The daemon writes its token to **two** paths depending on `cwd` at startup:

- If started from `~/.cabinet/app/v0.3.4/`: token lands at  
  `/home/chilly1/.cabinet/app/v0.3.4/.agents/.runtime/daemon-token`
- If started from `/home/chilly1/cabinet/`: token lands at  
  `/home/chilly1/cabinet/.agents/.runtime/daemon-token`

Both tokens were confirmed readable in this thread:
```
23a66e299d207f89b8730af8def14855e6020cdbce4e2637459e6f8efc69c3d5  (v0.3.4-relative)
f598df0501eedbadfef606f6b887c834d040905334648de4f6d6a21929fd40da  (cabinet-relative)
```

**Root cause:** `DATA_DIR` in `path-utils.ts` resolves relative to `process.cwd()`, not a fixed path.
The daemon and Next.js resolve to different effective `DATA_DIR` values when started from different
directories.

**Fix (not yet applied):** Set `CABINET_DATA_DIR=/home/chilly1/cabinet` explicitly in the shell or
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
  /home/chilly1/cabinet/.agents/ceo/persona.md
```

Post-fix `grep "model:" /home/chilly1/cabinet/.agents/ceo/persona.md` returns a single line:
```
model: Qwen3.5-4B-UD-Q4_K_XL.gguf
```

---

## S5. QA heartbeat failure — next diagnostic steps

QA fails with `exitCode: 1, outputLength: 0`. Pattern is identical to pre-fix CEO. Most likely causes
(in order of probability):

1. **Granite model file does not exist at the resolved path.**  
   Check: `ls /home/chilly1/moltbook_pipeline/models/granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf`  
   If missing: reassign QA to a confirmed-present model (e.g., `Qwen3.5-4B-UD-Q4_K_XL.gguf`).

2. **`adapterConfig.model` is missing or undefined in the QA persona.**  
   Check: `head -15 /home/chilly1/cabinet/.agents/qa/persona.md`  
   Look for a `model:` line. If absent, add it.

3. **Provider/adapter mismatch** — QA may be pointed at a non-llama-local provider.  
   Check: `grep -i "provider\|adapter" /home/chilly1/cabinet/.agents/qa/persona.md`

4. **Duplicate model line** (same bug as CEO).  
   Check: `grep "model:" /home/chilly1/cabinet/.agents/qa/persona.md`

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
cd ~/.cabinet/app/v0.3.4
export CABINET_DATA_DIR=/home/chilly1/cabinet
export CABINET_DAEMON_TOKEN=$(cat /home/chilly1/cabinet/.agents/.runtime/daemon-token)
export LLAMA_MODELS_DIR=/home/chilly1/moltbook_pipeline/models
export LLAMA_SERVER_BIN=/home/chilly1/llama.cpp/build/bin/llama-server
export NODE_ENV=production
npx tsx server/cabinet-daemon.ts
```

Using the `cabinet`-relative token (not the `v0.3.4`-relative one) keeps daemon and Next.js in sync.

---

## S9. What the next thread should do first

1. **Diagnose QA**: `head -15 /home/chilly1/cabinet/.agents/qa/persona.md` + check granite file exists.
2. **Verify Script Writer**: trigger heartbeat, check daemon log for exitCode/outputLength.
3. **Audit Oversight agents**: for each of Chair/Linguistic/Historical/Economic, confirm `model:` line
   and `provider:` point to a confirmed-present GGUF and `llama-local`.
4. **Do NOT re-verify**: adapter wiring, daemon import of `agentAdapterRegistry`, `adapterType` casing
   (`llama_local`), `supportsDetachedRuns`, or editor heartbeat — all confirmed good.
