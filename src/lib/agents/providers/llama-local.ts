import { execSync } from "child_process";
import type { AgentProvider, ProviderStatus } from "../provider-interface";

const LLAMA_DEFAULT_MODEL =
  process.env.LLAMA_DEFAULT_MODEL ?? "Qwen3.5-4B-UD-Q4_K_XL.gguf";

const LLAMA_SERVER_URL =
  process.env.LLAMA_SERVER_URL ?? "http://127.0.0.1:8080";

export const llamaLocalProvider: AgentProvider = {
  id: "llama-local",
  name: "Llama.cpp Local GGUF",
  type: "local",
  icon: "cpu",

  installMessage:
    "llama.cpp local provider not detected. Start llama-server and set LLAMA_SERVER_BIN if needed.",

  installSteps: [
    {
      title: "Install llama.cpp",
      detail: "Install or build llama.cpp with llama-server available.",
      command: "brew install llama.cpp",
    },
    {
      title: "Start llama-server",
      detail: "Launch llama-server with your GGUF model.",
      command:
        "llama-server -m ~/models/Qwen3.5-4B-UD-Q4_K_XL.gguf --port 8080 -ngl 99 --ctx-size 8192",
    },
    {
      title: "Verify health",
      detail: "Confirm the local inference server is responding.",
      command: "curl http://127.0.0.1:8080/health",
    },
  ],

  models: [
    {
      id: LLAMA_DEFAULT_MODEL,
      name: LLAMA_DEFAULT_MODEL,
      description: "Local GGUF model served through llama-server",
      effortLevels: [
        { id: "low", name: "Low", description: "Smaller context / lighter run" },
        { id: "medium", name: "Medium", description: "Balanced context" },
        { id: "high", name: "High", description: "Larger context / deeper run" },
      ],
    },
  ],

  detachedPromptLaunchMode: "session",
  effortLevels: [
    { id: "low", name: "Low", description: "Smaller context / lighter run" },
    { id: "medium", name: "Medium", description: "Balanced context" },
    { id: "high", name: "High", description: "Larger context / deeper run" },
  ],

  async isAvailable(): Promise<boolean> {
    try {
      execSync(`curl -fsS ${LLAMA_SERVER_URL}/health >/dev/null`, {
        stdio: "ignore",
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return {
          available: false,
          authenticated: false,
          error: `llama-server not reachable at ${LLAMA_SERVER_URL}`,
        };
      }

      return {
        available: true,
        authenticated: true,
        version: `Connected to ${LLAMA_SERVER_URL}`,
      };
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};