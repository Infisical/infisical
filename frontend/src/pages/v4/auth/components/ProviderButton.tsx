import type { ReactNode } from "react";
import { useV4Scheme } from "@infisical/cipher/scope";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";
import { Mail } from "lucide-react";

import { providerIconPath } from "@app/pages/v4/components/provider-icon";

import styles from "../auth.module.css";

const PROVIDER_IMAGES: Record<string, string> = {
  google: "Google Workspace.svg",
  github: "GitHub.png",
  gitlab: "GitLab.png",
  ldap: "LDAP.png"
};

const PROVIDER_ICONS: Record<string, IconName> = {
  saml: "lock",
  oidc: "key"
};

export const ProviderMark = ({ provider }: { provider: string }) => {
  const scheme = useV4Scheme() ?? "light";
  const image = PROVIDER_IMAGES[provider];
  if (image) {
    return <img alt="" className={styles.providerIcon} src={providerIconPath(image, scheme)} />;
  }
  if (provider === "email") return <Icon icon={Mail} size={16} strokeWidth={1.7} />;
  return <Icon name={PROVIDER_ICONS[provider] ?? "lock"} size={16} />;
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
}: Props) => (
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
    <ProviderMark provider={provider} />
    {showLabel && label}
  </Button>
);
