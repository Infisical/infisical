import type { ReactNode } from "react";

import { useV4Scheme } from "@app/components/v4/scope";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { providerIconPath } from "@app/components/v4/ui/provider-icon";

import styles from "../auth.module.css";

const PROVIDER_ICONS: Record<string, string> = {
  google: "Google Workspace.svg",
  github: "GitHub.png",
  gitlab: "GitLab.png"
};

type Props = {
  provider: string;
  label: ReactNode;
  ariaLabel: string;
  showLabel?: boolean;
  badge?: string;
  onClick: () => void;
};

export const ProviderButton = ({
  provider,
  label,
  ariaLabel,
  showLabel = true,
  badge,
  onClick
}: Props) => {
  const scheme = useV4Scheme() ?? "light";
  const icon = PROVIDER_ICONS[provider];
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      aria-label={ariaLabel}
      onClick={onClick}
      className="w-full"
      cornerBadge={
        badge ? (
          <Badge tone="accent" size="sm">
            {badge}
          </Badge>
        ) : undefined
      }
    >
      {icon ? (
        <img alt="" className={styles.providerIcon} src={providerIconPath(icon, scheme)} />
      ) : (
        <Icon name="lock" />
      )}
      {showLabel && label}
    </Button>
  );
};
