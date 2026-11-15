import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ServiceNowConnectionMethod } from "./servicenow-connection-enums";
import { validateServiceNowConnectionCredentials } from "./servicenow-connection-fns";
import { ServiceNowConnectionBasicAuthCredentialsSchema } from "./servicenow-connection-schemas";

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

vi.mock("@app/lib/validator/safe-request", () => ({ safeRequest: { get: vi.fn() } }));

const mockedGet = vi.mocked(safeRequest.get);

const INSTANCE_URL = "https://dev12345.service-now.com";

const config = {
  app: AppConnection.ServiceNow as const,
  method: ServiceNowConnectionMethod.BasicAuth as const,
  orgId: "org-1",
  credentials: { instanceUrl: INSTANCE_URL, username: "integration.user", password: "password" }
};

const upstreamError = (status: number, headers: Record<string, string> = {}) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data: "",
    statusText: "",
    headers,
    config: {} as AxiosResponse["config"]
  });

const validationError = async () => {
  try {
    await validateServiceNowConnectionCredentials(config);
  } catch (error) {
    return error as BadRequestError;
  }
  throw new Error("expected validation to fail");
};

describe("validateServiceNowConnectionCredentials", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  test.each([401, 403])("reports a %i as a credentials problem", async (status) => {
    mockedGet.mockRejectedValueOnce(upstreamError(status));

    const error = await validationError();

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toMatch(/verify the username and password/);
  });

  test("reports a redirect as an instance URL problem naming the redirect host", async () => {
    mockedGet.mockRejectedValueOnce(
      upstreamError(302, { location: "https://developer.servicenow.com/dev.do?token=abc#!/home" })
    );

    const error = await validationError();

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toMatch(/the instance URL redirected to 'developer\.servicenow\.com'/);
    expect(error.message).not.toMatch(/username and password/);
    expect(error.message).not.toMatch(/token=abc|dev\.do/);
  });

  test("resolves a relative redirect against the instance URL", async () => {
    mockedGet.mockRejectedValueOnce(upstreamError(301, { location: "/login.do" }));

    expect((await validationError()).message).toMatch(/redirected to 'dev12345\.service-now\.com'/);
  });

  test("reports a redirect without a location header without naming a host", async () => {
    mockedGet.mockRejectedValueOnce(upstreamError(302));

    const error = await validationError();

    expect(error.message).toMatch(/the instance URL returned a redirect/);
    expect(error.message).not.toMatch(/username and password/);
  });
});

describe("ServiceNowConnectionBasicAuthCredentialsSchema", () => {
  const parse = (instanceUrl: string) =>
    ServiceNowConnectionBasicAuthCredentialsSchema.safeParse({ instanceUrl, username: "user", password: "password" });

  test("rejects an instance URL without a scheme instead of throwing", () => {
    const result = parse("dev12345.service-now.com");

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Invalid Instance URL");
    expect(result.error?.issues.map((issue) => issue.message)).not.toContain(
      "Instance URL must be the base URL of your ServiceNow instance, without a path or query string"
    );
  });

  test("rejects an instance URL with a path", () => {
    const result = parse(`${INSTANCE_URL}/now/nav/ui`);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Instance URL must be the base URL of your ServiceNow instance, without a path or query string"
    );
  });

  test("accepts the base URL and strips its trailing slash", () => {
    const result = parse(`${INSTANCE_URL}/`);

    expect(result.success).toBe(true);
    expect(result.data?.instanceUrl).toBe(INSTANCE_URL);
  });
});
