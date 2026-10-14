/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
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
vi.mock("@app/lib/delay", () => ({ delay: vi.fn(async () => {}) }));
// Without a key schema every variable on the stack counts as managed by the sync
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: (_key: string, _environment: string, schema?: string) => !schema
}));

/* eslint-disable import/first */
import { PortainerStackStatus, PortainerStackType } from "@app/services/app-connection/portainer";

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
  Status: PortainerStackStatus.Active,
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

// Resolves each request by HTTP method and path; later entries for the same key answer later calls
const respondWith = (responses: Record<string, unknown[]>) => {
  const remaining = Object.fromEntries(Object.entries(responses).map(([key, values]) => [key, [...values]]));

  safeRequestMock.mockImplementation(async ({ method, url }: { method: string; url: string }) => {
    const key = `${method} ${new URL(url).pathname}`;
    const queue = remaining[key];
    if (!queue?.length) throw new Error(`Unexpected request ${key}`);

    return { data: queue.length > 1 ? queue.shift() : queue[0] };
  });
};

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

  it("leaves single-line values and Swarm stacks untouched", () => {
    expect(encodePortainerEnvValue("plain", PortainerStackType.Compose)).toBe("plain");
    expect(encodePortainerEnvValue("no#space", PortainerStackType.Compose)).toBe("no#space");
    expect(encodePortainerEnvValue("abc #def", PortainerStackType.Swarm)).toBe("abc #def");
    expect(encodePortainerEnvValue("line1\nline2", PortainerStackType.Swarm)).toBe("line1\nline2");
    expect(decodePortainerEnvValue('"line1\\nline2"', PortainerStackType.Swarm)).toBe('"line1\\nline2"');
  });

  it("does not unwrap a single-line value a user quoted by hand", () => {
    expect(decodePortainerEnvValue('"hello"', PortainerStackType.Compose)).toBe('"hello"');
    expect(decodePortainerEnvValue('"C:\\\\new"', PortainerStackType.Compose)).toBe('"C:\\\\new"');
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
      Option: null
    });

    expect(buildPortainerGitUpdatePayload(stack as any, [])).toEqual({
      env: [],
      prune: false,
      repositoryReferenceName: "refs/heads/main",
      autoUpdate: null,
      repositoryAuthentication: true,
      repositoryUsername: "deploy",
      tlsSkipVerify: true
    });
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

  it("resubmits the compose file with the merged variables and waits for the redeploy to finish", async () => {
    respondWith({
      "GET /api/stacks/4": [
        fileStack(),
        fileStack({ Status: PortainerStackStatus.Deploying }),
        fileStack({ Status: PortainerStackStatus.Active })
      ],
      "GET /api/stacks/4/file": [{ StackFileContent: "services: {}" }],
      "PUT /api/stacks/4": [{}]
    });

    await PortainerSyncFns.syncSecrets(
      secretSync,
      payloadOf({ B: "x\ny" }) as any,
      gatewayV2Service,
      gatewayPoolService
    );

    expect(requestsMade()).toEqual([
      "GET /api/stacks/4",
      "GET /api/stacks/4/file",
      "PUT /api/stacks/4?endpointId=1",
      "GET /api/stacks/4",
      "GET /api/stacks/4"
    ]);

    const putConfig = requestConfigs().find((config) => config.method === "PUT");
    // A is managed by the sync (no key schema) and absent from the source, so it is dropped
    expect(putConfig?.data).toEqual({
      env: [{ name: "B", value: '"x\\ny"' }],
      stackFileContent: "services: {}",
      prune: true
    });
  });

  it("keeps a stack variable named like an inherited object property when deletion is disabled", async () => {
    respondWith({
      "GET /api/stacks/4": [
        fileStack({ Env: [{ name: "constructor", value: "keep" }] }),
        fileStack({ Status: PortainerStackStatus.Active })
      ],
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
    expect(putConfig?.data).toMatchObject({
      env: [
        { name: "constructor", value: "keep" },
        { name: "A", value: "1" }
      ]
    });
  });

  it("fails the sync when Portainer reports the redeploy failed", async () => {
    respondWith({
      "GET /api/stacks/4": [
        fileStack(),
        fileStack({
          Status: PortainerStackStatus.Error,
          DeploymentStatus: [{ Status: PortainerStackStatus.Error, Time: 1, Message: "image pull failed" }]
        })
      ],
      "GET /api/stacks/4/file": [{ StackFileContent: "services: {}" }],
      "PUT /api/stacks/4": [{}]
    });

    await expect(
      PortainerSyncFns.syncSecrets(secretSync, payloadOf({ A: "2" }) as any, gatewayV2Service, gatewayPoolService)
    ).rejects.toMatchObject({ message: expect.stringContaining("image pull failed"), shouldRetry: false });
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

  it("decodes multiline Compose values on import", async () => {
    respondWith({ "GET /api/stacks/4": [fileStack({ Env: [{ name: "PEM", value: '"a\\nb"' }] })] });

    await expect(PortainerSyncFns.getSecrets(secretSync, gatewayV2Service, gatewayPoolService)).resolves.toEqual({
      PEM: { value: "a\nb" }
    });
  });
});
