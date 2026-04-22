import type { AgentProvider, ProviderRegistry } from "../provider-interface";
import { claudeCodeProvider } from "./providers/claude-code";
import { codexCliProvider } from "./providers/codex-cli";
import { geminiCliProvider } from "./providers/gemini-cli";
import { llamaLocalProvider } from "./providers/llama-local";

class ProviderRegistryImpl implements ProviderRegistry {
  providers = new Map<string, AgentProvider>();
  defaultProvider = "llama-local";

  register(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AgentProvider | undefined {
    return this.providers.get(id);
  }

  getDefault(): AgentProvider | undefined {
    return this.providers.get(this.defaultProvider);
  }

  listAll(): AgentProvider[] {
    return Array.from(this.providers.values());
  }

  async listAvailable(): Promise<AgentProvider[]> {
    const results: AgentProvider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        results.push(provider);
      }
    }
    return results;
  }
}

export const providerRegistry = new ProviderRegistryImpl();

providerRegistry.register(claudeCodeProvider);
providerRegistry.register(codexCliProvider);
providerRegistry.register(geminiCliProvider);
providerRegistry.register(llamaLocalProvider);