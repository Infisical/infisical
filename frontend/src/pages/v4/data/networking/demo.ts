import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import type {
  GatewayAuthMethodView,
  SettableAuthMethodInput,
  TGatewayConnectedResources,
  TGatewayV2WithAuthMethod
} from "@app/hooks/api/gateways-v2/types";
import type { TRelayConnectedGateway } from "@app/hooks/api/relays/queries";
import type { TRelayAuthMethodView, TRelayWithAuthMethod } from "@app/hooks/api/relays/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { NetworkingAdapter } from "./contract";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 1440);
const stamp = { createdAt: daysAgo(0), updatedAt: daysAgo(0) };
const id = () => crypto.randomUUID();

const authConfig = (input: SettableAuthMethodInput): GatewayAuthMethodView => {
  if (input.method === "aws") return { method: "aws", config: { id: id(), ...stamp, ...input } };
  if (input.method === "gcp") return { method: "gcp", config: { id: id(), ...stamp, ...input } };
  if (input.method === "kubernetes")
    return {
      method: "kubernetes",
      config: {
        id: id(),
        ...stamp,
        kubernetesHost: input.kubernetesHost ?? "",
        allowedNamespaces: input.allowedNamespaces,
        allowedNames: input.allowedNames,
        allowedAudience: input.allowedAudience ?? "",
        verifyTlsCertificate: input.verifyTlsCertificate ?? true,
        caCertificate: input.caCertificate ?? "",
        hasTokenReviewerJwt: Boolean(input.tokenReviewerJwt),
        tokenReviewMode: input.tokenReviewMode ?? "api",
        gatewayId: input.gatewayId ?? null,
        gatewayPoolId: input.gatewayPoolId ?? null
      }
    };
  return { method: "token", config: {} };
};

const gateway = (
  gatewayId: string,
  name: string,
  createdAt: string,
  extra: Partial<TGatewayV2WithAuthMethod> = {}
): TGatewayV2WithAuthMethod => ({
  id: gatewayId,
  identityId: null,
  relayId: null,
  name,
  createdAt,
  updatedAt: createdAt,
  heartbeat: null,
  heartbeatTTL: null,
  directAddress: null,
  directHeartbeat: null,
  canRevoke: false,
  connectedResourcesCount: 0,
  identity: null,
  authMethod: { method: "token", config: {} },
  ...extra
});

const RELAY_US = "7a4c1e92-3b5d-4f60-8e21-9d0c6b3a5f14";
const RELAY_EU = "c2e8a0f7-61d4-4b9a-a3e5-2f7b8c1d9e06";
const RELAY_MANAGED = "e5f1b3c9-0a2d-4e7f-b6c8-1d3a5e7f9b20";

const gateways = createFixtureStore<TGatewayV2WithAuthMethod[]>([
  gateway("3f9a2c71-8e4b-4d15-a6c0-5b7e1d2f8a93", "prod-us-east", daysAgo(64), {
    relayId: RELAY_US,
    directAddress: "gateway.us-east.internal:8443",
    heartbeat: minutesAgo(1),
    directHeartbeat: minutesAgo(1),
    heartbeatTTL: 180,
    canRevoke: true,
    connectedResourcesCount: 6,
    authMethod: authConfig({
      method: "aws",
      allowedPrincipalArns: "arn:aws:iam::441789203316:role/infisical-gateway",
      allowedAccountIds: "441789203316"
    })
  }),
  gateway("b81d4e06-2c9f-47a3-9e5b-0f6a3c8d1e27", "prod-eu-west", daysAgo(41), {
    relayId: RELAY_EU,
    heartbeat: minutesAgo(2),
    heartbeatTTL: 180,
    canRevoke: true,
    connectedResourcesCount: 3,
    authMethod: authConfig({
      method: "kubernetes",
      kubernetesHost: "https://k8s.eu-west.internal:6443",
      allowedNamespaces: "infisical-gateway",
      allowedNames: "infisical-gateway",
      allowedAudience: "",
      verifyTlsCertificate: true,
      caCertificate: "",
      tokenReviewMode: "api"
    })
  }),
  gateway("5c2e7a18-9d3b-4f60-b1e4-7a8c0d2e6f35", "staging-gcp", daysAgo(19), {
    directAddress: "10.20.4.12:8443",
    directHeartbeat: minutesAgo(48),
    heartbeatTTL: 180,
    canRevoke: true,
    connectedResourcesCount: 1,
    authMethod: authConfig({
      method: "gcp",
      type: "gce",
      allowedServiceAccounts: "gateway@infisical-staging.iam.gserviceaccount.com",
      allowedProjects: "infisical-staging",
      allowedZones: ""
    })
  }),
  gateway("9e4f0b23-6a1c-4d87-8f2e-3b5d7c9a0e41", "dr-us-west", daysAgo(3), {
    relayId: RELAY_US,
    heartbeat: minutesAgo(1),
    heartbeatTTL: 180,
    canRevoke: true
  }),
  gateway("1d7b3e95-4f2a-4c68-9b0d-6e8f2a4c7b13", "edge-lab", daysAgo(0))
]);

