/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, no-template-curly-in-string */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { safeRequestMock } = vi.hoisted(() => ({
  safeRequestMock: vi.fn()
}));

vi.mock("@app/lib/validator/safe-request", () => ({
  safeRequest: { request: (...args: unknown[]) => (safeRequestMock as any)(...args) },
  getSharedHttpsAgent: vi.fn()
}));
vi.mock("@app/lib/config/request", () => ({ request: { request: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (url: string) => url
}));
vi.mock("@app/lib/crypto", () => ({ crypto: {} }));
vi.mock("@app/lib/gateway-v2/types", () => ({ GatewayProxyProtocol: { Tcp: "tcp", Http: "http" } }));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({ withGatewayV2Proxy: vi.fn() }));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => ["host"])
}));
// Without a key schema every variable on the stack counts as managed by the sync
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: (_key: string, _environment: string, schema?: string) => !schema
}));

/* eslint-disable import/first */
import { PortainerStackType } from "@app/services/app-connection/portainer";

import { SecretSyncError } from "../secret-sync-errors";
import {
  areEnvVarsEqual,
  buildPortainerGitUpdatePayload,
  decodePortainerEnvValue,
  encodePortainerEnvValue,
  PortainerSyncFns
} from "./portainer-sync-fns";
/* eslint-enable import/first */

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn() };

const secretSync = {
  connection: {
    credentials: { instanceUrl: "https://portainer.example.com", apiToken: "token" },
    gatewayId: null,
    gatewayPoolId: null
  },
  destinationConfig: { environmentId: 1, stackId: 4 },
  environment: { slug: "prod" },
  syncOptions: { disableSecretDeletion: false }
} as any;

const payloadOf = (secrets: Record<string, string>) => ({
  flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
});

const fileStack = (overrides: Record<string, unknown> = {}) => ({
  Id: 4,
  Name: "web",
  Type: PortainerStackType.Compose,
  EndpointId: 1,
  Env: [{ name: "A", value: "1" }],
  Option: { Prune: true },
  ...overrides
});

const gitStack = (overrides: Record<string, unknown> = {}) =>
  fileStack({
    WorkflowID: 7,
    GitSourceId: 3,
    GitConfig: { URL: "https://git.example.com/repo.git", ReferenceName: "refs/heads/main" },
    AutoUpdate: { Interval: "5m", Webhook: "" },
    ...overrides
  });

// Resolves each request by HTTP method and path; later entries for the same key answer later calls,
// and an Error entry is thrown instead of returned
const respondWith = (responses: Record<string, unknown[]>) => {
  const remaining = Object.fromEntries(Object.entries(responses).map(([key, values]) => [key, [...values]]));

  safeRequestMock.mockImplementation(async ({ method, url }: { method: string; url: string }) => {
    const key = `${method} ${new URL(url).pathname}`;
    const queue = remaining[key];
    if (!queue?.length) throw new Error(`Unexpected request ${key}`);

    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;

    return { data: next };
  });
};

const portainerError = (status: number, message: string, details: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { message, details } }
  });

type TRequestConfig = { method: string; url: string; params?: Record<string, string>; data?: unknown };

const requestConfigs = () => safeRequestMock.mock.calls.map((call: any[]) => call[0] as TRequestConfig);

const requestsMade = () =>
  requestConfigs().map((config) => {
    const url = new URL(config.url);
    const query = new URLSearchParams(config.params).toString();
    return `${config.method} ${url.pathname}${query ? `?${query}` : ""}`;
  });

