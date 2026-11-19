import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import { DynamicSecretNeonSchema, DynamicSecretProviders, NeonLeaseType } from "./models";
import { NeonProvider } from "./neon";
import { redactStoredInputs, restoreOmittedSecretFields } from "./redact";

vi.mock("@app/lib/validator", () => ({
  safeRequest: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const appConfig = { isDevelopmentMode: false, DYNAMIC_SECRET_ALLOW_INTERNAL_IP: false };
vi.mock("@app/lib/config/env", () => ({ getConfig: () => appConfig }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const API = "https://console.neon.tech/api/v2/projects/shiny-wind-028834";
const API_KEY = "test_neon_api_key";
// Fake credential values. The first has characters that must be percent-encoded in a URI.
const ROLE_CRED = "a@b/c";
const ROLE_CRED_ENCODED = encodeURIComponent(ROLE_CRED);
const ROTATED_CRED = "rotated";

type TCall = {
  method: string;
  url: string;
  body?: unknown;
  params?: unknown;
  auth?: string;
  retry?: unknown;
  allowPrivateIps?: boolean;
};
type THandler = (call: TCall) => unknown;

// A tiny in-memory stand-in for the Neon API, keyed by "METHOD url". Handlers return the response
// body, or throw (see neonError) to simulate a non-2xx response.
let routes: Record<string, THandler>;
let calls: TCall[];

const neonError = (status: number, message: string) =>
  new AxiosError(message, String(status), undefined, undefined, {
    status,
    statusText: message,
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { code: "", message }
  });

const dispatch = (method: string) => async (url: string, a?: unknown, b?: unknown) => {
  const hasBody = method === "POST" || method === "PATCH";
  const options = (hasBody ? b : a) as
    | { params?: unknown; headers?: Record<string, string>; "axios-retry"?: unknown; allowPrivateIps?: boolean }
    | undefined;
  const call: TCall = {
    method,
    url,
    body: hasBody ? a : undefined,
    params: options?.params,
    auth: options?.headers?.Authorization,
    retry: options?.["axios-retry"],
    allowPrivateIps: options?.allowPrivateIps
  };
  calls.push(call);
  const handler = routes[`${method} ${url}`];
  if (!handler) throw neonError(404, `no route for ${method} ${url}`);
  return { data: handler(call) };
};

const roleInputs = {
  apiKey: API_KEY,
  projectId: "shiny-wind-028834",
  leaseType: NeonLeaseType.Role,
  branchId: "br-main-123456",
  databaseName: "neondb"
};

const branchInputs = {
  apiKey: API_KEY,
  projectId: "shiny-wind-028834",
  leaseType: NeonLeaseType.Branch,
  databaseName: "neondb",
  roleName: "neondb_owner"
};

const roleLease = { projectId: "p", leaseData: { BRANCH_ID: "br-main-123456" } };

const branchCreateBody = () =>
  calls.find((c) => c.method === "POST" && c.url === `${API}/branches`)?.body as {
    branch: { name: string } & Record<string, unknown>;
    endpoints: unknown;
  };

const provider = () => NeonProvider({ pollIntervalMs: 1, operationTimeoutMs: 200, lockedRetries: 3 });

const createArgs = (
  inputs: object,
  { expireAt = Date.UTC(2030, 0, 2, 3, 4, 5, 678), usernameTemplate = "{{randomUsername}}" } = {}
) => ({
  inputs,
  expireAt,
  usernameTemplate,
  identity: { name: "ci-bot" } as never,
  dynamicSecret: { name: "neon" } as unknown as TDynamicSecrets,
  metadata: { projectId: "infisical-project" }
});

// Builds connection strings the way Neon formats them, without spelling out a credential literal
const pgUri = (role: string, cred: string, host: string, database = "neondb") =>
  `${["postgresql", ""].join(":")}//${[role, cred].join(":")}@${host}/${database}?sslmode=require`;

const connectionUriRoute = (host: string, password: string) => (call: TCall) => {
  const params = call.params as { role_name: string; database_name: string; pooled: boolean };
  const pooler = params.pooled ? "-pooler" : "";
  return {
    uri: pgUri(params.role_name, password, host.replace(".", `${pooler}.`), params.database_name)
  };
};

beforeEach(() => {
  routes = {};
  calls = [];
  appConfig.isDevelopmentMode = false;
  appConfig.DYNAMIC_SECRET_ALLOW_INTERNAL_IP = false;
  vi.mocked(logger.error).mockReset();
  vi.mocked(logger.warn).mockReset();
  vi.mocked(safeRequest.get).mockImplementation(dispatch("GET") as never);
  vi.mocked(safeRequest.post).mockImplementation(dispatch("POST") as never);
  vi.mocked(safeRequest.patch).mockImplementation(dispatch("PATCH") as never);
  vi.mocked(safeRequest.delete).mockImplementation(dispatch("DELETE") as never);
});

describe("DynamicSecretNeonSchema", () => {
  test("applies defaults for each lease type", async () => {
    await expect(
      DynamicSecretNeonSchema.parseAsync({
        apiKey: API_KEY,
        projectId: "shiny-wind-028834",
        leaseType: NeonLeaseType.Role,
        branchId: "br-main-123456"
      })
    ).resolves.toEqual({ ...roleInputs, pooled: false });

    await expect(DynamicSecretNeonSchema.parseAsync(branchInputs)).resolves.toEqual({
      ...branchInputs,
      pooled: false,
      resetRolePassword: true,
      setBranchExpiration: false
    });
  });

  test("requires a branch for role leases and a role for branch leases", async () => {
    const roleResult = await DynamicSecretNeonSchema.safeParseAsync({ ...roleInputs, branchId: undefined });
    expect(roleResult.success).toBe(false);
    expect(roleResult.error?.issues[0].path).toEqual(["branchId"]);

    const branchResult = await DynamicSecretNeonSchema.safeParseAsync({ ...branchInputs, roleName: undefined });
    expect(branchResult.success).toBe(false);
    expect(branchResult.error?.issues[0].path).toEqual(["roleName"]);
  });

  test("drops the settings of the other lease type", async () => {
    await expect(
      DynamicSecretNeonSchema.parseAsync({ ...roleInputs, roleName: "neondb_owner", setBranchExpiration: true })
    ).resolves.not.toHaveProperty("roleName");
    await expect(
      DynamicSecretNeonSchema.parseAsync({ ...branchInputs, branchId: "br-main-123456" })
    ).resolves.not.toHaveProperty("branchId");
  });

  test("rejects IDs that could escape the API path", async () => {
    const result = await DynamicSecretNeonSchema.safeParseAsync({ ...roleInputs, projectId: "../../users/me" });
    expect(result.success).toBe(false);
  });

  test("accepts an optional API base URL and rejects one that isn't a URL", async () => {
    await expect(DynamicSecretNeonSchema.parseAsync(roleInputs)).resolves.not.toHaveProperty("baseUrl");
    await expect(
      DynamicSecretNeonSchema.parseAsync({ ...roleInputs, baseUrl: " https://neon.example.com/api/v2 " })
    ).resolves.toMatchObject({ baseUrl: "https://neon.example.com/api/v2" });
    const result = await DynamicSecretNeonSchema.safeParseAsync({ ...roleInputs, baseUrl: "neon.example.com" });
    expect(result.success).toBe(false);
  });

  test("accepts null to clear the API base URL and the parent branch", async () => {
    await expect(DynamicSecretNeonSchema.parseAsync({ ...roleInputs, baseUrl: null })).resolves.toMatchObject({
      baseUrl: null
    });
    await expect(DynamicSecretNeonSchema.parseAsync({ ...branchInputs, parentBranchId: null })).resolves.toMatchObject({
      parentBranchId: null
    });
  });
});

describe("NeonProvider API base URL", () => {
  const SELF_HOSTED = "https://neon.example.com/api/v2";
  const SELF_HOSTED_API = `${SELF_HOSTED}/projects/shiny-wind-028834`;

  test("sends every request to a self-hosted base URL", async () => {
    routes[`GET ${SELF_HOSTED_API}`] = () => ({ project: {} });
    routes[`GET ${SELF_HOSTED_API}/branches/br-main-123456`] = () => ({ branch: {} });
    routes[`GET ${SELF_HOSTED_API}/branches/br-main-123456/databases/neondb`] = () => ({ database: {} });
    routes[`POST ${SELF_HOSTED_API}/branches/br-main-123456/roles`] = (call) => ({
      role: { name: (call.body as { role: { name: string } }).role.name },
      operations: [{ id: "op-1", status: "running" }]
    });
    routes[`GET ${SELF_HOSTED_API}/operations/op-1`] = () => ({ operation: { id: "op-1", status: "finished" } });
    routes[`GET ${SELF_HOSTED_API}/connection_uri`] = connectionUriRoute("pg.neon.example.com", ROLE_CRED_ENCODED);
    routes[`DELETE ${SELF_HOSTED_API}/branches/br-main-123456/roles/some-role`] = () => ({});

    // a trailing slash is dropped rather than doubled
    const inputs = { ...roleInputs, baseUrl: `${SELF_HOSTED}/` };
    await expect(provider().validateConnection(inputs, { projectId: "p" })).resolves.toBe(true);
    await provider().create(createArgs(inputs));
    await provider().revoke(inputs, "some-role", roleLease);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => !c.url.startsWith(`${SELF_HOSTED_API}`) || c.url.includes("//projects"))).toEqual([]);
  });

  test("uses Neon's hosted API when the base URL is cleared", async () => {
    routes[`DELETE ${API}/branches/br-main-123456/roles/some-role`] = () => ({});

    await provider().revoke({ ...roleInputs, baseUrl: null }, "some-role", roleLease);
    expect(calls.map((c) => c.url)).toEqual([`${API}/branches/br-main-123456/roles/some-role`]);
  });

  test("requires https outside development mode", async () => {
    const inputs = { ...roleInputs, baseUrl: "http://neon.example.com/api/v2" };
    await expect(provider().validateProviderInputs(inputs, { projectId: "p" })).rejects.toThrow(
      "Neon API base URL must use https"
    );
    await expect(provider().create(createArgs(inputs))).rejects.toThrow("Neon API base URL must use https");
    expect(calls).toEqual([]);

    appConfig.isDevelopmentMode = true;
    await expect(provider().validateProviderInputs(inputs, { projectId: "p" })).resolves.toMatchObject({
      baseUrl: "http://neon.example.com/api/v2"
    });
  });

  test("reaches a private self-hosted Neon only when the dynamic secret setting allows it", async () => {
    routes[`DELETE ${SELF_HOSTED_API}/branches/br-main-123456/roles/some-role`] = () => ({});
    const inputs = { ...roleInputs, baseUrl: SELF_HOSTED };

    await provider().revoke(inputs, "some-role", roleLease);
    appConfig.DYNAMIC_SECRET_ALLOW_INTERNAL_IP = true;
    await provider().revoke(inputs, "some-role", roleLease);
    expect(calls.map((c) => c.allowPrivateIps)).toEqual([false, true]);
  });

  test("rejects a base URL with a query string or fragment", async () => {
    await expect(
      provider().validateProviderInputs({ ...roleInputs, baseUrl: `${SELF_HOSTED}?x=1` }, { projectId: "p" })
    ).rejects.toThrow("can't include a query string or fragment");
  });
});

describe("NeonProvider.validateConnection", () => {
  test("checks the project, branch and database for role leases", async () => {
    routes[`GET ${API}`] = () => ({ project: {} });
    routes[`GET ${API}/branches/br-main-123456`] = () => ({ branch: {} });
    routes[`GET ${API}/branches/br-main-123456/databases/neondb`] = () => ({ database: {} });

    await expect(provider().validateConnection(roleInputs, { projectId: "p" })).resolves.toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      API,
      `${API}/branches/br-main-123456`,
      `${API}/branches/br-main-123456/databases/neondb`
    ]);
    expect(calls.every((c) => c.auth === `Bearer ${API_KEY}`)).toBe(true);
  });

  test("resolves the default branch and checks the role for branch leases", async () => {
    routes[`GET ${API}`] = () => ({ project: {} });
    // the default branch is on the second page
    routes[`GET ${API}/branches`] = (call) =>
      (call.params as { cursor?: string }).cursor === "page-2"
        ? { branches: [{ id: "br-main-1", name: "main", default: true }], pagination: { next: "page-3" } }
        : { branches: [{ id: "br-dev-1", name: "dev" }], pagination: { next: "page-2" } };
    routes[`GET ${API}/branches/br-main-1`] = () => ({ branch: {} });
    routes[`GET ${API}/branches/br-main-1/databases/neondb`] = () => ({ database: {} });
    routes[`GET ${API}/branches/br-main-1/roles/neondb_owner`] = () => ({ role: {} });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).resolves.toBe(true);
    expect(calls.filter((c) => c.url === `${API}/branches`).map((c) => c.params)).toEqual([
      { limit: 100 },
      { limit: 100, cursor: "page-2" }
    ]);
    expect(calls.at(-1)?.url).toBe(`${API}/branches/br-main-1/roles/neondb_owner`);
  });

  test("names the project when it has no default branch", async () => {
    routes[`GET ${API}`] = () => ({ project: {} });
    routes[`GET ${API}/branches`] = () => ({ branches: [{ id: "br-dev-1", name: "dev" }], pagination: {} });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).rejects.toThrow(
      "Neon project 'shiny-wind-028834' has no default branch. Set a parent branch ID."
    );
  });

  test("stops paging through branches after the page limit and logs it", async () => {
    routes[`GET ${API}`] = () => ({ project: {} });
    // a cursor that never clears
    routes[`GET ${API}/branches`] = () => ({ branches: [{ id: "br-dev-1", name: "dev" }], pagination: { next: "x" } });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).rejects.toThrow(
      "Infisical couldn't find the default branch of Neon project 'shiny-wind-028834' in its first 10000 branches"
    );
    expect(calls.filter((c) => c.url === `${API}/branches`)).toHaveLength(100);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("surfaces Neon's error message without leaking the API key", async () => {
    routes[`GET ${API}`] = () => {
      throw neonError(401, `authentication failed for key ${API_KEY}`);
    };

    const error = await provider()
      .validateConnection(roleInputs, { projectId: "p" })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toContain("Failed to connect with Neon: authentication failed");
    expect((error as Error).message).not.toContain(API_KEY);
  });
});

