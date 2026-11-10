import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import type {
  THsmConnector,
  THsmConnectorTestMemberResult
} from "@app/hooks/api/hsmConnectors/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { CertManagerHsmAdapter } from "./contract-hsm";

const PROJECT_ID = "internal-pki";

const ready = <T>(data: T) => ({ data, isPending: false, error: null });

const gateway = (id: string, name: string, online: boolean, pkcs11: boolean): TGatewayV2 => ({
  id,
  name,
  identityId: "demo-identity",
  relayId: "demo-relay",
  createdAt: "2026-06-12T15:20:00Z",
  updatedAt: "2026-06-12T15:20:00Z",
  heartbeat: online ? new Date().toISOString() : "2026-11-02T08:14:00Z",
  heartbeatTTL: 60,
  directAddress: null,
  directHeartbeat: null,
  canRevoke: false,
  connectedResourcesCount: 0,
  identity: null,
  capabilities: pkcs11 ? { pkcs11: true } : {}
});

const gateways = () => [
  gateway("hsm-gateway-vancouver", "vancouver-dc-hsm", true, true),
  gateway("hsm-gateway-frankfurt", "frankfurt-dc-hsm", false, true),
  gateway("hsm-gateway-toronto", "toronto-dc-hsm", true, true),
  gateway("edge-gateway-us-west", "us-west-edge", true, false)
];

const pools: TGatewayPool[] = [
  {
    id: "hsm-pool-north-america",
    orgId: V4_DEMO_ORG_ID,
    name: "north-america-hsm",
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-01T10:00:00Z",
    memberCount: 2,
    healthyMemberCount: 2,
    memberGatewayIds: ["hsm-gateway-vancouver", "hsm-gateway-toronto"],
    connectedResourcesCount: 1
  }
];

const connector = (
  id: string,
  name: string,
  route: { gatewayId?: string; gatewayPoolId?: string },
  slotLabel: string,
  createdAt: string,
  description: string | null = null
): THsmConnector => ({
  id,
  name,
  description,
  projectId: PROJECT_ID,
  gatewayId: route.gatewayId ?? null,
  gatewayPoolId: route.gatewayPoolId ?? null,
  slotLabel,
  keyNamePrefix: "infisical-",
  createdAt,
  updatedAt: createdAt
});

const connectors = createFixtureStore<THsmConnector[]>([
  connector(
    "7c1e4a2b-9d3f-4e6a-8b5c-2f7d9e1a3c45",
    "luna-prod-root",
    { gatewayPoolId: "hsm-pool-north-america" },
    "pki-root-prod",
    "2026-07-08T18:30:00Z",
    "Signs the offline root and issuing CAs"
  ),
  connector(
    "2a9f6c3d-5e1b-4c8a-9f2e-6d4b8a0c1e73",
    "fortanix-eu",
    { gatewayId: "hsm-gateway-frankfurt" },
    "eu-issuing",
    "2026-08-21T09:05:00Z",
    "EU data residency keys"
  ),
  connector(
    "e4b8d2f6-1a3c-4b5d-8e7f-9a0b1c2d3e84",
    "yubihsm-code-signing",
    { gatewayId: "hsm-gateway-toronto" },
    "code-signing-01",
    "2026-10-14T21:40:00Z"
  )
]);

const byId = (connectorId: string) =>
  connectors.get().find((entry) => entry.id === connectorId) as THsmConnector;

const memberResult = (target: TGatewayV2): THsmConnectorTestMemberResult =>
  target.heartbeat && Date.now() - new Date(target.heartbeat).getTime() < 120_000
    ? {
        gatewayId: target.id,
        ok: true,
        slotInfo: { manufacturer: "Thales", model: "Luna Network HSM 7", firmware: "7.8.4" }
      }
    : {
        gatewayId: target.id,
        ok: false,
        errorCode: "GATEWAY_UNREACHABLE",
        errorMessage: `Gateway ${target.name} has not sent a heartbeat since Nov 2, 2026.`
      };

export const hsmDemo: CertManagerHsmAdapter = {
  useHsmPlan: () => ready({ hsm: true, gatewayPool: true, requireGatewayPools: false }),
  useHsmConnectors: () => ready(connectors.use()),
  useHsmGateways: () => ready(gateways()),
  useHsmAllGateways: () => ready(gateways()),
  useHsmGatewayPools: () => ready(pools),
  useCreateHsmConnector: fixtureMutation(
    ({ name, description, gatewayId, gatewayPoolId, credentials }) => {
      const created = {
        ...connector(
          crypto.randomUUID(),
          name,
          { gatewayId, gatewayPoolId },
          credentials.slotLabel,
          new Date().toISOString(),
          description ?? null
        ),
        keyNamePrefix: credentials.keyNamePrefix ?? null
      };
      connectors.update((entries) => [...entries, created]);
      return created;
    }
  ),
  useUpdateHsmConnector: fixtureMutation(
    ({ connectorId, name, description, gatewayId, gatewayPoolId, credentials }) => {
      connectors.update((entries) =>
        entries.map((entry) =>
          entry.id === connectorId
            ? {
                ...entry,
                name: name ?? entry.name,
                description: description === undefined ? entry.description : description || null,
                gatewayId: gatewayId ?? (gatewayPoolId ? null : entry.gatewayId),
                gatewayPoolId: gatewayPoolId ?? (gatewayId ? null : entry.gatewayPoolId),
                slotLabel: credentials?.slotLabel ?? entry.slotLabel,
                keyNamePrefix:
                  credentials?.keyNamePrefix === undefined
                    ? entry.keyNamePrefix
                    : credentials.keyNamePrefix || null,
                updatedAt: new Date().toISOString()
              }
            : entry
        )
      );
      return byId(connectorId);
    }
  ),
  useDeleteHsmConnector: fixtureMutation(({ connectorId }) => {
    connectors.update((entries) => entries.filter((entry) => entry.id !== connectorId));
    return { id: connectorId };
  }),
  useTestHsmConnector: fixtureMutation(({ connectorId }) => {
    const target = byId(connectorId);
    const all = gateways();
    const pool = pools.find((entry) => entry.id === target.gatewayPoolId);
    const members = all
      .filter((entry) =>
        pool ? pool.memberGatewayIds.includes(entry.id) : entry.id === target.gatewayId
      )
      .map(memberResult);
    return { ok: members.length > 0 && members.every((member) => member.ok), members };
  })
};
