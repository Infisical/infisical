import { AxiosError, AxiosRequestConfig } from "axios";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { getSharedHttpsAgent, safeRequest } from "@app/lib/validator/safe-request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { DatabricksConnectionMethod } from "./databricks-connection-enums";
import {
  TAuthorizeDatabricksConnection,
  TDatabricksConnection,
  TDatabricksConnectionConfig,
  TDatabricksGatewayDeps,
  TDatabricksRequestConfig
} from "./databricks-connection-types";

type TDatabricksRequest = Pick<AxiosRequestConfig, "method" | "data" | "params" | "auth"> & {
  path: string;
  headers?: Record<string, string>;
};

export const getDatabricksConnectionListItem = () => {
  return {
    name: "Databricks" as const,
    app: AppConnection.Databricks as const,
    methods: Object.values(DatabricksConnectionMethod) as [DatabricksConnectionMethod.ServicePrincipal]
  };
};

// A caller that doesn't pass the gateway services would otherwise reach the workspace over the internet, bypassing the
// Gateway the connection is configured to use
export const assertDatabricksGatewaySupported = (
  { gatewayId, gatewayPoolId }: Pick<TDatabricksRequestConfig, "gatewayId" | "gatewayPoolId">,
  { gatewayV2Service, gatewayPoolService }: TDatabricksGatewayDeps
) => {
  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This Databricks connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  if ((gatewayId || gatewayPoolId) && !gatewayV2Service) {
    throw new BadRequestError({
      message: "This Databricks connection uses a Gateway, which is not supported on this operation"
    });
  }
};

export const databricksRequest = async <T>(
  config: TDatabricksRequestConfig,
  { path, headers, ...requestConfig }: TDatabricksRequest,
  deps: TDatabricksGatewayDeps = {}
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = config;
  const { gatewayV2Service, gatewayPoolService } = deps;

  assertDatabricksGatewaySupported(config, deps);

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  const url = new URL(`${removeTrailingSlash(credentials.workspaceUrl)}${path}`);

  if (!gatewayId || !gatewayV2Service) {
    // validates the URL and pins the connection to the checked IPs, so DNS rebinding cannot redirect it
    const { data } = await safeRequest.request<T>({ ...requestConfig, url: url.toString(), headers });

    return data;
  }

  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
  const isHttps = url.protocol === "https:";
  const targetPort = url.port ? Number(url.port) : (isHttps && 443) || 80;

  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to the Gateway assigned to this Databricks connection" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const proxiedUrl = new URL(url.toString());
      proxiedUrl.host = `localhost:${proxyPort}`;

      const { data } = await request.request<T>({
        ...requestConfig,
        url: proxiedUrl.toString(),
        headers: { ...headers, Host: url.host },
        maxRedirects: 0,
        ...(isHttps && {
          httpsAgent: getSharedHttpsAgent({ servername: targetHost, rejectUnauthorized: true })
        })
      });

      return data;
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      ...platformConnectionDetails
    }
  );
};

const authorizeDatabricksConnection = async (config: TDatabricksRequestConfig, deps: TDatabricksGatewayDeps = {}) => {
  const { clientId, clientSecret, scopes } = config.credentials;

  const data = await databricksRequest<TAuthorizeDatabricksConnection>(
    config,
    {
      method: "POST",
      path: "/oidc/v1/token",
      data: new URLSearchParams({ grant_type: "client_credentials", scope: scopes?.join(" ") || "all-apis" }),
      auth: {
        username: clientId,
        password: clientSecret
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    },
    deps
  );

  return { accessToken: data.access_token, expiresAt: data.expires_in * 1000 + Date.now() };
};

export const getDatabricksConnectionAccessToken = async (
  { id, orgId, credentials, projectId, gatewayId, gatewayPoolId }: TDatabricksConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  deps: TDatabricksGatewayDeps = {}
) => {
  // checked before the cached token is returned, since a caller without gateway support goes on to call the workspace
  // directly with it
  assertDatabricksGatewaySupported({ gatewayId, gatewayPoolId }, deps);

  const { accessToken, expiresAt } = credentials;

  // get new token if less than 10 minutes from expiry
  if (Date.now() < expiresAt - 10_000) {
    return accessToken;
  }

  const authData = await authorizeDatabricksConnection({ credentials, gatewayId, gatewayPoolId }, deps);

  const updatedCredentials: TDatabricksConnection["credentials"] = {
    ...credentials,
    ...authData
  };

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: updatedCredentials,
    orgId,
    kmsService,
    projectId
  });

  await appConnectionDAL.updateById(id, { encryptedCredentials });

  return authData.accessToken;
};

export const validateDatabricksConnectionCredentials = async (
  appConnection: TDatabricksConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials } = appConnection;

  try {
    const { accessToken, expiresAt } = await authorizeDatabricksConnection(appConnection, { gatewayV2Service });

    return {
      ...credentials,
      accessToken,
      expiresAt
    };
  } catch (e: unknown) {
    if (e instanceof BadRequestError) throw e;

    throw new BadRequestError({
      message: `Unable to validate connection: ${
        (e instanceof AxiosError && (e.response?.data as { error_description?: string })?.error_description) ||
        (e instanceof AxiosError &&
          !e.response &&
          "unable to reach the Databricks workspace, verify the workspace URL and Gateway") ||
        "verify credentials"
      }`
    });
  }
};