describe("NeonProvider role leases", () => {
  test("creates a role, waits for its operations and returns a connection string", async () => {
    let polls = 0;
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => ({
      role: { name: (call.body as { role: { name: string } }).role.name, password: ROLE_CRED },
      operations: [{ id: "op-1", status: "running", action: "apply_config" }]
    });
    routes[`GET ${API}/operations/op-1`] = () => {
      polls += 1;
      return { operation: { id: "op-1", status: polls < 2 ? "running" : "finished" } };
    };
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-cool-1.us-east-2.aws.neon.tech", ROLE_CRED_ENCODED);

    const { entityId, data } = await provider().create(createArgs({ ...roleInputs, pooled: true }));

    expect(entityId).toMatch(/^[a-z0-9]{32}$/);
    expect(polls).toBe(2);
    expect(calls.find((c) => c.url.endsWith("/connection_uri"))?.params).toEqual({
      branch_id: "br-main-123456",
      database_name: "neondb",
      role_name: entityId,
      pooled: true
    });
    const expectedUri = pgUri(entityId, ROLE_CRED_ENCODED, "ep-cool-1-pooler.us-east-2.aws.neon.tech");
    const lease = data as Record<string, string>;
    expect(Object.keys(lease)).toEqual([
      "DATABASE_URL",
      "DB_HOST",
      "DB_NAME",
      "DB_USERNAME",
      "DB_PASSWORD",
      "BRANCH_ID"
    ]);
    expect(lease).toMatchObject({
      DATABASE_URL: expectedUri,
      DB_HOST: "ep-cool-1-pooler.us-east-2.aws.neon.tech",
      DB_NAME: "neondb",
      BRANCH_ID: "br-main-123456"
    });
    // the credential comes back decoded, not percent-encoded as in the URI
    expect([lease.DB_USERNAME, lease.DB_PASSWORD]).toEqual([entityId, ROLE_CRED]);
  });

  test("stores the role's branch on the lease and never retries the create request", async () => {
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => ({
      role: { name: (call.body as { role: { name: string } }).role.name, password: "pw" },
      operations: []
    });
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-cool-1.neon.tech", "pw");

    expect(provider().persistedLeaseFields).toEqual(["BRANCH_ID"]);
    await provider().create(createArgs(roleInputs));
    expect(calls[0]).toMatchObject({ method: "POST", retry: { retries: 0 } });
  });

  test("retries while the branch is locked by another operation", async () => {
    let attempts = 0;
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => {
      attempts += 1;
      if (attempts < 3) throw neonError(423, "project already has running conflicting operations");
      return { role: { name: (call.body as { role: { name: string } }).role.name, password: "pw" }, operations: [] };
    };
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-cool-1.neon.tech", "pw");

    await provider().create(createArgs(roleInputs));
    expect(attempts).toBe(3);
  });

  test("deletes the role again if its operation fails", async () => {
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => ({
      role: { name: (call.body as { role: { name: string } }).role.name, password: "pw" },
      operations: [{ id: "op-1", status: "running" }]
    });
    routes[`GET ${API}/operations/op-1`] = () => ({
      operation: { id: "op-1", status: "error", action: "apply_config", error: "compute failed to start" }
    });
    routes[`DELETE ${API}/branches/br-main-123456/roles/ci_lease`] = () => ({});

    await expect(provider().create(createArgs(roleInputs, { usernameTemplate: "ci_lease" }))).rejects.toThrow(
      "Neon operation apply_config error: compute failed to start"
    );
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `${API}/branches/br-main-123456/roles/ci_lease` });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("logs the leftover role when deleting it again fails", async () => {
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => ({
      role: { name: (call.body as { role: { name: string } }).role.name, password: "pw" },
      operations: [{ id: "op-1", status: "error", action: "apply_config" }]
    });
    routes[`DELETE ${API}/branches/br-main-123456/roles/ci_lease`] = () => {
      throw neonError(500, `internal error for ${API_KEY}`);
    };

    await expect(provider().create(createArgs(roleInputs, { usernameTemplate: "ci_lease" }))).rejects.toThrow(
      "Neon operation apply_config error"
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message] = vi.mocked(logger.error).mock.calls[0] as [string];
    expect(message).toContain("role 'ci_lease' on branch 'br-main-123456'");
    expect(message).toContain("internal error");
    expect(message).not.toContain(API_KEY);
  });

  test("gives up when operations never finish", async () => {
    routes[`POST ${API}/branches/br-main-123456/roles`] = () => ({
      role: { name: "r", password: "pw" },
      operations: [{ id: "op-1", status: "running", action: "apply_config" }]
    });
    routes[`GET ${API}/operations/op-1`] = () => ({ operation: { id: "op-1", status: "running" } });
    routes[`DELETE ${API}/branches/br-main-123456/roles/r`] = () => ({});

    await expect(provider().create(createArgs(roleInputs))).rejects.toThrow(
      "Timed out waiting for Neon operations to finish: apply_config"
    );
  });

  test("revokes by deleting the role and treats a missing role as revoked", async () => {
    routes[`DELETE ${API}/branches/br-main-123456/roles/abc`] = () => ({ operations: [] });
    await expect(provider().revoke(roleInputs, "abc", roleLease)).resolves.toEqual({ entityId: "abc" });

    routes[`DELETE ${API}/branches/br-main-123456/roles/gone`] = () => {
      throw neonError(404, "role not found");
    };
    await expect(provider().revoke(roleInputs, "gone", roleLease)).resolves.toEqual({ entityId: "gone" });

    routes[`DELETE ${API}/branches/br-main-123456/roles/boom`] = () => {
      throw neonError(500, "internal error");
    };
    await expect(provider().revoke(roleInputs, "boom", roleLease)).rejects.toThrow(
      "Failed to revoke Neon role: internal error"
    );
  });

  test("revokes the role on the branch the lease was created on", async () => {
    routes[`DELETE ${API}/branches/br-main-123456/roles/abc`] = () => ({ operations: [] });

    await provider().revoke({ ...roleInputs, branchId: "br-other-1" }, "abc", roleLease);
    expect(calls.map((c) => c.url)).toEqual([`${API}/branches/br-main-123456/roles/abc`]);

    await expect(provider().revoke(roleInputs, "abc", { projectId: "p" })).rejects.toThrow(
      "This lease has no stored Neon branch"
    );
  });

  test("waits for Neon to finish deleting the role", async () => {
    let polls = 0;
    routes[`DELETE ${API}/branches/br-main-123456/roles/abc`] = () => ({
      operations: [{ id: "op-del", status: "running", action: "apply_config" }]
    });
    routes[`GET ${API}/operations/op-del`] = () => {
      polls += 1;
      return { operation: { id: "op-del", status: polls < 2 ? "running" : "finished" } };
    };
    await expect(provider().revoke(roleInputs, "abc", roleLease)).resolves.toEqual({ entityId: "abc" });
    expect(polls).toBe(2);

    routes[`GET ${API}/operations/op-del`] = () => ({
      operation: { id: "op-del", status: "error", action: "apply_config", error: "role is in use" }
    });
    await expect(provider().revoke(roleInputs, "abc", roleLease)).rejects.toThrow(
      "Neon operation apply_config error: role is in use"
    );
  });

  test("renew is a no-op because Neon roles don't expire", async () => {
    await expect(provider().renew(roleInputs, "abc", Date.now(), { projectId: "p" })).resolves.toEqual({
      entityId: "abc"
    });
    expect(calls).toHaveLength(0);
  });
});