const pools = createFixtureStore<Omit<TGatewayPool, "memberCount" | "healthyMemberCount">[]>([
  {
    id: "4a8e2c60-1b7d-4f39-a5e0-8c3b6d9f2e17",
    orgId: V4_DEMO_ORG_ID,
    name: "us-primary",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    memberGatewayIds: [
      "3f9a2c71-8e4b-4d15-a6c0-5b7e1d2f8a93",
      "9e4f0b23-6a1c-4d87-8f2e-3b5d7c9a0e41"
    ],
    connectedResourcesCount: 4
  },
  {
    id: "d3f6a9b2-7c0e-4815-b2d4-9e1a3c5f7b08",
    orgId: V4_DEMO_ORG_ID,
    name: "eu-failover",
    createdAt: daysAgo(12),
    updatedAt: daysAgo(12),
    memberGatewayIds: [
      "b81d4e06-2c9f-47a3-9e5b-0f6a3c8d1e27",
      "5c2e7a18-9d3b-4f60-b1e4-7a8c0d2e6f35"
    ],
    connectedResourcesCount: 0
  }
]);

const relayAuth = (input: SettableAuthMethodInput | undefined): TRelayAuthMethodView =>
  input?.method === "aws"
    ? { method: "aws", config: { id: id(), ...stamp, ...input } }
    : { method: "token", config: {} };

const relays = createFixtureStore<TRelayWithAuthMethod[]>([
  {
    id: RELAY_US,
    orgId: V4_DEMO_ORG_ID,
    identityId: null,
    name: "relay-us-east",
    host: "relay.us-east.acme.dev",
    heartbeat: minutesAgo(4),
    createdAt: daysAgo(70),
    updatedAt: daysAgo(70),
    canRevoke: true,
    authMethod: relayAuth({
      method: "aws",
      allowedPrincipalArns: "arn:aws:iam::441789203316:role/infisical-relay",
      allowedAccountIds: "441789203316"
    })
  },
  {
    id: RELAY_EU,
    orgId: V4_DEMO_ORG_ID,
    identityId: null,
    name: "relay-eu-west",
    host: "10.40.0.5",
    heartbeat: minutesAgo(190),
    createdAt: daysAgo(44),
    updatedAt: daysAgo(44),
    canRevoke: true,
    authMethod: relayAuth({ method: "token" })
  },
  {
    id: RELAY_MANAGED,
    orgId: null,
    identityId: null,
    name: "infisical-us",
    host: "relay.infisical.com",
    heartbeat: minutesAgo(2),
    createdAt: daysAgo(400),
    updatedAt: daysAgo(400),
    canRevoke: false,
    authMethod: relayAuth({ method: "token" })
  }
]);

const healthy = (gw: TGatewayV2WithAuthMethod) =>
  Boolean(gw.heartbeatTTL) &&
  [gw.directAddress && gw.directHeartbeat, gw.relayId && gw.heartbeat].some(
    (probe) => probe && Date.now() - new Date(probe).getTime() < 210_000
  );

