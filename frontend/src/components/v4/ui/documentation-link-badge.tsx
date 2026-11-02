import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Icon } from "./icon";
import { Tooltip } from "./tooltip";

import controlStyles from "./controls.module.css";
import styles from "./documentation-link-badge.module.css";

const label = "Documentation";

export function DocumentationLinkBadge({
  href,
  variant = "default",
  className
}: {
  href: string;
  variant?: "default" | "minified";
  className?: string;
}) {
  const link = { href, target: "_blank", rel: "noopener noreferrer" } as const;
  if (variant === "minified")
    return (
      <Tooltip content={label}>
        <a
          {...link}
          aria-label={`${label} (opens in a new tab)`}
          data-slot="documentation-link-badge"
          data-variant="minified"
          className={cn(controlStyles.focusOutline, styles.minified, className)}
        >
          <Icon name="external" />
        </a>
      </Tooltip>
    );
  return (
    <Tooltip content="Opens in a new tab">
      <Badge tone="info" asChild className={cn(styles.badge, className)}>
        <a {...link} data-slot="documentation-link-badge" data-variant="default">
          {label}
          <Icon name="external" />
          <span className={styles.sr}> (opens in a new tab)</span>
        </a>
      </Badge>
    </Tooltip>
  );
}
