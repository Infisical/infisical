/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { packRules } from "@casl/ability/extra";
import { AxiosError } from "axios";
import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spy they reference must come from `vi.hoisted`.
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

// safeRequest's host validation and IP pinning are covered by safe-request.test.ts. Mocking it here
// keeps the assertions on the payload and options this provider hands it.
vi.mock("@app/lib/validator/safe-request", () => ({
  safeRequest: { post: (...args: unknown[]) => (postMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (url: string) => url
}));
vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com", ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

// eslint-disable-next-line import/first
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

// eslint-disable-next-line import/first
import { servicenowFactory } from "./servicenow";

const INSTANCE_URL = "https://acme.service-now.com";
const PASSWORD = "sup3r-s3cret-p@ss";
const EXPECTED_URL = `${INSTANCE_URL}/api/x_infis_approvals/infisical/v1/access_request`;

const PACKED_PERMISSIONS = packRules([
  {
    action: ["read", "create"],
    subject: "secrets",
    conditions: { environment: "prod", secretPath: { $glob: "/stripe" } }
  }
] as any);

const buildContext = (overrides: Record<string, any> = {}) =>
  ({
    connection: {
      id: "conn-1",
      app: AppConnection.ServiceNow,
      credentials: { instanceUrl: INSTANCE_URL, username: "infisical.integration", password: PASSWORD }
    },
    externalApprovalRequest: { id: "ext-req-1" },
    externalApprovalPolicy: {
      id: "ext-pol-1",
      type: "servicenow",
      connectionId: "conn-1",
      approverIdentityId: "identity-1"
    },
    accessApprovalRequest: {
      id: "acc-req-1",
      isTemporary: true,
      temporaryRange: "1h",
      note: "Rotating the live Stripe key for the incident in INC0042.",
      permissions: PACKED_PERMISSIONS,
      requestedByUser: {
        userId: "user-1",
        email: "adilson@infisical.com",
        firstName: "Adilson",
        lastName: "Franken",
        username: "adilson@infisical.com"
      }
    },
    project: { id: "proj-1", name: "payments-api", orgId: "org-1", slug: "payments-api" },
    ...overrides
  }) as any;

const { dispatch: dispatchFns } = servicenowFactory();
const dispatch = (ctx: any = buildContext()) => dispatchFns(ctx);

const axiosErrorWith = (status?: number, data: unknown = {}) =>
  new AxiosError(
    "Request failed",
    status ? "ERR_BAD_RESPONSE" : "ECONNRESET",
    // The password rides on the axios config, which is exactly what must not escape dispatch.
    { auth: { username: "infisical.integration", password: PASSWORD } } as any,
    undefined,
    status ? ({ status, data, statusText: "", headers: {}, config: {} } as any) : undefined
  );

const created = (body: Record<string, unknown> = {}) => ({
  data: { success: true, request_number: "INFAR0001001", sys_id: "a1b2c3d4e5f60718293a4b5c6d7e8f90", ...body }
});

describe("servicenowFactory dispatch", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(created());
  });

  it("posts the access request to the scoped app's inbound route with the contract's payload", async () => {
    await dispatch();

    expect(postMock).toHaveBeenCalledTimes(1);

    const [url, payload, options] = postMock.mock.calls[0];

    expect(url).toBe(EXPECTED_URL);
    expect(payload).toStrictEqual({
      request_id: "ext-req-1",
      external_request_id: "acc-req-1",
      callback_url: "https://app.infisical.com/api/v1/access-approvals/requests/acc-req-1/external-review",
      request_type: "secret_access",
      project_id: "proj-1",
      project_name: "payments-api",
      environment: "prod",
      secret_path: "/stripe",
      permissions: ["secrets:read", "secrets:create"],
      requestor_email: "adilson@infisical.com",
      requestor_name: "Adilson Franken",
      is_temporary: true,
      temporary_range: "1h",
      justification: "Rotating the live Stripe key for the incident in INC0042.",
      identity_id: "identity-1"
    });
    expect(options).toMatchObject({
      auth: { username: "infisical.integration", password: PASSWORD },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      allowPrivateIps: false,
      timeout: 30_000
    });
  });

  it("sends permissions as a flat array of scalar strings", async () => {
    await dispatch();

    const { permissions } = postMock.mock.calls[0][1];

    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.every((entry: unknown) => typeof entry === "string")).toBe(true);
    // The scoped app stores `permissions.join(",")`, so an entry carrying a comma cannot be split back apart.
    expect(permissions.some((entry: string) => entry.includes(","))).toBe(false);
  });

  it("sends is_temporary as a real boolean, since the scoped app checks `=== false`", async () => {
    await dispatch();
    expect(postMock.mock.calls[0][1].is_temporary).toBe(true);

    postMock.mockClear();

    await dispatch(
      buildContext({ accessApprovalRequest: { ...buildContext().accessApprovalRequest, isTemporary: false } })
    );
    expect(postMock.mock.calls[0][1].is_temporary).toBe(false);
  });

  it("omits the optional fields the request does not carry", async () => {
    const accessApprovalRequest = {
      ...buildContext().accessApprovalRequest,
      isTemporary: false,
      temporaryRange: null,
      note: null
    };

    await dispatch(
      buildContext({
        accessApprovalRequest,
        externalApprovalPolicy: { ...buildContext().externalApprovalPolicy, approverIdentityId: null }
      })
    );

    const payload = postMock.mock.calls[0][1];

    expect(payload).not.toHaveProperty("temporary_range");
    expect(payload).not.toHaveProperty("justification");
    expect(payload).not.toHaveProperty("identity_id");
  });

  it("falls back to the username when the requester has no email", async () => {
    const requestedByUser = {
      userId: "user-1",
      email: null,
      firstName: null,
      lastName: null,
      username: "adilson@infisical.com"
    };

    await dispatch(
      buildContext({ accessApprovalRequest: { ...buildContext().accessApprovalRequest, requestedByUser } })
    );

    expect(postMock.mock.calls[0][1]).toMatchObject({
      requestor_email: "adilson@infisical.com",
      requestor_name: "adilson@infisical.com"
    });
  });

  it("returns the created record's sys_id as the external id", async () => {
    await expect(dispatch()).resolves.toStrictEqual({ externalId: "a1b2c3d4e5f60718293a4b5c6d7e8f90" });
  });

  it("returns a null external id when the response carries no sys_id", async () => {
    postMock.mockResolvedValue({ data: { success: true } });

    await expect(dispatch()).resolves.toStrictEqual({ externalId: null });
  });

  it("treats a 409 as success and adopts the existing record's sys_id", async () => {
    postMock.mockRejectedValue(
      axiosErrorWith(409, {
        success: false,
        error: "Request with this request_id already exists",
        request_number: "INFAR0001001",
        sys_id: "existing-sys-id"
      })
    );

    await expect(dispatch()).resolves.toStrictEqual({ externalId: "existing-sys-id" });
  });

  it.each([
    ["a login redirect", 302],
    ["an unauthenticated request", 401],
    ["a missing role", 403],
    ["a rejected payload", 400],
    ["an uninstalled scoped app", 404]
  ])("fails the dispatch without retrying on %s", async (_label, status) => {
    postMock.mockRejectedValue(axiosErrorWith(status, { success: false, error: "Missing required field: project_id" }));

    await expect(dispatch()).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("includes the ServiceNow error object values in a 400 UnrecoverableError", async () => {
    postMock.mockRejectedValue(
      axiosErrorWith(400, {
        success: false,
        error: { message: "Invalid request", detail: "Missing required field: project_id" }
      })
    );

    const error: any = await dispatch().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toContain("Invalid request");
    expect(error.message).toContain("Missing required field: project_id");
    expect(error.message).not.toContain("[object Object]");
  });

  it.each([
    ["a server error", 500],
    ["a rate limit", 429],
    ["a request timeout", 408],
    ["a network failure", undefined]
  ])("lets the worker retry on %s", async (_label, status) => {
    postMock.mockRejectedValue(axiosErrorWith(status));

    const error = await dispatch().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
  });

  it("never lets the ServiceNow password escape in the thrown error", async () => {
    postMock.mockRejectedValue(axiosErrorWith(401));

    const error: any = await dispatch().catch((err: unknown) => err);

    // The queue worker logs whatever escapes here, and axios hangs the password off config.auth.
    expect(error).not.toBeInstanceOf(AxiosError);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(PASSWORD);
  });

  it("fails the dispatch without retrying when the requested permissions cannot be parsed", async () => {
    await expect(
      dispatch(buildContext({ accessApprovalRequest: { ...buildContext().accessApprovalRequest, permissions: [] } }))
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(postMock).not.toHaveBeenCalled();
  });

  it("refuses a connection that is not a ServiceNow connection", async () => {
    await expect(
      dispatch(buildContext({ connection: { id: "conn-2", app: AppConnection.GitHub, credentials: {} } }))
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(postMock).not.toHaveBeenCalled();
  });
});
