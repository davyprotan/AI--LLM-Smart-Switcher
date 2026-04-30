import { safeInvoke } from "./tauri";
import type { CommandResponse, SnapshotDiffPayload, SnapshotStorePayload } from "../types/domain";

function buildMockResponse(): CommandResponse<SnapshotStorePayload> {
  return {
    data: {
      baseline: null,
    },
    warnings: [
      {
        code: "browser-preview",
        level: "info",
        message: "Preview mode cannot persist a real baseline snapshot because Tauri is not active in the browser dev server.",
      },
    ],
    meta: {
      area: "snapshots",
      source: "mock",
      generatedAtEpochMs: Date.now(),
    },
  };
}

export async function listSnapshots(): Promise<CommandResponse<SnapshotStorePayload>> {
  const response = await safeInvoke<CommandResponse<SnapshotStorePayload>>("list_snapshots");

  return response ?? buildMockResponse();
}

export async function captureBaselineSnapshot(): Promise<CommandResponse<SnapshotStorePayload>> {
  const response = await safeInvoke<CommandResponse<SnapshotStorePayload>>("capture_baseline_snapshot");

  return response ?? buildMockResponse();
}

export async function listSnapshotDiff(): Promise<CommandResponse<SnapshotDiffPayload>> {
  const response = await safeInvoke<CommandResponse<SnapshotDiffPayload>>("list_snapshot_diff");

  return (
    response ?? {
      data: {
        baselineId: null,
        entries: [],
      },
      warnings: [
        {
          code: "browser-preview",
          level: "info",
          message: "Preview mode cannot compare against a real baseline snapshot because Tauri is not active in the browser dev server.",
        },
      ],
      meta: {
        area: "snapshots",
        source: "mock",
        generatedAtEpochMs: Date.now(),
      },
    }
  );
}
