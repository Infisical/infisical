import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/validate-url";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { VenafiTppConnectionMethod } from "./venafi-tpp-connection-enums";
import { TVenafiTppConnectionConfig } from "./venafi-tpp-connection-types";

export type TVenafiTppGatewayRequestConfig = AxiosRequestConfig & { url: string };

type TVenafiTppCredentials = {
  tppUrl: string;
  clientId: string;
  username: string;
  password: string;
};

type TVenafiTppOAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires: number;
  token_type: string;
  scope: string;
  identity: string;
};

/**
 * Normalizes the TPP base URL by removing trailing slashes
 */
const normalizeTppUrl = (tppUrl: string): string => {
  return tppUrl.replace(new RE2("\\/+$"), "");
};

/**
 * Issues an HTTP request to the Venafi TPP server, routing through the configured
 * gateway transport when the connection has a gatewayId set.
 */
export const requestWithVenafiTppGateway = async <T>(
  appConnection: { gatewayId?: string | null },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: TVenafiTppGatewayRequestConfig
): Promise<AxiosResponse<T>> => {
  const { gatewayId } = appConnection;

  const url = new URL(requestConfig.url);

  // Non-gateway path: use safeRequest to validate and pin the connection.
  if (!gatewayId) {
    return safeRequest.request<T>(requestConfig);
  }

  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
  // eslint-disable-next-line no-nested-ternary
  const targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;

  const gatewayConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });

  if (!gatewayConnectionDetails) {
    throw new BadRequestError({
      message: "Venafi TPP connections only support v2 gateways. Please attach a v2 gateway to this connection."
    });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const isHttps = url.protocol === "https:";
      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        headers: {
          ...requestConfig.headers,
          Host: targetHost
        },
        ...(isHttps && {
          httpsAgent: new https.Agent({
            servername: targetHost
          })
        })
      };

      try {
        return await request.request(finalRequestConfig);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error(
            { message: error.message, data: (error.response as undefined | { data: unknown })?.data },
            "Error during Venafi TPP gateway request:"
          );
        }
        throw error;
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: gatewayConnectionDetails.relayHost,
      gateway: gatewayConnectionDetails.gateway,
      relay: gatewayConnectionDetails.relay
    }
  );
};

/**
 * Authenticates with Venafi TPP via OAuth and returns an access token.
 */
export const authenticateVenafiTpp = async (
  { credentials, ...appConnection }: { gatewayId?: string | null; credentials: TVenafiTppCredentials },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<TVenafiTppOAuthResponse> => {
  const { tppUrl, clientId, username, password } = credentials;
  const baseUrl = normalizeTppUrl(tppUrl);

  logger.info("Venafi TPP: Authenticating via OAuth token endpoint");

  const { data } = await requestWithVenafiTppGateway<TVenafiTppOAuthResponse>(appConnection, gatewayV2Service, {
    method: "POST",
    url: `${baseUrl}/vedauth/authorize/oauth`,
    data: {
      client_id: clientId,
      username,
      password,
      scope: "certificate:manage,discover,revoke;configuration"
    }
  });

  logger.info("Venafi TPP: Successfully obtained access token");

  return data;
};

/**
 * Revokes a Venafi TPP access token.
 */
export const revokeVenafiTppToken = async (
  { credentials, ...appConnection }: { gatewayId?: string | null; credentials: { tppUrl: string } },
  accessToken: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<void> => {
  const baseUrl = normalizeTppUrl(credentials.tppUrl);

  try {
    await requestWithVenafiTppGateway(appConnection, gatewayV2Service, {
      method: "GET",
      url: `${baseUrl}/vedauth/revoke/token`,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    logger.info("Venafi TPP: Successfully revoked access token");
  } catch (error) {
    logger.warn(error, "Venafi TPP: Failed to revoke access token");
  }
};

export const getVenafiTppHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json"
});

export const getVenafiTppConnectionListItem = () => {
  return {
    name: "Venafi TPP" as const,
    app: AppConnection.VenafiTpp as const,
    methods: Object.values(VenafiTppConnectionMethod) as [VenafiTppConnectionMethod.OAuth]
  };
};

export const validateVenafiTppConnectionCredentials = async (
  config: TVenafiTppConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const credentials = config.credentials as TVenafiTppCredentials;
  const { tppUrl } = credentials;

  logger.info({ tppUrl }, "Venafi TPP: Validating connection credentials");

  let accessToken: string | undefined;
  try {
    const authResponse = await authenticateVenafiTpp({ gatewayId: config.gatewayId, credentials }, gatewayV2Service);
    accessToken = authResponse.access_token;

    logger.info(
      {
        tppUrl,
        identity: authResponse.identity,
        scope: authResponse.scope
      },
      "Venafi TPP: Credential validation successful"
    );
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    if (error instanceof AxiosError) {
      const statusCode = error.response?.status;
      const errorMessage =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (error.response?.data?.error_description as string) ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (error.response?.data?.error as string) ||
        error.message;

      logger.error({ tppUrl, statusCode, errorMessage }, "Venafi TPP: Failed to validate credentials");

      throw new BadRequestError({
        message: `Failed to validate Venafi TPP credentials: ${errorMessage}`
      });
    }
    logger.error(error, "Venafi TPP: Unexpected error during credential validation");
    throw new BadRequestError({
      message: `Failed to validate Venafi TPP credentials: ${(error as Error)?.message || "Unknown error"}`
    });
  } finally {
    if (accessToken) {
      await revokeVenafiTppToken({ gatewayId: config.gatewayId, credentials }, accessToken, gatewayV2Service);
    }
  }

  return config.credentials;
};
