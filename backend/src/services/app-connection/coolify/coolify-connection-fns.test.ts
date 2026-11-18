/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports, so the spies they reference must come from `vi.hoisted`.
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

/* eslint-disable import/first */
import { listCoolifyResources, validateCoolifyConnectionCredentials } from "./coolify-connection-fns";
/* eslint-enable import/first */

const API_URL = "https://coolify.example.com/api/v1";

const connection = {
  id: "connection-id",
  app: "coolify",
  method: "api-token",
  credentials: { instanceUrl: "https://coolify.example.com", apiToken: "1|token" },
  gatewayId: null,
  gatewayPoolId: null
} as any;

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any;
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn(async () => null) } as any;

const axiosErrorWithStatus = (status: number, data?: unknown) =>
  new AxiosError("Request failed", undefined, undefined, undefined, { status, data } as AxiosResponse);

// Answers each request by method and path, rejecting with the error a route maps to
const stubCoolify = (routes: Record<string, unknown>) =>
  safeRequestMock.mockImplementation(async ({ method, url }: { method: string; url: string }) => {
    const answer = routes[`${method} ${url.replace(API_URL, "")}`];
    if (answer instanceof Error) throw answer;
    return { data: answer };
  });

const PERMISSION_CHECKS = {
  "PATCH /applications/infisical-permission-check/envs/bulk": axiosErrorWithStatus(404),
  "DELETE /applications/infisical-permission-check/envs/infisical-permission-check": axiosErrorWithStatus(404)
};

describe("validateCoolifyConnectionCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a token that can read, write and delete variables, without changing anything", async () => {
    stubCoolify({ "GET /projects": [], ...PERMISSION_CHECKS });

    await expect(validateCoolifyConnectionCredentials(connection, gatewayV2Service)).resolves.toEqual(
      connection.credentials
    );

    const [, write, remove] = safeRequestMock.mock.calls.map(([config]) => config);
    expect(write.data).toEqual({ data: [] });
    expect(remove.method).toBe("DELETE");
  });

  it("refuses a token that can't write variables", async () => {
    stubCoolify({
      "GET /projects": [],
      ...PERMISSION_CHECKS,
      "PATCH /applications/infisical-permission-check/envs/bulk": axiosErrorWithStatus(403, {
        message: "Missing required permissions: write"
      })
    });

    await expect(validateCoolifyConnectionCredentials(connection, gatewayV2Service)).rejects.toThrow(
      "Unable to validate Coolify connection: Missing required permissions: write"
    );
  });

  it("points at the instance URL when it doesn't serve the Coolify API", async () => {
    stubCoolify({ "GET /projects": axiosErrorWithStatus(404, { message: "Not found." }) });

    await expect(validateCoolifyConnectionCredentials(connection, gatewayV2Service)).rejects.toThrow(
      "the instance URL did not respond like a Coolify instance"
    );
  });
});

describe("listCoolifyResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const resources = [
    { uuid: "app-uuid", name: "web", type: "application", environment_id: 1 },
    { uuid: "svc-uuid", name: "n8n", type: "service", environment_id: 2 }
  ];
  const projects = [
    { uuid: "project-a", name: "Shop" },
    { uuid: "project-b", name: "Tools" }
  ];

  it("lists the resources of the projects it can read when another project fails", async () => {
    stubCoolify({
      "GET /resources": resources,
      "GET /projects": projects,
      "GET /projects/project-a/environments": [{ id: 1, name: "production" }],
      "GET /projects/project-b/environments": axiosErrorWithStatus(500)
    });

    await expect(listCoolifyResources(connection, gatewayV2Service, gatewayPoolService)).resolves.toEqual([
      { id: "app-uuid", name: "web", type: "application", projectName: "Shop", environmentName: "production" }
    ]);
  });

  it("fails when no project can be read", async () => {
    stubCoolify({
      "GET /resources": resources,
      "GET /projects": projects,
      "GET /projects/project-a/environments": axiosErrorWithStatus(429, { message: "Too Many Attempts." }),
      "GET /projects/project-b/environments": axiosErrorWithStatus(429, { message: "Too Many Attempts." })
    });

    await expect(listCoolifyResources(connection, gatewayV2Service, gatewayPoolService)).rejects.toThrow(
      "Failed to list Coolify resources: Too Many Attempts."
    );
  });
});
