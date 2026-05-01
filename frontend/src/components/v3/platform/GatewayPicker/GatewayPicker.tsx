import { faGlobe, faLayerGroup, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { Select, SelectItem, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";
import { PoolHealthBadge } from "@app/pages/organization/NetworkingPage/components/GatewayTab/components/PoolHealthBadge";

type GatewayPickerValue = {
  gatewayId: string | null;
  gatewayPoolId: string | null;
};

type Props = {
  value: GatewayPickerValue;
  onChange: (value: GatewayPickerValue) => void;
  isDisabled?: boolean;
  className?: string;
  // When true, removes the "Internet Gateway" option — useful for forms
  // (PAM resources / domains / discovery) where a gateway or pool is required.
  // The form is responsible for validating that one is selected; this prop
  // just hides the "no gateway" choice from the dropdown.
  isRequired?: boolean;
  placeholder?: string;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pt-2 pb-1 text-xs text-mineshaft-400">{children}</div>
);

const SectionDivider = () => <div className="my-1 h-px bg-mineshaft-600" />;

export const GatewayPicker = ({
  value,
  onChange,
  isDisabled,
  className,
  isRequired,
  placeholder
}: Props) => {
  const { subscription } = useSubscription();
  const showPools = subscription?.gatewayPool;

  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const { data: pools, isPending: isPoolsLoading } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: Boolean(showPools)
  });

  const isLoading = isGatewaysLoading || (showPools && isPoolsLoading);

  // When required mode is on and nothing is picked yet, leave selectValue
  // empty so the placeholder renders. When optional, default to "internet".
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

  const isOnline = (gw: (typeof v2Gateways)[number]) =>
    "heartbeat" in gw &&
    gw.heartbeat &&
    new Date(gw.heartbeat).getTime() > Date.now() - 60 * 60 * 1000 &&
    (!("lastHealthCheckStatus" in gw) ||
      gw.lastHealthCheckStatus !== GatewayHealthCheckStatus.Failed);

  return (
    <Select
      value={selectValue}
      onValueChange={handleChange}
      isDisabled={isDisabled}
      isLoading={Boolean(isLoading)}
      // Default to w-full because every consumer (PAM forms, App Connection forms,
      // Dynamic Secret forms, K8s identity auth, PKI Discovery) wants the picker
      // to fill its container. Caller can still override with className.
      className={twMerge("w-full", className)}
      dropdownContainerClassName="max-w-none"
      position="popper"
      side="bottom"
      placeholder={placeholder}
    >
      {!isRequired && (
        <SelectItem value="internet">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGlobe} className="size-3.5 text-mineshaft-400" />
            Internet Gateway
          </div>
        </SelectItem>
      )}

      {showPools && pools && pools.length > 0 && (
        <>
          {!isRequired && <SectionDivider />}
          <SectionLabel>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faLayerGroup} className="size-3" />
                Gateway Pools
              </div>
              <Tooltip content="High Availability" className="z-[110]">
                <span className="cursor-default rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  HA
                </span>
              </Tooltip>
            </div>
          </SectionLabel>
          {pools.map((pool) => (
            <SelectItem value={`pool:${pool.id}`} key={`pool-${pool.id}`}>
              <div className="flex min-w-0 items-center gap-2">
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  className="size-3.5 shrink-0 text-mineshaft-400"
                />
                <span className="truncate">{pool.name}</span>
                <span className="shrink-0 text-xs">
                  <PoolHealthBadge pool={pool} />
                </span>
              </div>
            </SelectItem>
          ))}
        </>
      )}

      {v2Gateways.length > 0 && (
        <>
          {(!isRequired || (showPools && pools && pools.length > 0)) && <SectionDivider />}
          <SectionLabel>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faServer} className="size-3" />
              Individual Gateways
            </div>
          </SectionLabel>
          {v2Gateways.map((gw) => (
            <SelectItem value={`gateway:${gw.id}`} key={`gw-${gw.id}`}>
              <div className="flex min-w-0 items-center gap-2">
                <FontAwesomeIcon icon={faServer} className="size-3.5 shrink-0 text-mineshaft-400" />
                <span className="truncate">{gw.name}</span>
                <span
                  className={`shrink-0 text-xs ${isOnline(gw) ? "text-green-500" : "text-red-400"}`}
                >
                  {isOnline(gw) ? "Online" : "Offline"}
                </span>
              </div>
            </SelectItem>
          ))}
        </>
      )}
    </Select>
  );
};
