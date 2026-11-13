import { Select } from "@infisical/cipher/ui/select";

import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

import { useOrgId } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";

export type GatewayPickerValue = { gatewayId: string | null; gatewayPoolId: string | null };

const POOL_REQUIRED_REASON = "Your organization requires a gateway pool";

export const GatewayPicker = ({
  value,
  onChange,
  id,
  label,
  disabled,
  invalid,
  excludeGatewayId,
  allowIndividualGateways,
  required,
  noGatewayLabel = "Internet gateway"
}: {
  value: GatewayPickerValue;
  onChange: (value: GatewayPickerValue) => void;
  id?: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  excludeGatewayId?: string;
  allowIndividualGateways?: boolean;
  /** Leaves out the internet option, for apps that can only be reached through a gateway. */
  required?: boolean;
  noGatewayLabel?: string;
}) => {
  const orgId = useOrgId();
  const networking = useV4Adapter("networking");
  const { data: org } = useV4Adapter("org").useOrganization(orgId);
  const { data: subscription } = networking.useSubscription(orgId);
  const requireGatewayPools = Boolean(org?.requireGatewayPools);
  const isPoolRequired = requireGatewayPools && !allowIndividualGateways;
  const showPools = Boolean(subscription?.gatewayPool) || requireGatewayPools;
  const { data: connected, isPending: gatewaysPending } = networking.useConnectedGateways();
  const { data: allGateways } = networking.useGateways();
  const { data: pools, isPending: poolsPending } = networking.usePools({ enabled: showPools });

  const listed = (connected ?? []).filter((gateway) => gateway.id !== excludeGatewayId);
  const unlistedSelected =
    value.gatewayId && !listed.some((gateway) => gateway.id === value.gatewayId)
      ? allGateways?.find((gateway) => gateway.id === value.gatewayId)
      : undefined;
  const gateways = unlistedSelected ? [unlistedSelected, ...listed] : listed;

  let selected = required ? "" : "internet";
  if (value.gatewayPoolId) selected = `pool:${value.gatewayPoolId}`;
  else if (value.gatewayId) selected = `gateway:${value.gatewayId}`;

  return (
    <Select
      id={id}
      label={label}
      value={selected}
      invalid={invalid}
      disabled={disabled || gatewaysPending || (showPools && poolsPending)}
      placeholder="Select gateway"
      options={[
        ...(required ? [] : [{ value: "internet", label: noGatewayLabel }]),
        ...(showPools ? (pools ?? []) : []).map((pool) => ({
          value: `pool:${pool.id}`,
          label: pool.name,
          description:
            pool.memberCount === 0
              ? "No members"
              : `${pool.healthyMemberCount}/${pool.memberCount} healthy`,
          group: "Gateway pools"
        })),
        ...gateways.map((gateway) => {
          const blocked = isPoolRequired && gateway.id !== value.gatewayId;
          const health = isGatewayHealthy(gateway) ? "Online" : "Offline";
          return {
            value: `gateway:${gateway.id}`,
            label: gateway.name,
            description: blocked ? POOL_REQUIRED_REASON : health,
            disabled: blocked,
            group: "Individual gateways"
          };
        })
      ]}
      onValueChange={(next) => {
        if (!next || next === selected) return;
        if (next === "internet") onChange({ gatewayId: null, gatewayPoolId: null });
        else if (next.startsWith("pool:"))
          onChange({ gatewayId: null, gatewayPoolId: next.slice("pool:".length) });
        else onChange({ gatewayId: next.slice("gateway:".length), gatewayPoolId: null });
      }}
    />
  );
};
