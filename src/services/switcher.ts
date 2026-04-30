import { TOOL_ASSIGNMENTS } from "../data/mockData";
import { safeInvoke } from "./tauri";
import type {
  ApplySwitchPayload,
  BackupListPayload,
  CommandResponse,
  DiscoveredIntegration,
  IntegrationDiscoveryPayload,
  RevertPayload,
  SwitchPlanPayload,
  ToolAssignment,
} from "../types/domain";

function mapAssignmentToDiscovery(assignment: ToolAssignment): DiscoveredIntegration {
  return {
    id: assignment.id,
    tool: assignment.tool,
    configPath: assignment.configPath,
    status: assignment.status,
    providerLabel: assignment.provider,
    assignedModelLabel: assignment.assignedModel,
    repairHint: assignment.repairHint,
    pathExists: assignment.status !== "missing",
    pathReadable: assignment.status !== "missing",
    pathWritable: assignment.status === "connected",
    discoveryMethod: "mock baseline",
    parserState: "inferred",
    parserNote: "Mock preview data only.",
  };
}

function buildMockResponse(): CommandResponse<IntegrationDiscoveryPayload> {
  return {
    data: {
      integrations: TOOL_ASSIGNMENTS.map(mapAssignmentToDiscovery),
    },
    warnings: [
      {
        code: "browser-preview",
        level: "info",
        message: "Preview mode is using mock integration data because Tauri is not active in the browser dev server.",
      },
    ],
    meta: {
      area: "integrations",
      source: "mock",
      generatedAtEpochMs: Date.now(),
    },
  };
}

export async function listAssignments(): Promise<CommandResponse<IntegrationDiscoveryPayload>> {
  const response = await safeInvoke<CommandResponse<IntegrationDiscoveryPayload>>("discover_supported_integrations");

  if (response) {
    const baseMap = new Map(TOOL_ASSIGNMENTS.map((assignment) => [assignment.id, mapAssignmentToDiscovery(assignment)]));

    for (const discovered of response.data.integrations) {
      baseMap.set(discovered.id, discovered);
    }

    return {
      ...response,
      data: {
        integrations: Array.from(baseMap.values()),
      },
    };
  }

  return buildMockResponse();
}

export async function previewSwitchPlan(
  toolId: string,
  proposedProvider: string,
  proposedModel: string,
): Promise<CommandResponse<SwitchPlanPayload> | null> {
  return safeInvoke<CommandResponse<SwitchPlanPayload>>("preview_switch_plan", {
    toolId,
    proposedProvider,
    proposedModel,
  });
}

export async function listBackups(): Promise<CommandResponse<BackupListPayload> | null> {
  return safeInvoke<CommandResponse<BackupListPayload>>("list_backups");
}

export async function revertFromBackup(backupPath: string): Promise<CommandResponse<RevertPayload> | null> {
  return safeInvoke<CommandResponse<RevertPayload>>("revert_from_backup", { backupPath });
}

export async function applySwitch(
  toolId: string,
  proposedProvider: string,
  proposedModel: string,
): Promise<CommandResponse<ApplySwitchPayload> | null> {
  return safeInvoke<CommandResponse<ApplySwitchPayload>>("apply_switch_plan", {
    toolId,
    proposedProvider,
    proposedModel,
  });
}
