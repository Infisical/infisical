import { Impersonated, JWT } from "google-auth-library";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { buildGcpSourceCredential } from "@app/services/app-connection/gcp/gcp-connection-fns";

import { GcpServiceAccountAuthMethod } from "../../pam/pam-enums";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const IMPERSONATION_SCOPES = [CLOUD_PLATFORM_SCOPE, "https://www.googleapis.com/auth/iam"];

const tokenError = (serviceAccountEmail: string, err: unknown) =>
  new BadRequestError({
    message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]: ${
      err instanceof Error ? err.message : String(err)
    }`
  });

// mints a short-lived access token for the target service account
export const mintGcpAccessToken = async ({
  serviceAccountEmail,
  authMethod,
  serviceAccountKeyJson,
  ttlSeconds = 3600
}: {
  serviceAccountEmail: string;
  authMethod: string;
  serviceAccountKeyJson?: string;
  ttlSeconds?: number;
}): Promise<string> => {
  let tokenResponse;

  if (authMethod === GcpServiceAccountAuthMethod.StaticKey) {
    const keyJson = JSON.parse(serviceAccountKeyJson as string) as { client_email: string; private_key: string };
    const jwtClient = new JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: [CLOUD_PLATFORM_SCOPE]
    });
    try {
      tokenResponse =
        keyJson.client_email === serviceAccountEmail
          ? await jwtClient.getAccessToken()
          : await new Impersonated({
              sourceClient: jwtClient,
              targetPrincipal: serviceAccountEmail,
              lifetime: ttlSeconds,
              delegates: [],
              targetScopes: IMPERSONATION_SCOPES
            }).getAccessToken();
    } catch (err) {
      throw tokenError(serviceAccountEmail, err);
    }
  } else {
    const appCfg = getConfig();
    if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
      throw new InternalServerError({
        message: "Environment variable has not been configured: INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL"
      });
    }
    const sourceClient = buildGcpSourceCredential(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL);
    try {
      tokenResponse = await new Impersonated({
        sourceClient,
        targetPrincipal: serviceAccountEmail,
        lifetime: ttlSeconds,
        delegates: [],
        targetScopes: IMPERSONATION_SCOPES
      }).getAccessToken();
    } catch (err) {
      throw tokenError(serviceAccountEmail, err);
    }
  }

  if (!tokenResponse?.token) {
    throw new BadRequestError({
      message: `Failed to obtain GCP access token for [serviceAccountEmail=${serviceAccountEmail}]`
    });
  }
  return tokenResponse.token;
};
