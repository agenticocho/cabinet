import { spawn } from "child_process";
import { execSync } from "child_process";
import type {
  AgentExecutionAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "./types";

const LLAMA_PORT = 8421;
const READY_TIMEOUT_MS = 45_000;
const MODELS_DIR =
  process.env.LLAMA_MODELS_DIR ?? "/home/chilly1/moltbook_pipeline/models";

function serverBin(): string {
  return process.env.LLAMA_SERVER_BIN ?? "llama-server";
}

function resolveModel(config: Record<string, unknown>): string | null {
  const m = config["model"];
  if (typeof m !== "string" || !m.trim()) return null;
  const p = m.trim();
  return p.startsWith("/") ? p : `${MODELS_DIR}/${p}`;
}

async function waitReady(port: number, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`llama-server not ready after ${ms}ms`);
}

export const llamaLocalAdapter: AgentExecutionAdapter = {
  type: "llama_local",
  name: "Llama.cpp Local",
  description:
    "Local GGUF inference via llama-server. Configure model per agent. One model at a time on GPU.",
  providerId: "llama-local",
  executionEngine: "process",
  experimental: false,
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: [],

  async testEnvironment() {
    const bin = serverBin();
    const checks: Array<{ code: string; level: "error" | "warn"; message: string; hint: string }> = [];
    let status: "pass" | "fail" = "pass";
    try {
      execSync(`which "${bin}" 2>/dev/null || test -f "${bin}"`, { stdio: "ignore" });
    } catch {
      status = "fail";
      checks.push({
        code: "llama_server_missing",
        level: "error",
        message: `${bin} not found`,
        hint: "Set LLAMA_SERVER_BIN in ~/chilly_containment/cabinet_src/.env.local",
      });
    }
    return { adapterType: "llama_local", status, checks, testedAt: new Date().toISOString() };
  },

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const bin = serverBin();
    const modelPath = resolveModel(ctx.config as Record<string, unknown>);

    if (!modelPath) {
      return {
        exitCode: 1, signal: null, timedOut: false,
        errorMessage: "No model configured. Set model in agent adapter config.",
      };
    }

    const effortCtxMap: Record<string, number> = { low: 2048, medium: 8192, high: 32768 };
    const rawEffort = (ctx.config as Record<string, unknown>)["effort"];
    const effortKey = typeof rawEffort === "string" ? rawEffort : "medium";
    const ctxSize = effortCtxMap[effortKey] ?? 8192;
    const temperature =
      typeof (ctx.config as Record<string, unknown>)["temperature"] === "number"
        ? (ctx.config as Record<string, unknown>)["temperature"] as number
        : 0.3;
    const systemPrompt =
      typeof (ctx.config as Record<string, unknown>)["systemPrompt"] === "string"
        ? (ctx.config as Record<string, unknown>)["systemPrompt"] as string
        : "You are Ocho, a precise research agent for the Non-Holomorphic Fractal Series.";

    const serverArgs = [
      "--model", modelPath,
      "--port", String(LLAMA_PORT),
      "--ctx-size", String(ctxSize),
      "--no-mmap",
      "--log-disable",
    ];

    await ctx.onMeta?.({ adapterType: ctx.adapterType, command: bin, commandArgs: serverArgs, cwd: ctx.cwd });

    const proc = spawn(bin, serverArgs, { cwd: ctx.cwd, detached: false, stdio: ["ignore", "pipe", "pipe"] });
    ctx.onSpawn?.({ pid: proc.pid!, processGroupId: null, startedAt: new Date().toISOString() });
    proc.stderr?.on("data", (d: Buffer) => { void ctx.onLog("stderr", d.toString()); });

    let output = "";
    let timedOut = false;

    try {
      await waitReady(LLAMA_PORT, READY_TIMEOUT_MS);

      const resp = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          stream: true,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: ctx.prompt },
          ],
        }),
        signal: ctx.timeoutMs ? AbortSignal.timeout(ctx.timeoutMs) : undefined,
      });

      if (!resp.body) throw new Error("No response body from llama-server");

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content;
            if (delta) { output += delta; await ctx.onLog("stdout", delta); }
          } catch {}
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      timedOut = msg.includes("TimeoutError") || msg.includes("aborted");
      await ctx.onLog("stderr", `llama-local: ${msg}`);
      proc.kill("SIGTERM");
      return { exitCode: 1, signal: null, timedOut, errorMessage: msg, output: output || null };
    } finally {
      proc.kill("SIGTERM");
    }

    return {
      exitCode: 0, signal: null, timedOut: false,
      provider: "llama-local",
      model: modelPath.split("/").pop() ?? "local",
      billingType: "unknown",
      output,
      summary: output.slice(0, 300) || null,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  },
};
