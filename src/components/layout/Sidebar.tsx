import { NAVIGATION } from "../../constants/navigation";
import { Icon } from "../ui/Icon";
import type { ScreenId } from "../../types/domain";

interface SidebarProps {
  currentScreen: ScreenId;
  version: string;
  onSelect: (screen: ScreenId) => void;
}

export function Sidebar({ currentScreen, version, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">LS</div>
        <div>
          <strong>LLM Smart Switcher</strong>
          <span>cross-platform shell</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAVIGATION.map((item) => (
          <button
            key={item.id}
            className={item.id === currentScreen ? "nav-item active" : "nav-item"}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <footer className="sidebar-footer">v{version}</footer>
    </aside>
  );
}

