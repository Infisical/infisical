import { useMemo } from "react";
import { Icon, type IconSource } from "@infisical/cipher/ui/icon";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { isInfisicalDomain } from "@app/helpers/agentVaultSessionLogs";
import { findAnyTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import { AgentVaultServiceType, isNativeServiceType } from "@app/hooks/api/agentVault/enums";

import { ProviderIcon } from "../../components/provider-icon";
import { formatDay, formatMoment, NATIVE_SERVICE_META } from "./agent-vault-utils";

import css from "./resources.module.css";

export const DateCell = ({ value }: { value: string }) => (
  <Tooltip content={formatMoment(value)}>
    <Meta mono={false} tabIndex={0}>
      {formatDay(value)}
    </Meta>
  </Tooltip>
);

export const Dash = () => <Meta>-</Meta>;

type TServiceIcon = {
  key: string;
  label: string;
  image?: string;
  icon?: IconSource;
};

const labelOf = (pattern: string) => {
  const trimmed = pattern.trim();
  const host = trimmed.startsWith("[")
    ? trimmed.slice(0, trimmed.indexOf("]") + 1)
    : trimmed.split(":")[0];
  return host || trimmed;
};

const INFISICAL_ICON: TServiceIcon = {
  key: "host:Infisical",
  label: "Infisical",
  image: "Infisical.png"
};

const iconFromHostPattern = (hostPattern: string): TServiceIcon => {
  const template = findAnyTemplateForHostPattern(hostPattern);
  if (!template && isInfisicalDomain(labelOf(hostPattern))) return INFISICAL_ICON;
  const label = template?.name ?? labelOf(hostPattern);
  return { key: `host:${label}`, label, image: template?.image };
};

const iconOf = ({
  hostPattern,
  serviceType
}: {
  hostPattern?: string | null;
  serviceType?: AgentVaultServiceType | null;
}): TServiceIcon => {
  if (isNativeServiceType(serviceType)) {
    const meta = NATIVE_SERVICE_META[serviceType];
    return {
      key: `type:${serviceType}`,
      label: meta.label,
      image: meta.image,
      icon: meta.icon
    };
  }
  if (hostPattern) return iconFromHostPattern(hostPattern);
  return { key: "service", label: "Service", icon: "server" };
};

const Chip = ({ icon }: { icon: TServiceIcon }) => (
  <span className={css.chip} aria-hidden>
    {icon.image ? (
      <ProviderIcon icon={icon.image} alt="" size="sm" />
    ) : (
      <Icon icon={icon.icon ?? "globe"} size={14} />
    )}
  </span>
);

export const ServiceIcon = ({
  hostPattern,
  serviceType
}: {
  hostPattern?: string | null;
  serviceType?: AgentVaultServiceType | null;
}) => <Chip icon={iconOf({ hostPattern, serviceType })} />;

type TNativeService = { name: string; type: AgentVaultServiceType };
const NO_NATIVE_SERVICES: TNativeService[] = [];

export const ServiceIconStack = ({
  hostPatterns,
  nativeServices = NO_NATIVE_SERVICES,
  maxVisible = 4
}: {
  hostPatterns: string[];
  nativeServices?: TNativeService[];
  maxVisible?: number;
}) => {
  const icons = useMemo(() => {
    const byKey = new Map<string, TServiceIcon>();
    const add = (icon: TServiceIcon) => {
      if (icon.label && !byKey.has(icon.key)) byKey.set(icon.key, icon);
    };
    hostPatterns.forEach((pattern) => add(iconFromHostPattern(pattern)));
    nativeServices.forEach(({ name, type }) => {
      if (isNativeServiceType(type))
        add({
          ...iconOf({ serviceType: type }),
          key: `native:${name}`,
          label: name
        });
    });
    return [...byKey.values()];
  }, [hostPatterns, nativeServices]);

  if (icons.length === 0) return <Dash />;
  const visible = icons.slice(0, maxVisible);
  const hidden = icons.slice(maxVisible);

  return (
    <Tooltip content={icons.map((icon) => icon.label).join(", ")}>
      <Meta
        mono={false}
        className={css.stack}
        tabIndex={0}
        aria-label={icons.map((icon) => icon.label).join(", ")}
      >
        {visible.map((icon) => (
          <Chip key={icon.key} icon={icon} />
        ))}
        {hidden.length > 0 && <span className={css.chipCount}>+{hidden.length}</span>}
      </Meta>
    </Tooltip>
  );
};
