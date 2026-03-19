import { useMemo } from "react";
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
import { useToggle } from "@app/hooks";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { relayQueryKeys } from "@app/hooks/api/relays/queries";
import { TRelay } from "@app/hooks/api/relays/types";

const ONE_HOUR_MS = 60 * 60 * 1000;

const isHeartbeatStale = (heartbeat?: string | null): boolean => {
  if (!heartbeat) return true;
  const heartbeatDate = new Date(heartbeat);
  return heartbeatDate.getTime() < Date.now() - ONE_HOUR_MS;
};

export const NetworkHealthBanner = () => {
  const [isDismissed, setIsDismissed] = useToggle(false);
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
    () => gateways?.filter((g) => isHeartbeatStale(g.heartbeat)).length ?? 0,
    [gateways]
  );

  const unreachableRelays = useMemo(
    () =>
      relays?.filter((r) => r.orgId && r.heartbeat && isHeartbeatStale(r.heartbeat)).length ?? 0,
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
        onClick={() => setIsDismissed.on()}
      >
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
