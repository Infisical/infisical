import { AxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { VenafiTppConnectionMethod } from "./venafi-tpp-connection-enums";
import { TVenafiTppConnectionConfig } from "./venafi-tpp-connection-types";

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
 * Authenticates with Venafi TPP via OAuth and returns an access token.
 */
export const authenticateVenafiTpp = async ({
  tppUrl,
  clientId,
  username,
  password
}: TVenafiTppCredentials): Promise<TVenafiTppOAuthResponse> => {
  const baseUrl = normalizeTppUrl(tppUrl);

  logger.info("Venafi TPP: Authenticating via OAuth token endpoint");

  const { data } = await request.post<TVenafiTppOAuthResponse>(`${baseUrl}/vedauth/authorize/oauth`, {
    client_id: clientId,
    username,
    password,
    scope: "certificate:manage,discover,revoke;configuration"
  });

  logger.info("Venafi TPP: Successfully obtained access token");

  return data;
};

/**
 * Revokes a Venafi TPP access token.
 */
export const revokeVenafiTppToken = async (tppUrl: string, accessToken: string): Promise<void> => {
  const baseUrl = normalizeTppUrl(tppUrl);

  try {
    await request.get(`${baseUrl}/vedauth/revoke/token`, {
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
    methods: Object.values(VenafiTppConnectionMethod) as [VenafiTppConnectionMethod.UsernamePassword]
  };
};

export const validateVenafiTppConnectionCredentials = async (config: TVenafiTppConnectionConfig) => {
  const { tppUrl, clientId, username, password } = config.credentials as TVenafiTppCredentials;
  const hasGateway = Boolean(config.gatewayId);

  const normalizedUrl = normalizeTppUrl(tppUrl);
  try {
    await blockLocalAndPrivateIpAddresses(normalizedUrl, hasGateway);
  } catch (error) {
    logger.error({ tppUrl, hasGateway }, "Venafi TPP: URL blocked by SSRF protection");
    throw error;
  }

  logger.info({ tppUrl }, "Venafi TPP: Validating connection credentials");

  let accessToken: string | undefined;
  try {
    const authResponse = await authenticateVenafiTpp({ tppUrl, clientId, username, password });
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
      await revokeVenafiTppToken(tppUrl, accessToken);
    }
  }

  return config.credentials;
};
