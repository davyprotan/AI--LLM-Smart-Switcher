import { useEffect, useMemo, useState } from "react";
import { useAppState } from "./state";
import { Sidebar } from "../components/layout/Sidebar";
import { TopBar } from "../components/layout/TopBar";
import { FirstRunBanner } from "../components/layout/FirstRunBanner";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { HardwareScreen } from "../features/hardware/HardwareScreen";
import { ModelsScreen } from "../features/models/ModelsScreen";
import { SwitcherScreen } from "../features/switcher/SwitcherScreen";
import { SnapshotsScreen } from "../features/snapshots/SnapshotsScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { BenchmarkScreen } from "../features/benchmark/BenchmarkScreen";
import { captureBaselineSnapshot } from "../services/snapshots";

export function App() {
  const {
    currentScreen,
    setCurrentScreen,
    version,
    warnings,
    models,
    baselineCaptured,
    setBaselineCaptured,
    snapshotStore,
    refreshSnapshotStore,
    refreshSnapshotDiff,
  } = useAppState();

  const [bannerDismissed, setBannerDismissed] = useState(false);

  // The first-run banner waits until the snapshot cache has loaded — null
  // means the initial fetch is still in flight, so don't flash the banner
  // before we know whether a baseline already exists.
  const baselineChecked = snapshotStore !== null;

  useEffect(() => {
    if (snapshotStore) {
      setBaselineCaptured(snapshotStore.data.baseline !== null);
    }
  }, [snapshotStore, setBaselineCaptured]);

  const activeModelName = useMemo(
    () => models.find((model) => model.installStatus === "installed")?.name ?? "No active model",
    [models],
  );

  async function handleCaptureBaseline() {
    const result = await captureBaselineSnapshot();
    if (result.data.baseline !== null) {
      setBaselineCaptured(true);
      // Re-prime the shared cache so anywhere else (Snapshots screen,
      // first-run banner) immediately sees the freshly captured baseline.
      void refreshSnapshotStore();
      void refreshSnapshotDiff();
      setCurrentScreen("snapshots");
    }
  }

  const screen = (() => {
    switch (currentScreen) {
      case "hardware":
        return <HardwareScreen />;
      case "models":
        return <ModelsScreen />;
      case "switcher":
        return <SwitcherScreen />;
      case "snapshots":
        return <SnapshotsScreen />;
      case "settings":
        return <SettingsScreen />;
      case "benchmark":
        return <BenchmarkScreen />;
      case "dashboard":
      default:
        return <DashboardScreen />;
    }
  })();

  const showBanner = baselineChecked && !baselineCaptured && !bannerDismissed;

  return (
    <div className="app-shell">
      <Sidebar currentScreen={currentScreen} onSelect={setCurrentScreen} version={version} />

      <main className="main-panel">
        <TopBar currentScreen={currentScreen} warningCount={warnings.length} activeModelName={activeModelName} />
        {showBanner && (
          <FirstRunBanner
            onCapture={handleCaptureBaseline}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
        <div className="screen-content">{screen}</div>
      </main>
    </div>
  );
}