describe("NeonProvider branch leases", () => {
  const branchRoutes = () => {
    routes[`POST ${API}/branches`] = (call) => ({
      branch: { id: "br-lease-1", name: (call.body as { branch: { name: string } }).branch.name },
      operations: [
        { id: "op-create", status: "finished", action: "create_branch" },
        { id: "op-start", status: "scheduling", action: "start_compute" }
      ]
    });
    routes[`GET ${API}/operations/op-start`] = () => ({ operation: { id: "op-start", status: "finished" } });
    routes[`POST ${API}/branches/br-lease-1/roles/neondb_owner/reset_password`] = () => ({
      role: { name: "neondb_owner", password: ROTATED_CRED },
      operations: [{ id: "op-reset", status: "finished" }]
    });
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-lease-1.us-east-2.aws.neon.tech", ROTATED_CRED);
  };

  test("creates a branch with a compute, rotates the role password and returns its connection string", async () => {
    branchRoutes();

    const { entityId, data } = await provider().create(createArgs(branchInputs));

    expect(entityId).toBe("br-lease-1");
    const body = branchCreateBody();
    expect(Object.keys(body.branch)).toEqual(["name"]);
    expect(body.branch.name).toMatch(/^[a-z0-9]{32}$/);
    expect(body.endpoints).toEqual([{ type: "read_write" }]);
    expect(calls.map((c) => `${c.method} ${c.url.replace(API, "")}`)).toEqual([
      "POST /branches",
      "GET /operations/op-start",
      "POST /branches/br-lease-1/roles/neondb_owner/reset_password",
      "GET /connection_uri"
    ]);
    expect(calls[0].retry).toEqual({ retries: 0 });
    const expectedUri = pgUri("neondb_owner", ROTATED_CRED, "ep-lease-1.us-east-2.aws.neon.tech");
    const lease = data as Record<string, string>;
    expect(lease).toMatchObject({
      DATABASE_URL: expectedUri,
      DB_HOST: "ep-lease-1.us-east-2.aws.neon.tech",
      BRANCH_ID: "br-lease-1",
      BRANCH_NAME: body.branch.name
    });
    // the lease gets the rotated credential, not the parent branch's
    expect([lease.DB_USERNAME, lease.DB_PASSWORD]).toEqual(["neondb_owner", ROTATED_CRED]);
  });

  test("forks from the configured parent, sets the expiration and can skip the password reset", async () => {
    branchRoutes();

    await provider().create(
      createArgs({
        ...branchInputs,
        parentBranchId: "br-staging-9",
        setBranchExpiration: true,
        resetRolePassword: false
      })
    );

    expect(branchCreateBody().branch).toMatchObject({
      parent_id: "br-staging-9",
      expires_at: "2030-01-02T03:04:05Z"
    });
    expect(calls.some((c) => c.url.endsWith("/reset_password"))).toBe(false);
  });

  test("deletes the new branch if a later step fails", async () => {
    branchRoutes();
    routes[`POST ${API}/branches/br-lease-1/roles/neondb_owner/reset_password`] = () => {
      throw neonError(404, "role neondb_owner not found");
    };
    routes[`DELETE ${API}/branches/br-lease-1`] = () => ({});

    await expect(provider().create(createArgs(branchInputs))).rejects.toThrow(
      "Failed to create Neon branch: role neondb_owner not found"
    );
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `${API}/branches/br-lease-1` });
  });

  test("logs the leftover branch when deleting it again fails", async () => {
    branchRoutes();
    routes[`POST ${API}/branches/br-lease-1/roles/neondb_owner/reset_password`] = () => {
      throw neonError(404, "role neondb_owner not found");
    };
    routes[`DELETE ${API}/branches/br-lease-1`] = () => {
      throw neonError(500, "internal error");
    };

    await expect(provider().create(createArgs(branchInputs))).rejects.toThrow(
      "Failed to create Neon branch: role neondb_owner not found"
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("branch 'br-lease-1'"));
  });

  test("revokes by deleting the branch and waits for Neon to finish", async () => {
    routes[`DELETE ${API}/branches/br-lease-1`] = () => ({
      operations: [{ id: "op-del", status: "running", action: "delete_timeline" }]
    });
    routes[`GET ${API}/operations/op-del`] = () => ({ operation: { id: "op-del", status: "finished" } });

    await expect(provider().revoke(branchInputs, "br-lease-1", { projectId: "p" })).resolves.toEqual({
      entityId: "br-lease-1"
    });
    expect(calls.map((c) => `${c.method} ${c.url.replace(API, "")}`)).toEqual([
      "DELETE /branches/br-lease-1",
      "GET /operations/op-del"
    ]);
  });

  test("renew moves the branch expiration when the setting is on", async () => {
    routes[`PATCH ${API}/branches/br-lease-1`] = () => ({ branch: {} });

    await provider().renew({ ...branchInputs, setBranchExpiration: true }, "br-lease-1", Date.UTC(2030, 5, 1), {
      projectId: "p"
    });
    expect(calls).toEqual([
      expect.objectContaining({
        method: "PATCH",
        url: `${API}/branches/br-lease-1`,
        body: { branch: { expires_at: "2030-06-01T00:00:00Z" } }
      })
    ]);
  });

  test("renew moves an expiration the branch was created with after the setting was turned off", async () => {
    routes[`PATCH ${API}/branches/br-lease-1`] = () => ({ branch: {} });
    routes[`GET ${API}/branches/br-lease-1`] = () => ({
      branch: { id: "br-lease-1", name: "lease", expires_at: "2030-01-02T03:04:05Z" }
    });

    await provider().renew(branchInputs, "br-lease-1", Date.UTC(2030, 5, 1), { projectId: "p" });
    expect(calls.map((c) => `${c.method} ${c.url.replace(API, "")}`)).toEqual([
      "GET /branches/br-lease-1",
      "PATCH /branches/br-lease-1"
    ]);

    calls = [];
    routes[`GET ${API}/branches/br-lease-1`] = () => ({ branch: { id: "br-lease-1", name: "lease" } });
    await provider().renew(branchInputs, "br-lease-1", Date.UTC(2030, 5, 1), { projectId: "p" });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });
});

