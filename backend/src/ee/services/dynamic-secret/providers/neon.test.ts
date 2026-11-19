import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { DynamicSecretNeonSchema, NeonLeaseType } from "./models";
import { NeonProvider } from "./neon";

const { mockedGet, mockedPost, mockedPatch, mockedDelete } = vi.hoisted(() => ({
  mockedGet: vi.fn(),
  mockedPost: vi.fn(),
  mockedPatch: vi.fn(),
  mockedDelete: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { get: mockedGet, post: mockedPost, patch: mockedPatch, delete: mockedDelete }
}));

vi.mock("@app/lib/delay", () => ({ delay: vi.fn().mockResolvedValue(undefined) }));

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
    | { params?: unknown; headers?: Record<string, string>; "axios-retry"?: unknown }
    | undefined;
  const call: TCall = {
    method,
    url,
    body: hasBody ? a : undefined,
    params: options?.params,
    auth: options?.headers?.Authorization,
    retry: options?.["axios-retry"]
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

const branchCreateBody = () =>
  calls.find((c) => c.method === "POST" && c.url === `${API}/branches`)?.body as {
    branch: { name: string } & Record<string, unknown>;
    endpoints: unknown;
  };

const provider = () => NeonProvider();

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

const createRoleRoute =
  (operations: unknown[] = []) =>
  (call: TCall) => ({
    role: { name: (call.body as { role: { name: string } }).role.name, password: ROLE_CRED },
    operations
  });

beforeEach(() => {
  routes = {};
  calls = [];
  vi.mocked(logger.error).mockReset();
  vi.mocked(logger.warn).mockReset();
  vi.mocked(delay).mockResolvedValue(undefined);
  mockedGet.mockImplementation(dispatch("GET"));
  mockedPost.mockImplementation(dispatch("POST"));
  mockedPatch.mockImplementation(dispatch("PATCH"));
  mockedDelete.mockImplementation(dispatch("DELETE"));
});

describe("DynamicSecretNeonSchema", () => {
  test("rejects IDs that could escape the API path", async () => {
    const result = await DynamicSecretNeonSchema.safeParseAsync({ ...roleInputs, projectId: "../../users/me" });
    expect(result.success).toBe(false);
  });

  test("accepts null to clear the parent branch", async () => {
    await expect(DynamicSecretNeonSchema.parseAsync({ ...branchInputs, parentBranchId: null })).resolves.toMatchObject({
      parentBranchId: null
    });
  });
});

describe("NeonProvider.validateConnection", () => {
  test("checks the database on the branch for role leases", async () => {
    routes[`GET ${API}/branches/br-main-123456/databases/neondb`] = () => ({ database: {} });

    await expect(provider().validateConnection(roleInputs, { projectId: "p" })).resolves.toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({ url: `${API}/branches/br-main-123456/databases/neondb`, auth: `Bearer ${API_KEY}` })
    ]);
  });

  test("resolves the default branch and checks the database and role for branch leases", async () => {
    // the default branch is on the second page
    routes[`GET ${API}/branches`] = (call) =>
      (call.params as { cursor?: string }).cursor === "page-2"
        ? { branches: [{ id: "br-main-1", name: "main", default: true }], pagination: { next: "page-3" } }
        : { branches: [{ id: "br-dev-1", name: "dev" }], pagination: { next: "page-2" } };
    routes[`GET ${API}/branches/br-main-1/databases/neondb`] = () => ({ database: {} });
    routes[`GET ${API}/branches/br-main-1/roles/neondb_owner`] = () => ({ role: {} });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).resolves.toBe(true);
    expect(calls.map((c) => [c.url.replace(API, ""), c.params])).toEqual([
      ["/branches", { limit: 100 }],
      ["/branches", { limit: 100, cursor: "page-2" }],
      ["/branches/br-main-1/databases/neondb", undefined],
      ["/branches/br-main-1/roles/neondb_owner", undefined]
    ]);
  });

  test("names the project when it has no default branch", async () => {
    routes[`GET ${API}/branches`] = () => ({ branches: [{ id: "br-dev-1", name: "dev" }], pagination: {} });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).rejects.toThrow(
      "Neon project 'shiny-wind-028834' has no default branch. Set a parent branch ID."
    );
  });

  test("stops paging through branches after the page limit and logs it", async () => {
    // a cursor that never clears
    routes[`GET ${API}/branches`] = () => ({ branches: [{ id: "br-dev-1", name: "dev" }], pagination: { next: "x" } });

    await expect(provider().validateConnection(branchInputs, { projectId: "p" })).rejects.toThrow(
      "Infisical couldn't find the default branch of Neon project 'shiny-wind-028834' in its first 10000 branches"
    );
    expect(calls).toHaveLength(100);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("surfaces Neon's error message without leaking the API key", async () => {
    routes[`GET ${API}/branches/br-main-123456/databases/neondb`] = () => {
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
    routes[`POST ${API}/branches/br-main-123456/roles`] = createRoleRoute([
      { id: "op-1", status: "running", action: "apply_config" }
    ]);
    routes[`GET ${API}/operations/op-1`] = () => {
      polls += 1;
      return { operation: { id: "op-1", status: polls < 2 ? "running" : "finished" } };
    };
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-cool-1.us-east-2.aws.neon.tech", ROLE_CRED_ENCODED);

    const { entityId, data } = await provider().create(createArgs({ ...roleInputs, pooled: true }));

    expect(entityId).toMatch(/^[a-z0-9]{32}$/);
    expect(polls).toBe(2);
    // a retried create could leave a role behind that no lease tracks
    expect(calls[0].retry).toEqual({ retries: 0 });
    expect(calls.find((c) => c.url.endsWith("/connection_uri"))?.params).toEqual({
      branch_id: "br-main-123456",
      database_name: "neondb",
      role_name: entityId,
      pooled: true
    });
    // the credential comes back decoded, not percent-encoded as in the URI
    expect(data).toEqual({
      DATABASE_URL: pgUri(entityId, ROLE_CRED_ENCODED, "ep-cool-1-pooler.us-east-2.aws.neon.tech"),
      DB_HOST: "ep-cool-1-pooler.us-east-2.aws.neon.tech",
      DB_NAME: "neondb",
      DB_USERNAME: entityId,
      DB_PASSWORD: ROLE_CRED
    });
  });

  test("retries while the project is locked by another operation", async () => {
    let attempts = 0;
    routes[`POST ${API}/branches/br-main-123456/roles`] = (call) => {
      attempts += 1;
      if (attempts < 3) throw neonError(423, "project already has running conflicting operations");
      return createRoleRoute()(call);
    };
    routes[`GET ${API}/connection_uri`] = connectionUriRoute("ep-cool-1.neon.tech", "pw");

    await provider().create(createArgs(roleInputs));
    expect(attempts).toBe(3);
  });

  test("deletes the role again if its operation fails", async () => {
    routes[`POST ${API}/branches/br-main-123456/roles`] = createRoleRoute([{ id: "op-1", status: "running" }]);
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
    routes[`POST ${API}/branches/br-main-123456/roles`] = createRoleRoute([
      { id: "op-1", status: "error", action: "apply_config" }
    ]);
    routes[`DELETE ${API}/branches/br-main-123456/roles/ci_lease`] = () => {
      throw neonError(500, "internal error");
    };

    await expect(provider().create(createArgs(roleInputs, { usernameTemplate: "ci_lease" }))).rejects.toThrow(
      "Neon operation apply_config error"
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(AxiosError),
      "Failed to clean up Neon role [projectId=shiny-wind-028834] [entityId=ci_lease]"
    );
  });

  test("gives up when operations never finish", async () => {
    // each poll waits on a clock that only the mocked delay moves
    let now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(delay).mockImplementation(async (ms) => {
      now += ms;
    });
    routes[`POST ${API}/branches/br-main-123456/roles`] = () => ({
      role: { name: "r", password: "pw" },
      operations: [{ id: "op-1", status: "running", action: "apply_config" }]
    });
    routes[`GET ${API}/operations/op-1`] = () => ({ operation: { id: "op-1", status: "running" } });
    routes[`DELETE ${API}/branches/br-main-123456/roles/r`] = () => ({});

    await expect(provider().create(createArgs(roleInputs))).rejects.toThrow(
      "Timed out waiting for Neon operations to finish: apply_config"
    );
    nowSpy.mockRestore();
    expect(calls.filter((c) => c.url === `${API}/operations/op-1`)).toHaveLength(60);
  });

  test("revokes by deleting the role and treats a missing role as revoked", async () => {
    routes[`DELETE ${API}/branches/br-main-123456/roles/abc`] = () => ({ operations: [] });
    await expect(provider().revoke(roleInputs, "abc", { projectId: "p" })).resolves.toEqual({ entityId: "abc" });

    routes[`DELETE ${API}/branches/br-main-123456/roles/gone`] = () => {
      throw neonError(404, "role not found");
    };
    await expect(provider().revoke(roleInputs, "gone", { projectId: "p" })).resolves.toEqual({ entityId: "gone" });

    routes[`DELETE ${API}/branches/br-main-123456/roles/boom`] = () => {
      throw neonError(500, "internal error");
    };
    await expect(provider().revoke(roleInputs, "boom", { projectId: "p" })).rejects.toThrow(
      "Failed to revoke Neon role: internal error"
    );
  });

  test("fails the revoke when Neon can't finish deleting the role", async () => {
    routes[`DELETE ${API}/branches/br-main-123456/roles/abc`] = () => ({
      operations: [{ id: "op-del", status: "running", action: "apply_config" }]
    });
    routes[`GET ${API}/operations/op-del`] = () => ({
      operation: { id: "op-del", status: "error", action: "apply_config", error: "role is in use" }
    });

    await expect(provider().revoke(roleInputs, "abc", { projectId: "p" })).rejects.toThrow(
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
    // the lease gets the rotated credential, not the parent branch's
    expect(data).toEqual({
      DATABASE_URL: pgUri("neondb_owner", ROTATED_CRED, "ep-lease-1.us-east-2.aws.neon.tech"),
      DB_HOST: "ep-lease-1.us-east-2.aws.neon.tech",
      DB_NAME: "neondb",
      DB_USERNAME: "neondb_owner",
      DB_PASSWORD: ROTATED_CRED,
      BRANCH_ID: "br-lease-1",
      BRANCH_NAME: body.branch.name
    });
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
  test("blocks changes that would orphan active leases", async () => {
    const validate = (inputs: object, previousInputs: object, hasActiveLeases = true) =>
      provider().validateProviderInputs(inputs, { projectId: "p", previousInputs, hasActiveLeases });

    await expect(validate({ ...roleInputs, projectId: "other-project-1" }, roleInputs)).rejects.toThrow(
      "The project ID can't be changed while this dynamic secret has active leases"
    );
    await expect(validate({ ...roleInputs, branchId: "br-other-1" }, roleInputs)).rejects.toThrow(
      "The branch ID can't be changed"
    );
    await expect(validate(branchInputs, roleInputs)).rejects.toThrow("The lease type can't be changed");

    // new branch leases fork from the new parent, and existing ones are deleted by their own ID
    await expect(validate({ ...branchInputs, parentBranchId: "br-other-1" }, branchInputs)).resolves.toMatchObject({
      parentBranchId: "br-other-1"
    });
    await expect(validate({ ...roleInputs, branchId: "br-other-1" }, roleInputs, false)).resolves.toMatchObject({
      branchId: "br-other-1"
    });
  });
});
