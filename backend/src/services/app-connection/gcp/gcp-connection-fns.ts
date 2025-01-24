import { gaxios, Impersonated, JWT } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { getAppConnectionMethodName } from "../app-connection-fns";
import { GcpConnectionMethod } from "./gcp-connection-enums";
import { TGcpConnectionConfig } from "./gcp-connection-types";

export const getGcpAppConnectionListItem = () => {
  return {
    name: "GCP" as const,
    app: AppConnection.GCP as const,
    methods: Object.values(GcpConnectionMethod) as [GcpConnectionMethod.ServiceAccountImpersonation]
  };
};

export const validateGcpConnectionCredentials = async (appConnection: TGcpConnectionConfig) => {
  const appCfg = getConfig();

  if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
    throw new InternalServerError({
      message: `Environment variables have not been configured for GCP ${getAppConnectionMethodName(
        GcpConnectionMethod.ServiceAccountImpersonation
      )}`
    });
  }

  const credJson = JSON.parse(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) as {
    client_email: string;
    private_key: string;
  };

  const sourceClient = new JWT({
    email: credJson.client_email,
    key: credJson.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });

  const impersonatedCredentials = new Impersonated({
    sourceClient,
    targetPrincipal: appConnection.credentials.serviceAccountEmail,
    lifetime: 3600,
    delegates: [],
    targetScopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });

  let tokenResponse: GetAccessTokenResponse | undefined;
  try {
    tokenResponse = await impersonatedCredentials.getAccessToken();
  } catch (error) {
    let message = "Unable to validate connection";
    if (error instanceof gaxios.GaxiosError) {
      message = error.message;
    }

    throw new BadRequestError({
      message
    });
  }

  if (!tokenResponse || !tokenResponse.token) {
    throw new BadRequestError({
      message: `Unable to validate connection`
    });
  }

  return appConnection.credentials;
};
