import { spawn } from "child_process";
import { execSync } from "child_process";
import type {
  AgentExecutionAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "./types";

const LLAMA_PORT = Number(process.env.LLAMA_PORT ?? "8080");
const READY_TIMEOUT_MS = 45_000;
const MODELS_DIR =
  process.env.LLAMA_MODELS_DIR ?? "/Users/mikebird/models/llminference";

function serverBin(): string {
  // You’re already exporting this in cabinet.env
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
    const binPath = serverBin();
    const checks: Array<{ code: string; level: "error" | "warn"; message: string; hint: string }> = [];
    let status: "pass" | "fail" = "pass";
    try {
      execSync(`which "${binPath}" 2>/dev/null || test -f "${binPath}"`, { stdio: "ignore" });
    } catch {
      status = "fail";
      checks.push({
        code: "llama_server_missing",
        level: "error",
        message: `${binPath} not found`,
        hint: "Verify /home/chilly1/llama.cpp/build/bin/llama-server exists",
      });
    }
    return { adapterType: "llama_local", status, checks, testedAt: new Date().toISOString() };
  },

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const bin = serverBin();
    console.log("LLAMA_SERVER_BIN live", process.env.LLAMA_SERVER_BIN);
    console.log("serverBin resolved to", bin);
    console.log("llama-local cwd", ctx.cwd);
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
      (ctx.config["systemPrompt"] as string) ||
      [
        "You are the Editor agent running a heartbeat inside Cabinet.",
        "Follow ALL instructions carefully.",
        "",
        "At the END of your response, you MUST append a fenced memory block exactly",
        "in this format:",
        "",
        "```memory",
        "CONTEXT_UPDATE: One paragraph summarizing what you did this heartbeat and key observations.",
        "DECISION: (optional) Any key decision made, with reasoning. Write 'DECISION: none' if none.",
        "LEARNING: (optional) Any new insight to remember long-term. Write 'LEARNING: none' if none.",
        "GOAL_UPDATE [metric_name]: +N (optional goal updates, one per line or 'GOAL_UPDATE: none').",
        "MESSAGE_TO [agent-slug]: (optional) One line message to another agent, or 'MESSAGE_TO: none'.",
        "SLACK [channel-name]: (optional) One line update for Slack, or 'SLACK: none'.",
        "TASK_CREATE [agent-slug] [priority 1-5]: title | description (optional), or none.",
        "TASK_COMPLETE [task-id]: result summary (optional), or none.",
        "```",
        "",
        "Do NOT put backticks inside that block. Do NOT change the word 'memory'.",
        "Make sure 'CONTEXT_UPDATE:' appears exactly once on its own line inside the block."
      ].join("\n");

    const serverArgs = [
      "--model", modelPath,
      "--port", String(LLAMA_PORT),
      "--ctx-size", String(ctxSize),
      "--no-mmap",
      "--log-disable",
    ];

    await ctx.onMeta?.({ adapterType: ctx.adapterType, command: bin, commandArgs: serverArgs, cwd: ctx.cwd });

    let output = "";
    let timedOut = false;

    try {
      await waitReady(LLAMA_PORT, READY_TIMEOUT_MS);

      const resp = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          stream: false,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: ctx.prompt },
          ],
        }),
        signal: ctx.timeoutMs ? AbortSignal.timeout(ctx.timeoutMs) : undefined,
      });

      const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      output = json?.choices?.[0]?.message?.content ?? "";
      if (output) await ctx.onLog("stdout", output);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      timedOut = msg.includes("TimeoutError") || msg.includes("aborted");
      await ctx.onLog("stderr", `llama-local: ${msg}`);
      return { exitCode: 1, signal: null, timedOut, errorMessage: msg, output: output || null };
    } finally {
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
