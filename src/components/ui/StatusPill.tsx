import type { StatusTone } from "../../types/domain";

interface StatusPillProps {
  tone: StatusTone;
  children: string;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

