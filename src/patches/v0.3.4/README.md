# Cabinet v0.3.4 Patches — Ocho / Chilly

Applied to: `~/.cabinet/app/v0.3.4/`

## Files patched

| File | What changed |
|------|-------------|
| `src/lib/agents/heartbeat.ts` | Export `buildHeartbeatContext`; pass `adapterType: "llama_local"` |
| `server/cabinet-daemon.ts` | Prefer `agentAdapterRegistry.get()` over PTY fallback in POST /sessions |
| `src/lib/agents/adapters/llama-local.ts` | Wire `onLog` handler; fix model resolution from persona config |

## Apply patches

```bash
cp src/patches/v0.3.4/src/lib/agents/heartbeat.ts \
   ~/.cabinet/app/v0.3.4/src/lib/agents/
cp src/patches/v0.3.4/server/cabinet-daemon.ts \
   ~/.cabinet/app/v0.3.4/server/
cp src/patches/v0.3.4/src/lib/agents/adapters/llama-local.ts \
   ~/.cabinet/app/v0.3.4/src/lib/agents/adapters/
# Then restart the daemon
```
