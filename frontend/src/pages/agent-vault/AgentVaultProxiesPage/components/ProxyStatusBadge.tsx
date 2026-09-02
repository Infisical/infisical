import { formatDistanceToNowStrict } from "date-fns";
import { CircleCheckIcon, CircleDashedIcon, CircleSlashIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { TAgentVaultProxy } from "@app/hooks/api/agentVault/types";

// Health is computed on the server from the heartbeat and the poll interval; nothing is re-derived
// here. Revoking a proxy nulls its heartbeat but keeps its certificate authority, which is what
// separates "never enrolled" from "enrolled but not connected".
export const ProxyStatusBadge = ({ proxy }: { proxy: TAgentVaultProxy }) => {
  if (proxy.isHealthy && proxy.heartbeat) {
    return (
      <Badge variant="success">
        <CircleCheckIcon />
        Healthy · {formatDistanceToNowStrict(new Date(proxy.heartbeat))} ago
      </Badge>
    );
  }

  if (!proxy.heartbeat) {
    return (
      <Badge variant="neutral">
        <CircleDashedIcon />
        {proxy.rootCaFingerprint ? "Not connected" : "Never enrolled"}
      </Badge>
    );
  }

  return (
    <Badge variant="warning">
      <CircleSlashIcon />
      Unreachable · {formatDistanceToNowStrict(new Date(proxy.heartbeat))} ago
    </Badge>
  );
};
