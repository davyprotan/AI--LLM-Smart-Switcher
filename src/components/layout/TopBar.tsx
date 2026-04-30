import { NAVIGATION } from "../../constants/navigation";
import { StatusPill } from "../ui/StatusPill";
import type { ScreenId } from "../../types/domain";

interface TopBarProps {
  currentScreen: ScreenId;
  warningCount: number;
  activeModelName: string;
}

export function TopBar({ currentScreen, warningCount, activeModelName }: TopBarProps) {
  const current = NAVIGATION.find((item) => item.id === currentScreen);

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Workspace</p>
        <h1>{current?.label ?? "Dashboard"}</h1>
      </div>

      <div className="topbar-meta">
        <StatusPill tone="ok">{activeModelName}</StatusPill>
        <StatusPill tone={warningCount > 0 ? "warn" : "info"}>{`${warningCount} warnings`}</StatusPill>
      </div>
    </header>
  );
}
