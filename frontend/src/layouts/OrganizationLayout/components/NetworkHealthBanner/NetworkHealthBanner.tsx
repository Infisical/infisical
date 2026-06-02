import { useMemo, useState } from "react";
import {
  faChevronDown,
  faChevronUp,
  faExclamationTriangle,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
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

type AlertItem = {
  id: string;
  message: string;
  linkLabel?: string;
  linkTo?: string;
  onDismiss: () => void;
};

type SingleAlertRowProps = {
  alert: AlertItem;
  isChild?: boolean;
};

const SingleAlertRow = ({ alert, isChild }: SingleAlertRowProps) => (
  <div
    className={`flex w-full items-center py-2 pr-4 text-sm text-red-200 ${isChild ? "pl-10" : "px-4"}`}
  >
    {!isChild && (
      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2.5 text-base text-red-400" />
    )}
    {alert.message}
    {alert.linkLabel && alert.linkTo && (
      <Link
        to={alert.linkTo}
        className="ml-1 cursor-pointer underline underline-offset-2 duration-100 hover:text-red-100"
      >
        {alert.linkLabel}
      </Link>
    )}
    <IconButton
      className="ml-auto p-0 text-red-200 hover:text-red-100"
      ariaLabel="Dismiss alert"
      variant="plain"
      onClick={alert.onDismiss}
    >
      <FontAwesomeIcon icon={faXmark} />
    </IconButton>
  </div>
);

export const NetworkHealthBanner = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [networkDismissed, setNetworkDismissed] = useState(() => wasDismissedWithinLastDay());

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

  const unreachableGatewayCount = useMemo(
    () =>
      gateways?.filter((g) => {
        if (g.isV1) return false;
        return !isGatewayHealthy(g);
      }).length ?? 0,
    [gateways]
  );

  const unreachableRelayCount = useMemo(
    () =>
      relays?.filter((r) => r.orgId && r.heartbeat && isRelayHeartbeatStale(r.heartbeat)).length ??
      0,
    [relays]
  );

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];

    if (!networkDismissed && (unreachableGatewayCount > 0 || unreachableRelayCount > 0)) {
      const parts: string[] = [];
      if (unreachableGatewayCount > 0) {
        parts.push(`${unreachableGatewayCount} gateway${unreachableGatewayCount > 1 ? "s" : ""}`);
      }
      if (unreachableRelayCount > 0) {
        parts.push(`${unreachableRelayCount} relay${unreachableRelayCount > 1 ? "s" : ""}`);
      }
      const count = unreachableGatewayCount + unreachableRelayCount;
      items.push({
        id: "network",
        message: `${parts.join(" and ")} in your organization ${count > 1 ? "are" : "is"} unreachable.`,
        linkLabel: "View networking",
        linkTo: `/organizations/${currentOrg.id}/networking`,
        onDismiss: () => {
          localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
          setNetworkDismissed(true);
        }
      });
    }

    return items;
  }, [networkDismissed, unreachableGatewayCount, unreachableRelayCount, currentOrg.id]);

  if (!canListGateways && !canListRelays) return null;
  if (alerts.length === 0) return null;

  if (alerts.length === 1) {
    return (
      <div className="w-full border-b border-red-500/50 bg-red-500/20">
        <SingleAlertRow alert={alerts[0]} />
      </div>
    );
  }

  return (
    <div className="w-full border-b border-red-500/50 bg-red-500/20">
      <div className="flex w-full items-center px-4 py-2 text-sm text-red-200">
        <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2.5 text-base text-red-400" />
        <span className="font-medium">
          {alerts.length} alerts in your organization require attention.
        </span>
        <IconButton
          className="ml-2 p-0 text-red-200 hover:text-red-100"
          ariaLabel={isExpanded ? "Collapse alerts" : "Expand alerts"}
          variant="plain"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="text-xs" />
        </IconButton>
        <IconButton
          className="ml-auto shrink-0 p-0 text-red-200 hover:text-red-100"
          ariaLabel="Dismiss all alerts"
          variant="plain"
          onClick={() => alerts.forEach((alert) => alert.onDismiss())}
        >
          <FontAwesomeIcon icon={faXmark} />
        </IconButton>
      </div>
      {isExpanded && (
        <div>
          {alerts.map((alert) => (
            <div key={alert.id} className="border-t border-red-500/30">
              <SingleAlertRow alert={alert} isChild />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
