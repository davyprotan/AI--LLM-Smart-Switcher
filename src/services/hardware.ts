import { HARDWARE_GAUGES, HARDWARE_PROFILE, RECOMMENDATION_TIERS } from "../data/mockData";
import { safeInvoke } from "./tauri";
import type { CommandResponse, HardwareScanPayload } from "../types/domain";

function buildMockResponse(): CommandResponse<HardwareScanPayload> {
  return {
    data: {
      profile: HARDWARE_PROFILE,
      gauges: HARDWARE_GAUGES,
      recommendations: RECOMMENDATION_TIERS,
    },
    warnings: [
      {
        code: "browser-preview",
        level: "info",
        message: "Preview mode is using mock hardware data because Tauri is not active in the browser dev server.",
      },
    ],
    meta: {
      area: "system",
      source: "mock",
      generatedAtEpochMs: Date.now(),
    },
  };
}

export async function scanHardware(): Promise<CommandResponse<HardwareScanPayload>> {
  const response = await safeInvoke<CommandResponse<HardwareScanPayload>>("get_system_summary");

  if (response) {
    return response;
  }

  return buildMockResponse();
}
