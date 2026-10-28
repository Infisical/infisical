import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DenoDeployConnectionMethod } from "./deno-deploy-connection-enums";
import {
  DENO_DEPLOY_APPS_MAX_PAGES,
  DENO_DEPLOY_APPS_PAGE_SIZE,
  listDenoDeployApps,
  validateDenoDeployConnectionCredentials
} from "./deno-deploy-connection-fns";
import { TDenoDeployConnection, TDenoDeployConnectionConfig } from "./deno-deploy-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, warn } = vi.hoisted(() => ({ get: vi.fn(), warn: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ request: { get } }));
vi.mock("@app/lib/logger", () => ({ logger: { warn, error: vi.fn() } }));

const config = {
  app: AppConnection.DenoDeploy,
  method: DenoDeployConnectionMethod.AccessToken,
  orgId: "org-id",
  credentials: { accessToken: "ddo_test-token" }
} as TDenoDeployConnectionConfig;

const connection = {
  credentials: { accessToken: "ddo_test-token" }
} as TDenoDeployConnection;

const axiosError = (status: number) =>
  new AxiosError("request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "Error",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code: "unauthorized", message: "Invalid token" } }
  });

const pageOf = (count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => ({
    id: `app-${start + index}`,
    slug: `app-${start + index}`
  }));

describe("validateDenoDeployConnectionCredentials", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("accepts a token that can list apps", async () => {
    get.mockResolvedValue({ data: pageOf(1), headers: {} });

    await expect(validateDenoDeployConnectionCredentials(config)).resolves.toEqual({
      accessToken: "ddo_test-token"
    });

    expect(get).toHaveBeenCalledWith(`${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps`, {
      params: { limit: 1 },
      headers: { Authorization: "Bearer ddo_test-token", Accept: "application/json" }
    });
  });

  it("keeps an optional organization ID without sending it to Deno Deploy", async () => {
    get.mockResolvedValue({ data: [], headers: {} });

    await expect(
      validateDenoDeployConnectionCredentials({
        ...config,
        credentials: { accessToken: "ddo_test-token", organizationId: "org_123" }
      })
    ).resolves.toEqual({
      accessToken: "ddo_test-token",
      organizationId: "org_123"
    });

    expect(get.mock.calls[0][0]).toBe(`${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps`);
    expect(get.mock.calls[0][1]).not.toHaveProperty("data");
  });

  it.each([401, 403])("rejects a token Deno Deploy answers with %s", async (status) => {
    get.mockRejectedValue(axiosError(status));

    const error = await validateDenoDeployConnectionCredentials(config).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain("access token was rejected");
  });

  it("names the Deno Deploy status for other HTTP failures", async () => {
    get.mockRejectedValue(axiosError(500));

    const error = await validateDenoDeployConnectionCredentials(config).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain("returned 500");
  });

  it("explains a failure to reach Deno Deploy", async () => {
    get.mockRejectedValue(new AxiosError("Network Error"));

    const error = await validateDenoDeployConnectionCredentials(config).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain("could not reach Deno Deploy");
  });
});

describe("listDenoDeployApps", () => {
  beforeEach(() => {
    get.mockReset();
    warn.mockReset();
  });

  it("follows Link pagination until the last page", async () => {
    get
      .mockResolvedValueOnce({
        data: pageOf(DENO_DEPLOY_APPS_PAGE_SIZE),
        headers: {
          link: `<${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps?cursor=page-2&limit=100>; rel="next"`
        }
      })
      .mockResolvedValueOnce({
        data: pageOf(2, DENO_DEPLOY_APPS_PAGE_SIZE),
        headers: {}
      });

    const apps = await listDenoDeployApps(connection);

    expect(apps).toHaveLength(DENO_DEPLOY_APPS_PAGE_SIZE + 2);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1] as { params: { limit: number; cursor?: string } }).toEqual(
      expect.objectContaining({
        params: { limit: DENO_DEPLOY_APPS_PAGE_SIZE, cursor: "page-2" }
      })
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("stops and logs when the page cap is reached", async () => {
    get.mockResolvedValue({
      data: pageOf(DENO_DEPLOY_APPS_PAGE_SIZE),
      headers: {
        link: `<${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps?cursor=more&limit=100>; rel="next"`
      }
    });

    const apps = await listDenoDeployApps(connection);

    expect(get).toHaveBeenCalledTimes(DENO_DEPLOY_APPS_MAX_PAGES);
    expect(apps).toHaveLength(DENO_DEPLOY_APPS_MAX_PAGES * DENO_DEPLOY_APPS_PAGE_SIZE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain(`${DENO_DEPLOY_APPS_MAX_PAGES} pages`);
  });
});