describe("encodePortainerEnvValue / decodePortainerEnvValue", () => {
  it("quotes and escapes a multiline value for a Compose stack", () => {
    const encoded = encodePortainerEnvValue('line1\nline2 "quoted" back\\slash\r\n', PortainerStackType.Compose);

    expect(encoded).toBe('"line1\\nline2 \\"quoted\\" back\\\\slash\\r\\n"');
    expect(decodePortainerEnvValue(encoded, PortainerStackType.Compose)).toBe('line1\nline2 "quoted" back\\slash\r\n');
  });

  it("quotes values the dotenv parser would trim or cut short", () => {
    for (const value of [" leading", "trailing ", "abc #def", '"quoted"', "'single'"]) {
      const encoded = encodePortainerEnvValue(value, PortainerStackType.Compose);

      expect(encoded).not.toBe(value);
      expect(decodePortainerEnvValue(encoded, PortainerStackType.Compose)).toBe(value);
    }
    expect(encodePortainerEnvValue("abc #def", PortainerStackType.Compose)).toBe('"abc #def"');
  });

  it("doubles every dollar sign for a Compose stack so Compose does not expand it", () => {
    expect(encodePortainerEnvValue("pa$word", PortainerStackType.Compose)).toBe("pa$$word");
    expect(encodePortainerEnvValue("${HOME}/bin", PortainerStackType.Compose)).toBe("$${HOME}/bin");
    expect(encodePortainerEnvValue("cost: $5\n", PortainerStackType.Compose)).toBe('"cost: $$5\\n"');
    expect(encodePortainerEnvValue("pa$word", PortainerStackType.Swarm)).toBe("pa$word");

    for (const value of ["pa$word", "${HOME}/bin", "cost: $5\n", "$", "$$", "a\\$b"]) {
      const encoded = encodePortainerEnvValue(value, PortainerStackType.Compose);

      expect(decodePortainerEnvValue(encoded, PortainerStackType.Compose)).toBe(value);
    }
  });

  it("leaves single-line values and Swarm stacks untouched", () => {
    expect(encodePortainerEnvValue("plain", PortainerStackType.Compose)).toBe("plain");
    expect(encodePortainerEnvValue("no#space", PortainerStackType.Compose)).toBe("no#space");
    expect(encodePortainerEnvValue("abc #def", PortainerStackType.Swarm)).toBe("abc #def");
    expect(encodePortainerEnvValue("line1\nline2", PortainerStackType.Swarm)).toBe("line1\nline2");
    expect(decodePortainerEnvValue('"line1\\nline2"', PortainerStackType.Swarm)).toBe('"line1\\nline2"');
    expect(decodePortainerEnvValue("pa$$word", PortainerStackType.Swarm)).toBe("pa$$word");
  });

  it("does not unwrap a value a user quoted by hand or a reference a user wrote on purpose", () => {
    expect(decodePortainerEnvValue('"hello"', PortainerStackType.Compose)).toBe('"hello"');
    expect(decodePortainerEnvValue('"C:\\\\new"', PortainerStackType.Compose)).toBe('"C:\\\\new"');
    expect(decodePortainerEnvValue("$HOME/bin", PortainerStackType.Compose)).toBe("$HOME/bin");
    expect(decodePortainerEnvValue("pa$$word", PortainerStackType.Compose)).toBe("pa$word");
  });
});

describe("areEnvVarsEqual", () => {
  it("ignores order but not values or missing keys", () => {
    const current = [
      { name: "A", value: "1" },
      { name: "B", value: "2" }
    ];

    expect(
      areEnvVarsEqual(current, [
        { name: "B", value: "2" },
        { name: "A", value: "1" }
      ])
    ).toBe(true);
    expect(
      areEnvVarsEqual(current, [
        { name: "A", value: "1" },
        { name: "B", value: "changed" }
      ])
    ).toBe(false);
    expect(areEnvVarsEqual(current, [{ name: "A", value: "1" }])).toBe(false);
  });
});

describe("buildPortainerGitUpdatePayload", () => {
  it("references the Source and skips the deprecated repository fields when Portainer exposes one", () => {
    const payload = buildPortainerGitUpdatePayload(gitStack() as any, [{ name: "A", value: "1" }]);

    expect(payload).toEqual({
      env: [{ name: "A", value: "1" }],
      prune: true,
      repositoryReferenceName: "refs/heads/main",
      autoUpdate: { Interval: "5m", Webhook: "" },
      sourceID: 3
    });
  });

  it("echoes the stored authentication settings on releases without Sources so the credentials survive", () => {
    const stack = gitStack({
      WorkflowID: undefined,
      GitSourceId: undefined,
      GitConfig: {
        URL: "https://git.example.com/repo.git",
        ReferenceName: "refs/heads/main",
        TLSSkipVerify: true,
        Authentication: { Username: "deploy" }
      },
      AutoUpdate: { Interval: "", Webhook: "" },
      Option: null,
      Registries: [1, 2]
    });

    expect(buildPortainerGitUpdatePayload(stack as any, [])).toEqual({
      env: [],
      prune: false,
      repositoryReferenceName: "refs/heads/main",
      autoUpdate: null,
      registries: [1, 2],
      repositoryAuthentication: true,
      repositoryUsername: "deploy",
      tlsSkipVerify: true
    });
  });

  it("echoes a saved credential's ID and authorization type so Portainer keeps cloning with it", () => {
    const stack = gitStack({
      WorkflowID: undefined,
      GitSourceId: undefined,
      GitConfig: {
        URL: "https://git.example.com/repo.git",
        Authentication: { Username: "", GitCredentialID: 2, AuthorizationType: 1 }
      }
    });

    const payload = buildPortainerGitUpdatePayload(stack as any, []);

    expect(payload).toMatchObject({
      repositoryAuthentication: true,
      repositoryUsername: "",
      repositoryGitCredentialID: 2,
      repositoryAuthorizationType: 1
    });
    expect(payload).not.toHaveProperty("repositoryProvider");
    expect(payload).not.toHaveProperty("registries");
  });
});

