import { useMemo, useState } from "react";
import { faExclamationTriangle, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { IconButton } from "@app/components/v2";
import { apiRequest } from "@app/config/request";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";
import { relayQueryKeys } from "@app/hooks/api/relays/queries";
import { TRelay } from "@app/hooks/api/relays/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RELAY_HEARTBEAT_TIMEOUT_MS = 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = "network-health-banner-dismissed-at";

const isRelayHeartbeatStale = (heartbeat?: string | null): boolean => {
  if (!heartbeat) return true;
  return new Date(heartbeat).getTime() < Date.now() - RELAY_HEARTBEAT_TIMEOUT_MS;
};

const wasDismissedWithinLastDay = (): boolean => {
  const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!dismissedAt) return false;
  const dismissedTime = parseInt(dismissedAt, 10);
  return Date.now() - dismissedTime < ONE_DAY_MS;
};

export const NetworkHealthBanner = () => {
  const [isDismissed, setIsDismissed] = useState(() => wasDismissedWithinLastDay());
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const canListGateways = permission.can(
    OrgGatewayPermissionActions.ListGateways,
    OrgPermissionSubjects.Gateway
  );
  const canListRelays = permission.can(
    OrgRelayPermissionActions.ListRelays,
    OrgPermissionSubjects.Relay
  );

  const { data: gateways } = useQuery({
    ...gatewaysQueryKeys.list(),
    enabled: canListGateways
  });
  const { data: relays } = useQuery({
    queryKey: relayQueryKeys.list(),
    queryFn: async (): Promise<TRelay[]> => {
      const { data } = await apiRequest.get<TRelay[]>("/api/v1/relays");
      return data;
    },
    enabled: canListRelays
  });

  const unreachableGateways = useMemo(
    () =>
      gateways?.filter((g) => {
        if (!("heartbeat" in g)) return false;
        if (
          g.heartbeat === null &&
          ("lastHealthCheckStatus" in g ? g.lastHealthCheckStatus : null) === null
        )
          return false;
        return !isGatewayHealthy(
          g.heartbeat,
          "lastHealthCheckStatus" in g ? g.lastHealthCheckStatus : null
        );
      }).length ?? 0,
    [gateways]
  );

  const unreachableRelays = useMemo(
    () =>
      relays?.filter((r) => r.orgId && r.heartbeat && isRelayHeartbeatStale(r.heartbeat)).length ??
      0,
    [relays]
  );

  if (!canListGateways && !canListRelays) return null;
  if (isDismissed || (unreachableGateways === 0 && unreachableRelays === 0)) return null;

  const parts: string[] = [];
  if (unreachableGateways > 0) {
    parts.push(`${unreachableGateways} gateway${unreachableGateways > 1 ? "s" : ""}`);
  }
  if (unreachableRelays > 0) {
    parts.push(`${unreachableRelays} relay${unreachableRelays > 1 ? "s" : ""}`);
  }

  return (
    <div className="flex w-full items-center border-b border-red-500/50 bg-red-500/20 px-4 py-2 text-sm text-red-200">
      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2.5 text-base text-red-400" />
      {parts.join(" and ")} in your organization{" "}
      {unreachableGateways + unreachableRelays > 1 ? "are" : "is"} unreachable.
      <Link
        to="/organizations/$orgId/networking"
        params={{ orgId: currentOrg.id }}
        className="ml-1 cursor-pointer underline underline-offset-2 duration-100 hover:text-red-100"
      >
        View networking
      </Link>
      <IconButton
        className="ml-auto p-0 text-red-200 hover:text-red-100"
        ariaLabel="Dismiss banner"
        variant="plain"
        onClick={() => {
          localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
          setIsDismissed(true);
        }}
      >
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
