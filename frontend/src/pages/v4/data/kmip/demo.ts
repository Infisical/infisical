import { useRouterState } from "@tanstack/react-router";

import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { KmipPermission, type TKmipClient } from "@app/hooks/api/kmip/types";
import type {
  TKmipServerAuthMethodView,
  TKmipServerWithAuthMethod
} from "@app/hooks/api/kmipServers/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { KmipAdapter } from "./contract";

const SCENARIOS = ["default", "empty", "loading", "error", "no-plan"] as const;
type KmipScenario = (typeof SCENARIOS)[number];

const useKmipScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

class DemoError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const server = (
  id: string,
  name: string,
  createdAt: string,
  authMethod: TKmipServerAuthMethodView,
  extra: Partial<TKmipServerWithAuthMethod> = {}
): TKmipServerWithAuthMethod => ({
  id,
  name,
  orgId: V4_DEMO_ORG_ID,
  createdAt,
  updatedAt: createdAt,
  hostnamesOrIps: "kmip.acme.internal, 10.0.4.12",
  ttl: null,
  keyAlgorithm: CertKeyAlgorithm.RSA_2048,
  canRevoke: true,
  authMethod,
  ...extra
});

const client = (
  id: string,
  name: string,
  description: string,
  permissions: KmipPermission[]
): TKmipClient => ({ id, name, description, permissions, projectId: "kms-keys" });

type KmipState = { servers: TKmipServerWithAuthMethod[]; clients: TKmipClient[] };

const store = createFixtureStore<KmipState>({
  servers: [
    server("6d1f0c2a-4b7e-4a9d-8c31-2f5e7a90b4c8", "prod-kmip-us-east", "2026-03-14T10:22:00Z", {
      method: "token",
      config: {}
    }),
    server(
      "a83e5b17-92cd-4f60-b1e4-7c0d6f2a9e53",
      "vmware-vsan-encryption",
      "2026-05-02T08:05:00Z",
      {
        method: "aws",
        config: {
          id: "aws-1",
          allowedPrincipalArns: "arn:aws:iam::123456789012:role/kmip-host",
          allowedAccountIds: "123456789012",
          createdAt: "2026-05-02T08:05:00Z",
          updatedAt: "2026-05-02T08:05:00Z"
        }
      },
      { hostnamesOrIps: "kmip.vsan.acme.internal", keyAlgorithm: CertKeyAlgorithm.ECDSA_P256 }
    ),
    server(
      "f2c94a6e-1d38-4b75-9e0a-5b8c3d7f1a26",
      "legacy-mongodb-kmip",
      "2025-08-19T15:40:00Z",
      { method: "identity", config: { identityId: "id-1", identityName: "kmip-legacy" } },
      { hostnamesOrIps: null, keyAlgorithm: null, canRevoke: false }
    )
  ],
  clients: [
    client("3b7a1e90-5c2d-4f84-a6e1-9d0c8b2f7a45", "mongodb-atlas", "Encrypted storage engine", [
      KmipPermission.Create,
      KmipPermission.Get,
      KmipPermission.Locate,
      KmipPermission.Activate
    ]),
    client("8e4d2c71-0a9b-4e36-b5f8-1c7a3d9e6b02", "vsan-cluster-a", "", [
      KmipPermission.Create,
      KmipPermission.Get,
      KmipPermission.GetAttributes,
      KmipPermission.Destroy,
      KmipPermission.Revoke
    ]),
    client("c19f6b38-7e2a-4d05-8b9c-4a1e0f5d3c67", "idrac-rack-12", "Dell iDRAC disk encryption", [
      KmipPermission.Register,
      KmipPermission.Get,
      KmipPermission.Check
    ])
  ]
});

const empty: KmipState = { servers: [], clients: [] };

const useState = () => {
  const scenario = useKmipScenario();
  const state = store.use();
  return { scenario, state: scenario === "empty" ? empty : state };
};

const result = <T>(scenario: KmipScenario, data: T | undefined, what: string) => {
  if (scenario === "loading") return { data: undefined, isPending: true, error: null };
  if (scenario === "error")
    return {
      data: undefined,
      isPending: false,
      error: new DemoError(`Failed to load ${what}`, 500)
    };
  return {
    data,
    isPending: false,
    error: data === undefined ? new DemoError(`${what} not found`, 404) : null
  };
};

const update = (
  id: string,
  change: (current: TKmipServerWithAuthMethod) => TKmipServerWithAuthMethod
) => {
  let next: TKmipServerWithAuthMethod | undefined;
  store.update((state) => ({
    ...state,
    servers: state.servers.map((entry) => {
      if (entry.id !== id) return entry;
      next = change(entry);
      return next;
    })
  }));
  if (!next) throw new DemoError("KMIP server not found", 404);
  return next;
};

const demoToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

const demoPem = (label: string) =>
  `-----BEGIN ${label}-----\nMIIDazCCAlOgAwIBAgIUQ0lNRGVtb0NlcnRpZmljYXRlRm9yS01JUENsaWVudDAN\nBgkqhkiG9w0BAQsFADBFMQswCQYDVQQGEwJVUzETMBEGA1UECAwKU29tZS1TdGF0\n-----END ${label}-----`;

export const kmipDemo: KmipAdapter = {
  useHasKmipPlan: () => {
    const scenario = useKmipScenario();
    return { data: scenario !== "no-plan", isPending: false, error: null };
  },
  useServers: () => {
    const { scenario, state } = useState();
    return result(scenario, state.servers, "KMIP servers");
  },
  useServer: (kmipServerId) => {
    const { scenario, state } = useState();
    return result(
      scenario,
      state.servers.find((entry) => entry.id === kmipServerId),
      "KMIP server"
    );
  },
  useCreateServer: fixtureMutation((dto) => {
    const created = server(
      crypto.randomUUID(),
      dto.name,
      new Date().toISOString(),
      {
        method: "token",
        config: {}
      },
      {
        hostnamesOrIps: dto.hostnamesOrIps,
        keyAlgorithm: dto.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048
      }
    );
    store.update((state) => ({ ...state, servers: [...state.servers, created] }));
    return created;
  }),
  useUpdateServer: fixtureMutation(({ kmipServerId, authMethod, hostnamesOrIps, keyAlgorithm }) =>
    update(kmipServerId, (current) => {
      let nextAuth = current.authMethod;
      if (authMethod?.method === "token") nextAuth = { method: "token", config: {} };
      if (authMethod?.method === "aws")
        nextAuth = {
          method: "aws",
          config: {
            id: "aws-demo",
            allowedPrincipalArns: authMethod.allowedPrincipalArns,
            allowedAccountIds: authMethod.allowedAccountIds,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString()
          }
        };
      return {
        ...current,
        hostnamesOrIps: hostnamesOrIps ?? current.hostnamesOrIps,
        keyAlgorithm: keyAlgorithm ?? current.keyAlgorithm,
        authMethod: nextAuth
      };
    })
  ),
  useDeleteServer: fixtureMutation((kmipServerId) =>
    store.update((state) => ({
      ...state,
      servers: state.servers.filter((entry) => entry.id !== kmipServerId)
    }))
  ),
  useGenerateEnrollmentToken: fixtureMutation(() => ({
    token: demoToken(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  })),
  useRevokeServerAccess: fixtureMutation(({ kmipServerId }) =>
    update(kmipServerId, (current) => current)
  ),
  useClients: ({
    projectId,
    offset = 0,
    limit = 100,
    search = "",
    orderDirection = OrderByDirection.ASC
  }) => {
    const { scenario, state } = useState();
    const needle = search.trim().toLowerCase();
    const matching = state.clients
      .filter((entry) => entry.projectId === projectId || projectId)
      .filter((entry) => entry.name.toLowerCase().includes(needle))
      .sort(
        (a, b) => a.name.localeCompare(b.name) * (orderDirection === OrderByDirection.ASC ? 1 : -1)
      );
    return result(
      scenario,
      { kmipClients: matching.slice(offset, offset + limit), totalCount: matching.length },
      "KMIP clients"
    );
  },
  useCreateClient: fixtureMutation(({ name, description, permissions, projectId }) => {
    const created: TKmipClient = {
      id: crypto.randomUUID(),
      name,
      description,
      permissions,
      projectId
    };
    store.update((state) => ({ ...state, clients: [...state.clients, created] }));
    return created;
  }),
  useUpdateClient: fixtureMutation(({ id, name, description, permissions }) => {
    let next: TKmipClient | undefined;
    store.update((state) => ({
      ...state,
      clients: state.clients.map((entry) => {
        if (entry.id !== id) return entry;
        next = {
          ...entry,
          name: name ?? entry.name,
          description: description ?? entry.description,
          permissions: permissions ?? entry.permissions
        };
        return next;
      })
    }));
    if (!next) throw new DemoError("KMIP client not found", 404);
    return next;
  }),
  useDeleteClient: fixtureMutation(({ id }) =>
    store.update((state) => ({
      ...state,
      clients: state.clients.filter((entry) => entry.id !== id)
    }))
  ),
  useGenerateClientCertificate: fixtureMutation(({ csr }) => ({
    serialNumber: "4f:1a:9c:22:7e:03:b8:d1",
    certificate: demoPem("CERTIFICATE"),
    certificateChain: demoPem("CERTIFICATE"),
    privateKey: csr ? undefined : demoPem("PRIVATE KEY")
  }))
};
