import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  ACTIVITY_LOG,
  APP_VERSION,
  BENCHMARK_RESULTS,
  HARDWARE_GAUGES,
  HARDWARE_PROFILE,
  MODELS,
  RECOMMENDATION_TIERS,
  REPAIR_ACTIONS,
  SESSION_METRICS,
  SNAPSHOTS,
  TOOL_ASSIGNMENTS,
  WARNINGS,
} from "../data/mockData";
import { UI_VARIATIONS } from "../constants/variations";
import { scanHardware } from "../services/hardware";
import { listModels } from "../services/models";
import { listSnapshotDiff, listSnapshots } from "../services/snapshots";
import { listBackups } from "../services/switcher";
import type {
  BackupEntry,
  CommandResponse,
  HardwareScanPayload,
  ModelCatalogPayload,
  ScreenId,
  SnapshotDiffPayload,
  SnapshotStorePayload,
} from "../types/domain";

interface AppStateValue {
  version: string;
  currentScreen: ScreenId;
  setCurrentScreen: (screen: ScreenId) => void;
  selectedVariationId: string;
  setSelectedVariationId: (variationId: string) => void;
  baselineCaptured: boolean;
  setBaselineCaptured: (captured: boolean) => void;
  /**
   * Result of `scanHardware()` cached at the app level so each screen does not
   * trigger its own native system scan. `null` while the first scan is in
   * flight or if it failed.
   */
  hardwareScan: CommandResponse<HardwareScanPayload> | null;
  refreshHardwareScan: () => Promise<void>;
  /** Cached Ollama + hosted-API model catalog. */
  modelCatalog: CommandResponse<ModelCatalogPayload> | null;
  refreshModelCatalog: () => Promise<void>;
  /** Cached baseline snapshot store. */
  snapshotStore: CommandResponse<SnapshotStorePayload> | null;
  refreshSnapshotStore: () => Promise<CommandResponse<SnapshotStorePayload> | null>;
  /** Cached current-vs-baseline diff. */
  snapshotDiff: CommandResponse<SnapshotDiffPayload> | null;
  refreshSnapshotDiff: () => Promise<void>;
  /** Cached backup list. */
  backupList: BackupEntry[];
  refreshBackupList: () => Promise<void>;
  warnings: typeof WARNINGS;
  sessionMetrics: typeof SESSION_METRICS;
  hardwareProfile: typeof HARDWARE_PROFILE;
  hardwareGauges: typeof HARDWARE_GAUGES;
  recommendationTiers: typeof RECOMMENDATION_TIERS;
  models: typeof MODELS;
  toolAssignments: typeof TOOL_ASSIGNMENTS;
  snapshots: typeof SNAPSHOTS;
  activityLog: typeof ACTIVITY_LOG;
  benchmarkResults: typeof BENCHMARK_RESULTS;
  repairActions: typeof REPAIR_ACTIONS;
  variations: typeof UI_VARIATIONS;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>("dashboard");
  const [selectedVariationId, setSelectedVariationId] = useState("operator");
  const [baselineCaptured, setBaselineCapturedRaw] = useState(false);
  const [hardwareScan, setHardwareScan] = useState<CommandResponse<HardwareScanPayload> | null>(null);
  const [modelCatalog, setModelCatalog] = useState<CommandResponse<ModelCatalogPayload> | null>(null);
  const [snapshotStore, setSnapshotStore] = useState<CommandResponse<SnapshotStorePayload> | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<CommandResponse<SnapshotDiffPayload> | null>(null);
  const [backupList, setBackupList] = useState<BackupEntry[]>([]);

  const setBaselineCaptured = useCallback((captured: boolean) => {
    setBaselineCapturedRaw(captured);
  }, []);

  const refreshHardwareScan = useCallback(async () => {
    try {
      const result = await scanHardware();
      setHardwareScan(result);
    } catch {
      /* leave previous value in place; fit badges & hardware screen
         already gracefully handle a null scan */
    }
  }, []);

  const refreshModelCatalog = useCallback(async () => {
    try {
      setModelCatalog(await listModels());
    } catch {
      /* keep stale catalog rather than wiping the UI on a transient error */
    }
  }, []);

  const refreshSnapshotStore = useCallback(async () => {
    try {
      const result = await listSnapshots();
      setSnapshotStore(result);
      return result;
    } catch {
      return null;
    }
  }, []);

  const refreshSnapshotDiff = useCallback(async () => {
    try {
      setSnapshotDiff(await listSnapshotDiff());
    } catch {
      /* keep stale diff */
    }
  }, []);

  const refreshBackupList = useCallback(async () => {
    try {
      const result = await listBackups();
      setBackupList(result?.data.backups ?? []);
    } catch {
      /* keep stale backup list */
    }
  }, []);

  // Prime every cache exactly once at app boot. Individual screens only
  // re-fetch via the explicit refresh functions after a relevant mutation
  // (capture baseline, apply switch, revert, model pull, etc.).
  useEffect(() => {
    refreshHardwareScan();
    refreshModelCatalog();
    refreshSnapshotStore();
    refreshSnapshotDiff();
    refreshBackupList();
  }, [
    refreshHardwareScan,
    refreshModelCatalog,
    refreshSnapshotStore,
    refreshSnapshotDiff,
    refreshBackupList,
  ]);

  const value = useMemo<AppStateValue>(
    () => ({
      version: APP_VERSION,
      currentScreen,
      setCurrentScreen,
      selectedVariationId,
      setSelectedVariationId,
      baselineCaptured,
      setBaselineCaptured,
      hardwareScan,
      refreshHardwareScan,
      modelCatalog,
      refreshModelCatalog,
      snapshotStore,
      refreshSnapshotStore,
      snapshotDiff,
      refreshSnapshotDiff,
      backupList,
      refreshBackupList,
      warnings: WARNINGS,
      sessionMetrics: SESSION_METRICS,
      hardwareProfile: HARDWARE_PROFILE,
      hardwareGauges: HARDWARE_GAUGES,
      recommendationTiers: RECOMMENDATION_TIERS,
      models: MODELS,
      toolAssignments: TOOL_ASSIGNMENTS,
      snapshots: SNAPSHOTS,
      activityLog: ACTIVITY_LOG,
      benchmarkResults: BENCHMARK_RESULTS,
      repairActions: REPAIR_ACTIONS,
      variations: UI_VARIATIONS,
    }),
    [
      currentScreen,
      selectedVariationId,
      baselineCaptured,
      setBaselineCaptured,
      hardwareScan,
      refreshHardwareScan,
      modelCatalog,
      refreshModelCatalog,
      snapshotStore,
      refreshSnapshotStore,
      snapshotDiff,
      refreshSnapshotDiff,
      backupList,
      refreshBackupList,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);

  if (!value) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }

  return value;
}

