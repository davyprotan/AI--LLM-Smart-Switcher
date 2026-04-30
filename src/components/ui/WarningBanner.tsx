import { Icon } from "./Icon";
import type { WarningItem } from "../../types/domain";

interface WarningBannerProps {
  warning: WarningItem;
}

export function WarningBanner({ warning }: WarningBannerProps) {
  return (
    <article className={`warning-banner tone-${warning.tone}`}>
      <Icon name="warning" />
      <div>
        <strong>{warning.title}</strong>
        <p>{warning.message}</p>
      </div>
    </article>
  );
}

