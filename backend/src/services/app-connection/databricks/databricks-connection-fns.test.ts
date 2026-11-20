import { AxiosError, AxiosRequestConfig } from "axios";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DatabricksConnectionMethod, DatabricksConnectionScope } from "./databricks-connection-enums";
import {
  getDatabricksConnectionAccessToken,
  validateDatabricksConnectionCredentials
} from "./databricks-connection-fns";
import { TDatabricksConnection, TDatabricksConnectionConfig } from "./databricks-connection-types";

const { sendRequest, safeSendRequest } = vi.hoisted(() => ({
  sendRequest: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
  safeSendRequest: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { request: sendRequest } }));
vi.mock("@app/lib/validator/safe-request", () => ({
  getSharedHttpsAgent: () => "https-agent",
  safeRequest: { request: safeSendRequest }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({ encryptAppConnectionCredentials: vi.fn() }));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: async ({ host }: { host: string }) => [host]
}));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: async (callback: (port: number) => Promise<unknown>) => callback(4444)
}));

const getPlatformConnectionDetailsByGatewayId = vi.fn();
const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId };

const validate = (scopes?: DatabricksConnectionScope[], gatewayId?: string) =>
  validateDatabricksConnectionCredentials(
    {
      app: AppConnection.Databricks,
      method: DatabricksConnectionMethod.ServicePrincipal,
      orgId: "org-id",
      gatewayId,
      credentials: {
        workspaceUrl: "https://example.cloud.databricks.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        scopes
      }
    } as TDatabricksConnectionConfig,
    gatewayV2Service
  );

describe("validateDatabricksConnectionCredentials", () => {
  beforeEach(() => {
    sendRequest.mockReset();
    sendRequest.mockResolvedValue({ data: { access_token: "access-token", expires_in: 3600 } });
    safeSendRequest.mockReset();
    safeSendRequest.mockResolvedValue({ data: { access_token: "access-token", expires_in: 3600 } });
    getPlatformConnectionDetailsByGatewayId.mockReset();
    getPlatformConnectionDetailsByGatewayId.mockResolvedValue({ relayHost: "relay" });
  });

  test("requests the selected scopes", async () => {
    await validate([DatabricksConnectionScope.Secrets, DatabricksConnectionScope.Scim]);

    expect(String(safeSendRequest.mock.calls[0][0].data)).toBe("grant_type=client_credentials&scope=secrets+scim");
  });

  test.each([undefined, []])("requests all-apis when scopes are %o", async (scopes) => {
    await validate(scopes);

    expect(String(safeSendRequest.mock.calls[0][0].data)).toBe("grant_type=client_credentials&scope=all-apis");
  });

  test("surfaces the Databricks error description", async () => {
    safeSendRequest.mockRejectedValue(
      Object.assign(new AxiosError("Request failed with status code 400"), {
        response: { data: { error_description: "Scopes 'all-apis' are not assigned to the client" } }
      })
    );

    await expect(validate()).rejects.toThrow(
      "Unable to validate connection: Scopes 'all-apis' are not assigned to the client"
    );
  });

  test("calls the workspace through safeRequest when no gateway is set", async () => {
    await validate();

    expect(getPlatformConnectionDetailsByGatewayId).not.toHaveBeenCalled();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(safeSendRequest.mock.calls[0][0].url).toBe("https://example.cloud.databricks.com/oidc/v1/token");
  });

  test("routes the token request through the gateway when one is set", async () => {
    await validate(undefined, "gateway-id");

    expect(safeSendRequest).not.toHaveBeenCalled();
    expect(getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledWith({
      gatewayId: "gateway-id",
      targetHost: "example.cloud.databricks.com",
      targetPort: 443
    });

    const [config] = sendRequest.mock.calls[0];
    expect(config.url).toBe("https://localhost:4444/oidc/v1/token");
    expect(config.headers).toMatchObject({
      Host: "example.cloud.databricks.com",
      "Content-Type": "application/x-www-form-urlencoded"
    });
    expect(config.auth).toEqual({ username: "client-id", password: "client-secret" });
    expect(config.httpsAgent).toBe("https-agent");
  });

  test("fails with a clear message when the gateway is unavailable", async () => {
    getPlatformConnectionDetailsByGatewayId.mockResolvedValue(undefined);

    await expect(validate(undefined, "gateway-id")).rejects.toThrow(
      "Unable to connect to the Gateway assigned to this Databricks connection"
    );
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test("names the workspace as unreachable when no response comes back", async () => {
    sendRequest.mockRejectedValue(new AxiosError("connect ECONNREFUSED"));

    await expect(validate(undefined, "gateway-id")).rejects.toThrow(
      "Unable to validate connection: unable to reach the Databricks workspace, verify the workspace URL and Gateway"
    );
  });
});

describe("getDatabricksConnectionAccessToken", () => {
  const connectionOf = (gateway: Partial<Pick<TDatabricksConnection, "gatewayId" | "gatewayPoolId">>) =>
    ({
      id: "connection-id",
      orgId: "org-id",
      ...gateway,
      credentials: {
        workspaceUrl: "https://example.cloud.databricks.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "cached-token",
        expiresAt: Date.now() + 60 * 60 * 1000
      }
    }) as TDatabricksConnection;

  beforeEach(() => {
    sendRequest.mockReset();
    safeSendRequest.mockReset();
    safeSendRequest.mockResolvedValue({ data: { access_token: "access-token", expires_in: 3600 } });
    getPlatformConnectionDetailsByGatewayId.mockReset();
  });

  test("returns the cached token when the connection has no gateway", async () => {
    await expect(
      getDatabricksConnectionAccessToken(connectionOf({}), { updateById: vi.fn() }, {} as never)
    ).resolves.toBe("cached-token");
  });

  test.each([
    { gateway: { gatewayId: "gateway-id" }, message: "uses a Gateway," },
    { gateway: { gatewayPoolId: "pool-id" }, message: "uses a Gateway pool," }
  ])(
    "refuses a connection with $gateway when the caller can't use a gateway, even with a cached token",
    async ({ gateway, message }) => {
      await expect(
        getDatabricksConnectionAccessToken(connectionOf(gateway), { updateById: vi.fn() }, {} as never)
      ).rejects.toThrow(`This Databricks connection ${message} which is not supported on this operation`);
      expect(safeSendRequest).not.toHaveBeenCalled();
      expect(sendRequest).not.toHaveBeenCalled();
    }
  );

  test("refreshes the token through the gateway when the caller passes the gateway service", async () => {
    getPlatformConnectionDetailsByGatewayId.mockResolvedValue({ relayHost: "relay" });
    sendRequest.mockResolvedValue({ data: { access_token: "access-token", expires_in: 3600 } });
    const connection = connectionOf({ gatewayId: "gateway-id" });
    connection.credentials.expiresAt = 0;

    await expect(
      getDatabricksConnectionAccessToken(connection, { updateById: vi.fn() }, {} as never, { gatewayV2Service })
    ).resolves.toBe("access-token");
    expect(safeSendRequest).not.toHaveBeenCalled();
    expect(sendRequest.mock.calls[0][0].url).toBe("https://localhost:4444/oidc/v1/token");
  });
});
