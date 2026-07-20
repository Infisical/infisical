import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GlobeIcon, Layers3Icon, type LucideIcon, ServerIcon } from "lucide-react";

import { useOrganization, useOrgPermission, useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";
import { PoolHealthBadge } from "@app/pages/organization/NetworkingPage/components/GatewayTab/components/PoolHealthBadge";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../generic/Select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";

type GatewayPickerValue = {
  gatewayId: string | null;
  gatewayPoolId: string | null;
};

type Props = {
  value: GatewayPickerValue;
  onChange: (value: GatewayPickerValue) => void;
  isDisabled?: boolean;
  className?: string;
  isRequired?: boolean;
  placeholder?: string;
  isError?: boolean;
  noGatewayLabel?: string;
  noGatewayIcon?: LucideIcon;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pt-2 pb-1 text-xs text-muted">{children}</div>
);

const SectionDivider = () => <div className="my-1 h-px bg-border" />;

export const GatewayPicker = ({
  value,
  onChange,
  isDisabled,
  className,
  isRequired,
  placeholder,
  isError,
  noGatewayLabel = "Internet Gateway",
  noGatewayIcon: NoGatewayIcon = GlobeIcon
}: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const showPools = subscription?.gatewayPool;

  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const { data: pools, isPending: isPoolsLoading } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: Boolean(showPools)
  });

  const isLoading = isGatewaysLoading || (showPools && isPoolsLoading);

  let selectValue = isRequired ? "" : "internet";
  if (value.gatewayPoolId) {
    selectValue = `pool:${value.gatewayPoolId}`;
  } else if (value.gatewayId) {
    selectValue = `gateway:${value.gatewayId}`;
  }

  const handleChange = (v: string) => {
    if (v === "internet") {
      onChange({ gatewayId: null, gatewayPoolId: null });
    } else if (v.startsWith("pool:")) {
      onChange({ gatewayId: null, gatewayPoolId: v.replace("pool:", "") });
    } else if (v.startsWith("gateway:")) {
      onChange({ gatewayId: v.replace("gateway:", ""), gatewayPoolId: null });
    }
  };

  const v2Gateways = gateways?.filter((g) => !g.isV1) ?? [];

  const isOnline = (gw: (typeof v2Gateways)[number]) => isGatewayHealthy(gw);

  const poolCount = pools?.length ?? 0;
  const hasAnyGateways = v2Gateways.length > 0 || poolCount > 0;
  const canCreateGateway = permission.can(
    OrgGatewayPermissionActions.CreateGateways,
    OrgPermissionSubjects.Gateway
  );

  return (
    <Select value={selectValue} onValueChange={handleChange} disabled={isDisabled || isLoading}>
      <SelectTrigger className={className ?? "w-full"} isError={isError}>
        <SelectValue placeholder={placeholder ?? "Select gateway..."} />
      </SelectTrigger>
      <SelectContent position="popper" className="z-[70]">
        {!isRequired && (
          <SelectItem value="internet">
            <span className="flex items-center gap-2">
              <NoGatewayIcon className="size-3.5 text-muted" />
              {noGatewayLabel}
            </span>
          </SelectItem>
        )}

        {showPools && pools && pools.length > 0 && (
          <>
            {!isRequired && <SectionDivider />}
            <SectionLabel>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers3Icon className="size-3" />
                  Gateway Pools
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      HA
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>High Availability</TooltipContent>
                </Tooltip>
              </div>
            </SectionLabel>
            {pools.map((pool) => (
              <SelectItem value={`pool:${pool.id}`} key={`pool-${pool.id}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <Layers3Icon className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{pool.name}</span>
                  <span className="shrink-0 text-xs">
                    <PoolHealthBadge pool={pool} />
                  </span>
                </span>
              </SelectItem>
            ))}
          </>
        )}

        {v2Gateways.length > 0 && (
          <>
            {(!isRequired || (showPools && pools && pools.length > 0)) && <SectionDivider />}
            <SectionLabel>
              <div className="flex items-center gap-2">
                <ServerIcon className="size-3" />
                Individual Gateways
              </div>
            </SectionLabel>
            {v2Gateways.map((gw) => (
              <SelectItem value={`gateway:${gw.id}`} key={`gw-${gw.id}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <ServerIcon className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{gw.name}</span>
                  <span
                    className={`shrink-0 text-xs ${isOnline(gw) ? "text-success" : "text-danger"}`}
                  >
                    {isOnline(gw) ? "Online" : "Offline"}
                  </span>
                </span>
              </SelectItem>
            ))}
          </>
        )}

        {isRequired && !hasAnyGateways && (
          <div className="px-2 py-4 text-center text-sm text-muted">
            {canCreateGateway ? (
              <>
                No gateways configured.{" "}
                <Link
                  to="/organizations/$orgId/networking"
                  params={{ orgId: currentOrg.id }}
                  target="_blank"
                  className="text-foreground underline underline-offset-2 hover:text-primary"
                >
                  Set one up
                </Link>{" "}
                to continue.
              </>
            ) : (
              "No gateways configured. Ask your organization admin to set one up."
            )}
          </div>
        )}
      </SelectContent>
    </Select>
  );
};