const usePoolRows = () => {
  const all = gateways.use();
  return pools.use().map((pool) => {
    const members = all.filter((gw) => pool.memberGatewayIds.includes(gw.id));
    return {
      ...pool,
      memberGatewayIds: members.map((gw) => gw.id),
      memberCount: members.length,
      healthyMemberCount: members.filter(healthy).length
    };
  });
};

const resources: TGatewayConnectedResources = {
  appConnections: [
    { id: id(), name: "aws-production", app: "aws", projectId: null, projectName: null },
    { id: id(), name: "postgres-billing", app: "postgres", projectId: "p1", projectName: "Billing" }
  ],
  dynamicSecrets: [
    {
      id: id(),
      name: "billing-db-readonly",
      folderId: id(),
      projectId: "billing",
      projectName: "Billing",
      environmentSlug: "prod"
    }
  ],
  kubernetesAuths: [{ id: id(), identityId: "k8s-operator", identityName: "k8s-operator" }],
  pkiDiscoveryConfigs: [
    { id: id(), name: "internal-tls-scan", projectId: "pki", projectName: "PKI" }
  ],
  pamAccounts: [
    { id: id(), name: "prod-postgres-admin", accountType: "postgres", folderName: "Databases" }
  ],
  pamAccountTemplates: []
};

const noResources: TGatewayConnectedResources = {
  appConnections: [],
  dynamicSecrets: [],
  kubernetesAuths: [],
  pkiDiscoveryConfigs: [],
  pamAccounts: [],
  pamAccountTemplates: []
};

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const updateGateway = (gatewayId: string, change: Partial<TGatewayV2WithAuthMethod>) => {
  gateways.update((all) => all.map((gw) => (gw.id === gatewayId ? { ...gw, ...change } : gw)));
  return gateways.get().find((gw) => gw.id === gatewayId) as TGatewayV2WithAuthMethod;
};

const updateRelay = (relayId: string, change: Partial<TRelayWithAuthMethod>) => {
  relays.update((all) =>
    all.map((relay) => (relay.id === relayId ? { ...relay, ...change } : relay))
  );
  return relays.get().find((relay) => relay.id === relayId) as TRelayWithAuthMethod;
};

const enrollment = () => ({
  token: `gwe_${id().replace(/-/g, "")}`,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString()
});