describe("NeonProvider.validateProviderInputs", () => {
  const validate = (
    inputs: object,
    previousInputs: object,
    { hasActiveLeases = false, omittedSecretFields = [] as string[] } = {}
  ) =>
    provider().validateProviderInputs(inputs, { projectId: "p", previousInputs, hasActiveLeases, omittedSecretFields });

  test("blocks changes that would orphan active leases", async () => {
    const active = { hasActiveLeases: true };

    await expect(validate({ ...roleInputs, projectId: "other-project-1" }, roleInputs, active)).rejects.toThrow(
      "The project ID can't be changed while this dynamic secret has active leases"
    );
    await expect(validate(branchInputs, roleInputs, active)).rejects.toThrow("The lease type can't be changed");
    await expect(
      validate({ ...roleInputs, baseUrl: "https://neon.example.com/api/v2" }, roleInputs, active)
    ).rejects.toThrow("The API base URL can't be changed");
    // spelling out the default URL, adding a trailing slash or clearing it is not a change
    await expect(
      validate({ ...roleInputs, baseUrl: "https://console.neon.tech/api/v2/" }, roleInputs, active)
    ).resolves.toMatchObject({ projectId: roleInputs.projectId });
    await expect(validate({ ...roleInputs, baseUrl: null }, roleInputs, active)).resolves.toMatchObject({
      baseUrl: null
    });

    // revoke reads each role lease's branch from the lease, so the branch is free to change
    await expect(validate({ ...roleInputs, branchId: "br-other-1" }, roleInputs, active)).resolves.toMatchObject({
      branchId: "br-other-1"
    });
    await expect(
      validate({ ...branchInputs, parentBranchId: "br-other-1" }, branchInputs, active)
    ).resolves.toMatchObject({ parentBranchId: "br-other-1" });
  });

  test("requires the API key again to change the API base URL", async () => {
    const selfHosted = { ...roleInputs, baseUrl: "https://neon.example.com/api/v2" };

    await expect(validate(selfHosted, roleInputs, { omittedSecretFields: ["apiKey"] })).rejects.toThrow(
      "Enter the API key again to change the API base URL"
    );
    await expect(validate(roleInputs, selfHosted, { omittedSecretFields: ["apiKey"] })).rejects.toThrow(
      "Enter the API key again to change the API base URL"
    );
    await expect(validate(selfHosted, roleInputs)).resolves.toMatchObject({ baseUrl: selfHosted.baseUrl });
    await expect(
      validate({ ...selfHosted, databaseName: "app" }, selfHosted, { omittedSecretFields: ["apiKey"] })
    ).resolves.toMatchObject({ databaseName: "app" });
  });
});

describe("Neon stored inputs", () => {
  test("never return the API key and keep it when an update omits it", () => {
    expect(redactStoredInputs(DynamicSecretProviders.Neon, roleInputs)).toEqual({
      projectId: roleInputs.projectId,
      leaseType: roleInputs.leaseType,
      branchId: roleInputs.branchId,
      databaseName: roleInputs.databaseName
    });

    const { apiKey, ...edited } = { ...roleInputs, databaseName: "app" };
    expect(apiKey).toBe(API_KEY);
    expect(restoreOmittedSecretFields(DynamicSecretProviders.Neon, roleInputs, edited)).toEqual({
      ...edited,
      apiKey: API_KEY
    });
  });
});
