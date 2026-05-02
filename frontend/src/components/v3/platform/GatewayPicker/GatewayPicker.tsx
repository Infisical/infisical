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
  // Visual variant for the picker's trigger to match the surrounding form
  // language. "v2" (default) keeps the picker's native v2 Select look —
  // filled bg-mineshaft-900 with border-mineshaft-600 — which fits inside v2
  // FormControl wrappers (App Connections, Dynamic Secrets, K8s identity
  // auth). "v3" switches to a transparent background + border-border + h-9 to
  // match v3 Input / FilterableSelect siblings (PAM forms, PKI Discovery).
  variant?: "v2" | "v3";
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
  placeholder,
  variant = "v2"
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

  // For variant="v3" we override the v2 Select item's hover/highlighted state via a
  // descendant selector. v2 Select uses bg-mineshaft-500 / bg-mineshaft-700 hover,
  // which clashes with the lighter bg-popover panel; v3 uses bg-foreground/5 instead.
  const itemHoverV3 =
    "[&_[data-radix-collection-item]:hover]:bg-foreground/5 [&_[data-radix-collection-item][data-highlighted]]:bg-foreground/5";

  return (
    <Select
      value={selectValue}
      onValueChange={handleChange}
      isDisabled={isDisabled}
      isLoading={Boolean(isLoading)}
      // Make the v2 Select's outer flex wrapper `display: contents` so the Trigger
      // button becomes a direct flex item of FieldContent (the actual form column).
      // With w-full on the wrapper, the Trigger was 100% of the wrapper, but the
      // wrapper itself was not always taking the same width as a sibling Input —
      // FieldContent's stretch alignment treats the Input as a direct child but the
      // picker wrapper as an opaque box, leaving it slightly narrower. `contents`
      // dissolves the wrapper from the layout tree, putting the Trigger on equal
      // footing with Input and FilterableSelect.
      containerClassName="contents"
      // Default to w-full because every consumer (PAM forms, App Connection forms,
      // Dynamic Secret forms, K8s identity auth, PKI Discovery) wants the picker
      // to fill its container. Caller can still override with className.
      // The v3 variant overrides the v2 Select trigger's filled bg-mineshaft-900
      // and darker border so the picker visually matches v3 Input / FilterableSelect
      // siblings in v3 form layouts.
      className={twMerge(
        "w-full",
        variant === "v3" && "h-9 border-border bg-transparent text-foreground",
        className
      )}
      // v3 dropdown panel uses bg-popover + border-border to match v3 design language
      // (Field, FilterableSelect menu). Default v2 panel keeps bg-mineshaft-900.
      dropdownContainerClassName={twMerge(
        "max-w-none",
        variant === "v3" && `border-border bg-popover text-foreground ${itemHoverV3}`
      )}
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