describe("PortainerSyncFns", () => {
  beforeEach(() => {
    safeRequestMock.mockReset();
  });

  it("skips the update when the stack already holds the same variables", async () => {
    respondWith({
      "GET /api/stacks/4": [
        fileStack({
          Env: [
            { name: "A", value: "1" },
            { name: "B", value: "2" }
          ]
        })
      ]
    });

    await PortainerSyncFns.syncSecrets(
      secretSync,
      payloadOf({ B: "2", A: "1" }) as any,
      gatewayV2Service,
      gatewayPoolService
    );

    expect(requestsMade()).toEqual(["GET /api/stacks/4"]);
  });

  it("resubmits the compose file with the merged variables and the stack's Business Edition settings", async () => {
    respondWith({
      "GET /api/stacks/4": [fileStack({ Registries: [3], Webhook: "6f0c1c3e-0d3a-4b0e-9d5e-1c2b3a4d5e6f" })],
      "GET /api/stacks/4/file": [{ StackFileContent: "services: {}" }],
      "PUT /api/stacks/4": [{}]
    });

    await PortainerSyncFns.syncSecrets(
      secretSync,
      payloadOf({ B: "x\ny" }) as any,
      gatewayV2Service,
      gatewayPoolService
    );

    expect(requestsMade()).toEqual(["GET /api/stacks/4", "GET /api/stacks/4/file", "PUT /api/stacks/4?endpointId=1"]);

    const putConfig = requestConfigs().find((config) => config.method === "PUT");
    // A is managed by the sync (no key schema) and absent from the source, so it is dropped
    expect(putConfig?.data).toEqual({
      env: [{ name: "B", value: '"x\\ny"' }],
      stackFileContent: "services: {}",
      prune: true,
      registries: [3],
      webhook: "6f0c1c3e-0d3a-4b0e-9d5e-1c2b3a4d5e6f"
    });
  });

  it("keeps a stack variable named like an inherited object property when deletion is disabled", async () => {
    respondWith({
      "GET /api/stacks/4": [fileStack({ Env: [{ name: "constructor", value: "keep" }] })],
      "GET /api/stacks/4/file": [{ StackFileContent: "services: {}" }],
      "PUT /api/stacks/4": [{}]
    });

    await PortainerSyncFns.syncSecrets(
      { ...secretSync, syncOptions: { disableSecretDeletion: true } },
      payloadOf({ A: "1" }) as any,
      gatewayV2Service,
      gatewayPoolService
    );

    const putConfig = requestConfigs().find((config) => config.method === "PUT");
    // A Community Edition stack has no registries or webhook, so neither is sent
    expect(putConfig?.data).toEqual({
      env: [
        { name: "constructor", value: "keep" },
        { name: "A", value: "1" }
      ],
      stackFileContent: "services: {}",
      prune: true
    });
  });

  it("fails with Portainer's reason when the stack is still being deployed and lets the sync retry", async () => {
    respondWith({
      "GET /api/stacks/4": [fileStack()],
      "GET /api/stacks/4/file": [{ StackFileContent: "services: {}" }],
      "PUT /api/stacks/4": [portainerError(409, "Unable to update stack", "Stack deployment is already in progress")]
    });

    await expect(
      PortainerSyncFns.syncSecrets(secretSync, payloadOf({ A: "2" }) as any, gatewayV2Service, gatewayPoolService)
    ).rejects.toMatchObject({
      name: "SecretSyncError",
      message: expect.stringContaining("Stack deployment is already in progress"),
      shouldRetry: true
    });
  });

  it("updates a Git-backed stack through the git endpoint without touching the compose file", async () => {
    respondWith({
      "GET /api/stacks/4": [gitStack()],
      "POST /api/stacks/4/git": [{}]
    });

    await PortainerSyncFns.syncSecrets(secretSync, payloadOf({ A: "2" }) as any, gatewayV2Service, gatewayPoolService);

    expect(requestsMade()).toEqual(["GET /api/stacks/4", "POST /api/stacks/4/git?endpointId=1"]);
  });

  it("rejects a Kubernetes stack with a non-retryable error", async () => {
    respondWith({ "GET /api/stacks/4": [fileStack({ Type: PortainerStackType.Kubernetes })] });

    await expect(PortainerSyncFns.getSecrets(secretSync, gatewayV2Service, gatewayPoolService)).rejects.toMatchObject({
      name: "SecretSyncError",
      message: expect.stringContaining("Kubernetes stack"),
      shouldRetry: false
    });
    await expect(PortainerSyncFns.getSecrets(secretSync, gatewayV2Service, gatewayPoolService)).rejects.toBeInstanceOf(
      SecretSyncError
    );
  });

  it("decodes multiline and dollar-escaped Compose values on import", async () => {
    respondWith({
      "GET /api/stacks/4": [
        fileStack({
          Env: [
            { name: "PEM", value: '"a\\nb"' },
            { name: "PASS", value: "pa$$word" }
          ]
        })
      ]
    });

    await expect(PortainerSyncFns.getSecrets(secretSync, gatewayV2Service, gatewayPoolService)).resolves.toEqual({
      PEM: { value: "a\nb" },
      PASS: { value: "pa$word" }
    });
  });
});
