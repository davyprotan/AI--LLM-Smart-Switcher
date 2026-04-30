import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
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
import type { ScreenId } from "../types/domain";

interface AppStateValue {
  version: string;
  currentScreen: ScreenId;
  setCurrentScreen: (screen: ScreenId) => void;
  selectedVariationId: string;
  setSelectedVariationId: (variationId: string) => void;
  baselineCaptured: boolean;
  setBaselineCaptured: (captured: boolean) => void;
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

  const setBaselineCaptured = useCallback((captured: boolean) => {
    setBaselineCapturedRaw(captured);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      version: APP_VERSION,
      currentScreen,
      setCurrentScreen,
      selectedVariationId,
      setSelectedVariationId,
      baselineCaptured,
      setBaselineCaptured,
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
    [currentScreen, selectedVariationId, baselineCaptured, setBaselineCaptured],
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

