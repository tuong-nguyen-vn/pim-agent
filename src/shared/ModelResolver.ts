import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export type ResolvedProvider = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly providerName: string;
};

type ProviderEntry = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly models?: ReadonlyArray<{ readonly id: string }>;
};

type ModelsConfig = {
  readonly providers?: Readonly<Record<string, ProviderEntry>>;
};

export class ModelResolver {
  public static async resolveProvider(
    modelId: string
  ): Promise<ResolvedProvider | undefined> {
    const config = await ModelResolver.loadModelsConfig();
    if (!config?.providers) {
      return undefined;
    }
    for (const [name, provider] of Object.entries(config.providers)) {
      if (provider.models?.some((m) => m.id === modelId)) {
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          providerName: name,
        };
      }
    }
    return undefined;
  }

  public static async modelExists(modelId: string): Promise<boolean> {
    return (await ModelResolver.resolveProvider(modelId)) !== undefined;
  }

  private static async loadModelsConfig(): Promise<ModelsConfig | undefined> {
    try {
      const path = join(getAgentDir(), "models.json");
      return (await Bun.file(path).json()) as ModelsConfig;
    } catch {
      return undefined;
    }
  }
}
