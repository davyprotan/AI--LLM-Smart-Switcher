import { MODELS } from "../data/mockData";
import { safeInvoke } from "./tauri";
import type { CommandResponse, ModelCatalogPayload } from "../types/domain";

export async function listModels(): Promise<CommandResponse<ModelCatalogPayload>> {
  const result = await safeInvoke<CommandResponse<ModelCatalogPayload>>("list_available_models");

  if (result) {
    return result;
  }

  // Browser / dev fallback
  return {
    data: {
      ollamaAvailable: false,
      models: MODELS.map((m) => ({
        ...m,
        provider: m.provider as string,
        warning: m.warning ?? null,
      })),
    },
    warnings: [
      {
        code: "mock-mode",
        level: "info" as const,
        message: "Running in browser preview — model list is mocked.",
      },
    ],
    meta: { area: "models", source: "mock", generatedAtEpochMs: Date.now() },
  };
}
