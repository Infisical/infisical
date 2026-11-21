import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Select } from "@infisical/cipher/ui/select";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";
import type { THsmConnector } from "@app/hooks/api/hsmConnectors/types";
import { slugSchema } from "@app/lib/schemas";

import { useV4Adapter } from "../../data/adapters";
import type { HsmPlan } from "../../data/cert-manager-settings/contract-hsm";
import { orgHref, useGo } from "../../links";

export const HSM_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/pki/settings/hsm-connectors";

export const DEFAULT_KEY_PREFIX = "infisical-";

export const nameSchema = slugSchema({ min: 1, max: 32, field: "Name" });
export const descriptionSchema = z
  .string()
  .trim()
  .max(256, "Use 256 characters or fewer")
  .optional();
export const routeSchema = z.string().min(1, "Pick a gateway that can reach your HSM");
export const slotLabelSchema = z
  .string()
  .min(1, "Enter the slot label")
  .max(128, "Use 128 characters or fewer");
export const pinSchema = z.string().min(1, "Enter the PIN").max(512, "Use 512 characters or fewer");
export const keyPrefixSchema = z.string().trim().max(64, "Use 64 characters or fewer").optional();

export const firstIssue = (schema: z.ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

export const routeOf = (connector: Pick<THsmConnector, "gatewayId" | "gatewayPoolId">) => {
  if (connector.gatewayId) return `gateway:${connector.gatewayId}`;
  if (connector.gatewayPoolId) return `pool:${connector.gatewayPoolId}`;
  return "";
};

export const routeIds = (route: string) => {
  const [kind, id] = route.split(":");
  return {
    gatewayId: kind === "gateway" ? id : undefined,
    gatewayPoolId: kind === "pool" ? id : undefined
  };
};

const isHsmCapable = (gateway: TGatewayV2) => gateway.capabilities?.pkcs11 === true;

export const useHsmRoutes = (plan: HsmPlan, selected: string) => {
  const adapter = useV4Adapter("certManagerSettings");
  const showPools = plan.gatewayPool || plan.requireGatewayPools;
  const selectedGatewayId = routeIds(selected).gatewayId;
  const gatewaysQuery = adapter.useHsmGateways();
  const allGateways = adapter.useHsmAllGateways({ enabled: Boolean(selectedGatewayId) }).data;
  const poolsQuery = adapter.useHsmGatewayPools({ enabled: showPools });
  const listed = (gatewaysQuery.data ?? []).filter(
    (gateway) => isHsmCapable(gateway) || gateway.id === selectedGatewayId
  );
  const unlisted =
    selectedGatewayId && !listed.some((gateway) => gateway.id === selectedGatewayId)
      ? allGateways?.find((gateway) => gateway.id === selectedGatewayId)
      : undefined;
  const gateways = unlisted ? [unlisted, ...listed] : listed;
  const pools = showPools ? (poolsQuery.data ?? []) : [];
  const isPending = gatewaysQuery.isPending || (showPools && poolsQuery.isPending);
  const hasUsableRoute = plan.requireGatewayPools
    ? pools.length > 0
    : pools.length > 0 || gateways.some(isHsmCapable);
  return { gateways, pools, isPending, hasUsableRoute };
};

export const HsmRoutePicker = ({
  plan,
  value,
  onChange,
  invalid,
  id
}: {
  plan: HsmPlan;
  value: string;
  onChange: (route: string) => void;
  invalid?: boolean;
  id?: string;
}) => {
  const { gateways, pools, isPending } = useHsmRoutes(plan, value);
  return (
    <Select
      id={id}
      value={value}
      disabled={isPending}
      invalid={invalid}
      placeholder="Select a gateway or gateway pool"
      options={[
        ...pools.map((pool) => ({
          value: `pool:${pool.id}`,
          label: pool.name,
          description: `${pool.healthyMemberCount} of ${pool.memberCount} gateways healthy`,
          group: "Gateway pools"
        })),
        ...gateways.map((gateway) => {
          const blocked = plan.requireGatewayPools && value !== `gateway:${gateway.id}`;
          const health = isGatewayHealthy(gateway) ? "Online" : "Offline";
          return {
            value: `gateway:${gateway.id}`,
            label: gateway.name,
            description: blocked ? "Your organization requires a gateway pool" : health,
            disabled: blocked,
            group: "Individual gateways"
          };
        })
      ]}
      onValueChange={(next) => {
        if (next && next !== value) onChange(next);
      }}
    />
  );
};

export const NoHsmRouteNotice = ({ orgId, plan }: { orgId: string; plan: HsmPlan }) => {
  const go = useGo();
  if (plan.requireGatewayPools)
    return (
      <Alert
        tone="info"
        title="No gateway pools exist yet"
        actions={
          <Button variant="link" asChild>
            <Link
              {...go.link(
                orgHref(orgId, "/networking?selectedTab=gateways&gatewayView=gateway-pools")
              )}
            >
              Create a pool in Networking
            </Link>
          </Button>
        }
      >
        Your organization requires HSM connectors to use a gateway pool. Add gateways with PKCS#11
        support to a pool, then come back to select it.
      </Alert>
    );
  return (
    <Alert
      tone="info"
      title="No gateways can reach an HSM yet"
      actions={
        <Button variant="link" asChild>
          <a href={HSM_DOCS_URL} target="_blank" rel="noreferrer">
            Read the setup guide
          </a>
        </Button>
      }
    >
      A gateway with PKCS#11 support must run on a machine that can reach your HSM. Someone with
      network and infrastructure access sets this up.
    </Alert>
  );
};
