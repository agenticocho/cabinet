import type { AgentProvider, ProviderStatus } from "../provider-interface";
import { execSync } from "child_process";

export const llamaLocalProvider: AgentProvider = {
  id: "llama-local",
  name: "Llama.cpp (Local GGUF)",
  type: "cli",
  icon: "cpu",
  installMessage:
    "Set LLAMA_SERVER_BIN to the llama-server binary path, e.g. /home/chilly1/llama.cpp/build/bin/llama-server",

  models: [
    { id: "Qwen3.5-4B-UD-Q4_K_XL.gguf",                          name: "Qwen3.5 4B (CEO/Script)" },
    { id: "Qwen2.5.1-Coder-7B-Instruct-Q5_K_M.gguf",              name: "Qwen2.5.1 Coder 7B (Editor)" },
    { id: "granite-3.3-2b-instruct-critical-thinking.Q5_K_M.gguf", name: "Granite 3.3 2B Critic (QA)" },
    { id: "Qwen3.5-9B-UD-Q4_K_XL.gguf",                          name: "Qwen3.5 9B (Editor alt)" },
    { id: "Qwen3.5-2B-UD-Q4_K_XL.gguf",                          name: "Qwen3.5 2B (Fast/Fallback)" },
    { id: "SmolLM3-3B-128K-UD-Q4_K_XL.gguf",                     name: "SmolLM3 3B 128K (Checker)" },
    { id: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",              name: "Llama 3.1 8B Instruct" },
    { id: "granite-8b-code-instruct.Q4_K_M.gguf",                name: "Granite 8B Code" },
    { id: "Qwen3-Coder-Next-UD-Q4_K_XL.gguf",                    name: "Qwen3 Coder Next 41B (CPU-offload)" },
  ],
  effortLevels: [
    { id: "low",    name: "Low",    description: "Fast, minimal context" },
    { id: "medium", name: "Medium", description: "Balanced" },
    { id: "high",   name: "High",   description: "Full context, slow" },
  ],
  async isAvailable(): Promise<boolean> {
    try {
      const bin = process.env.LLAMA_SERVER_BIN ?? "llama-server";
      execSync(`which "${bin}" 2>/dev/null || test -f "${bin}"`, { stdio: "ignore" });
      return true;
    } catch { return false; }
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const bin = process.env.LLAMA_SERVER_BIN ?? "llama-server";
      execSync(`which "${bin}" 2>/dev/null || test -f "${bin}"`, { stdio: "ignore" });
      return { available: true, authenticated: true };
    } catch {
      return { available: false, authenticated: false, error: "llama-server not found. Set LLAMA_SERVER_BIN in .env.local" };
    }
  },
};
