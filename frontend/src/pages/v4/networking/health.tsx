import type { ComponentPropsWithRef } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";

import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import { getLastSeenHeartbeat, isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

type GatewayProbe = {
  heartbeat?: string | null;
  relayId?: string | null;
  directAddress?: string | null;
  directHeartbeat?: string | null;
  heartbeatTTL?: number | null;
};

export const isGatewayRegistered = (gateway: GatewayProbe) =>
  Boolean(
    gateway.directAddress ||
    gateway.relayId ||
    getLastSeenHeartbeat(gateway) ||
    (gateway.heartbeatTTL !== null && gateway.heartbeatTTL !== undefined)
  );

export const lastSeenLabel = (date: string | null | undefined) =>
  date ? `Last seen ${format(new Date(date), "PPp")}` : "No data available";

type HealthSize = "md" | "control-sm";

const HealthLabel = ({
  tone,
  icon,
  size,
  ...props
}: ComponentPropsWithRef<"span"> & {
  tone: "ok" | "bad" | "warn";
  icon: "alert-c" | "check-c" | "x";
  size?: HealthSize;
}) =>
  size ? (
    <Badge {...props} tone={tone} icon={icon} size={size} collapse={size === "control-sm"} />
  ) : (
    <StatusText {...props} tone={tone} icon={icon} />
  );

export const GatewayHealth = ({ gateway, size }: { gateway: GatewayProbe; size?: HealthSize }) => {
  if (!isGatewayRegistered(gateway))
    return (
      <HealthLabel tone="warn" icon="alert-c" size={size}>
        Unregistered
      </HealthLabel>
    );
  const healthy = isGatewayHealthy({ ...gateway, relayId: gateway.relayId ?? null });
  return (
    <Tooltip content={lastSeenLabel(getLastSeenHeartbeat(gateway))}>
      <HealthLabel
        tone={healthy ? "ok" : "bad"}
        icon={healthy ? "check-c" : "x"}
        size={size}
        tabIndex={0}
      >
        {healthy ? "Healthy" : "Unreachable"}
      </HealthLabel>
    </Tooltip>
  );
};

export const isRelayHealthy = (heartbeat?: string | null) =>
  Boolean(heartbeat) && new Date(heartbeat as string).getTime() > Date.now() - 3_600_000;

export const RelayHealth = ({
  heartbeat,
  size
}: {
  heartbeat?: string | null;
  size?: HealthSize;
}) => {
  if (!heartbeat)
    return (
      <HealthLabel tone="warn" icon="alert-c" size={size}>
        Unregistered
      </HealthLabel>
    );
  const healthy = isRelayHealthy(heartbeat);
  return (
    <Tooltip content={lastSeenLabel(heartbeat)}>
      <HealthLabel
        tone={healthy ? "ok" : "bad"}
        icon={healthy ? "check-c" : "x"}
        size={size}
        tabIndex={0}
      >
        {healthy ? "Healthy" : "Unreachable"}
      </HealthLabel>
    </Tooltip>
  );
};

export const PoolHealth = ({
  pool
}: {
  pool: Pick<TGatewayPool, "memberCount" | "healthyMemberCount">;
}) => {
  if (pool.memberCount === 0) return <Badge tone="soft">No members</Badge>;
  let tone: "ok" | "bad" | "warn" = "warn";
  if (pool.healthyMemberCount === 0) tone = "bad";
  if (pool.healthyMemberCount === pool.memberCount) tone = "ok";
  return (
    <Badge tone={tone}>
      {pool.healthyMemberCount}/{pool.memberCount} healthy
    </Badge>
  );
};