export const networkingDemo: NetworkingAdapter = {
  useSubscription: () => ok({ gatewayPool: true } as SubscriptionPlan),
  useGateways: () => ok(gateways.use()),
  useConnectedGateways: () => ok(gateways.use().filter((gw) => gw.heartbeat || gw.directHeartbeat)),
  useGateway: (gatewayId) => ok(gateways.use().find((gw) => gw.id === gatewayId)),
  useGatewayResources: (gatewayId) =>
    ok(
      (gateways.use().find((gw) => gw.id === gatewayId)?.connectedResourcesCount ?? 0) > 0
        ? resources
        : noResources
    ),
  useCreateGateway: fixtureMutation(({ name, authMethod }) => {
    const created = gateway(id(), name, new Date().toISOString(), {
      authMethod: authConfig(authMethod)
    });
    gateways.update((all) => [...all, created]);
    return created;
  }),
  useUpdateGateway: fixtureMutation(({ gatewayId, name, authMethod }) =>
    updateGateway(gatewayId, {
      ...(name ? { name } : {}),
      ...(authMethod ? { authMethod: authConfig(authMethod) } : {})
    })
  ),
  useDeleteGateway: fixtureMutation((gatewayId: string) => {
    gateways.update((all) => all.filter((gw) => gw.id !== gatewayId));
    pools.update((all) =>
      all.map((pool) => ({
        ...pool,
        memberGatewayIds: pool.memberGatewayIds.filter((member) => member !== gatewayId)
      }))
    );
  }),
  useTriggerGatewayHeartbeat: fixtureMutation((gatewayId: string) => {
    const gw = gateways.get().find((entry) => entry.id === gatewayId);
    if (!gw || !healthy(gw)) throw new Error("Gateway is unreachable");
  }),
  useMintGatewayToken: fixtureMutation(() => enrollment()),
  useRevokeGateway: fixtureMutation(({ gatewayId }) => {
    updateGateway(gatewayId, { heartbeat: null, directHeartbeat: null, canRevoke: false });
  }),
  usePools: () => ok(usePoolRows()),
  usePoolResources: (poolId) =>
    ok(
      poolId === pools.get()[0]?.id
        ? {
            kubernetesAuths: resources.kubernetesAuths,
            pkiDiscoveryConfigs: resources.pkiDiscoveryConfigs,
            appConnections: resources.appConnections.map((connection) => ({
              ...connection,
              projectId: connection.projectId ?? null,
              projectName: connection.projectName ?? null
            })),
            dynamicSecrets: resources.dynamicSecrets.map((secret) => ({
              ...secret,
              type: "postgres"
            }))
          }
        : { kubernetesAuths: [], pkiDiscoveryConfigs: [], appConnections: [], dynamicSecrets: [] }
    ),
  useCreatePool: fixtureMutation(({ name }) => {
    const created = {
      id: id(),
      orgId: V4_DEMO_ORG_ID,
      name,
      ...stamp,
      memberGatewayIds: [],
      connectedResourcesCount: 0
    };
    pools.update((all) => [...all, created]);
    return { ...created, memberCount: 0, healthyMemberCount: 0 };
  }),
  useUpdatePool: fixtureMutation(({ poolId, name }) => {
    pools.update((all) =>
      all.map((pool) => (pool.id === poolId && name ? { ...pool, name } : pool))
    );
    const pool = pools.get().find((entry) => entry.id === poolId);
    return { ...pool, memberCount: 0, healthyMemberCount: 0 } as TGatewayPool;
  }),
  useDeletePool: fixtureMutation((poolId: string) => {
    pools.update((all) => all.filter((pool) => pool.id !== poolId));
  }),
  useAddGatewayToPool: fixtureMutation(({ poolId, gatewayId }) => {
    pools.update((all) =>
      all.map((pool) =>
        pool.id === poolId
          ? { ...pool, memberGatewayIds: [...pool.memberGatewayIds, gatewayId] }
          : pool
      )
    );
  }),
  useRemoveGatewayFromPool: fixtureMutation(({ poolId, gatewayId }) => {
    pools.update((all) =>
      all.map((pool) =>
        pool.id === poolId
          ? {
              ...pool,
              memberGatewayIds: pool.memberGatewayIds.filter((member) => member !== gatewayId)
            }
          : pool
      )
    );
  }),
  useRelays: () => ok(relays.use()),
  useRelay: (relayId) => ok(relays.use().find((relay) => relay.id === relayId)),
  useRelayGateways: (relayId) =>
    ok(
      gateways
        .use()
        .filter((gw) => gw.relayId === relayId)
        .map((gw): TRelayConnectedGateway => ({
          id: gw.id,
          name: gw.name,
          createdAt: gw.createdAt,
          heartbeat: gw.heartbeat
        }))
    ),
  useCreateRelay: fixtureMutation(({ name, host, authMethod }) => {
    const created: TRelayWithAuthMethod = {
      id: id(),
      orgId: V4_DEMO_ORG_ID,
      identityId: null,
      name,
      host,
      heartbeat: "",
      ...stamp,
      canRevoke: false,
      authMethod: relayAuth(authMethod)
    };
    relays.update((all) => [...all, created]);
    return created;
  }),
  useUpdateRelay: fixtureMutation(({ relayId, host, authMethod }) =>
    updateRelay(relayId, {
      ...(host ? { host } : {}),
      ...(authMethod ? { authMethod: relayAuth(authMethod) } : {})
    })
  ),
  useDeleteRelay: fixtureMutation((relayId: string) => {
    relays.update((all) => all.filter((relay) => relay.id !== relayId));
  }),
  useMintRelayToken: fixtureMutation(() => enrollment()),
  useRevokeRelay: fixtureMutation(({ relayId }) => {
    updateRelay(relayId, { heartbeat: "", canRevoke: false });
  })
};
