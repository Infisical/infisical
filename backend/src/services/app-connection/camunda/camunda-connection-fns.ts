import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { CamundaConnectionMethod } from "./camunda-connection-enums";
import { TAuthorizeCamundaConnection, TCamundaConnection, TCamundaConnectionConfig } from "./camunda-connection-types";

export const getCamundaConnectionListItem = () => {
  return {
    name: "Camunda" as const,
    app: AppConnection.Camunda as const,
    methods: Object.values(CamundaConnectionMethod) as [CamundaConnectionMethod.ClientCredentials]
  };
};

const authorizeCamundaConnection = async ({
  clientId,
  clientSecret
}: Pick<TCamundaConnection["credentials"], "clientId" | "clientSecret">) => {
  const { data } = await request.post<TAuthorizeCamundaConnection>(
    IntegrationUrls.CAMUNDA_TOKEN_URL,
    {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: "api.cloud.camunda.io"
    },
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  return { accessToken: data.access_token, expiresAt: data.expires_in * 1000 + Date.now() };
};

export const getCamundaConnectionAccessToken = async (
  { id, orgId, credentials, projectId }: TCamundaConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const { clientSecret, clientId, accessToken, expiresAt } = credentials;

  // get new token if less than 30 seconds from expiry
  if (Date.now() < expiresAt - 30_000) {
    return accessToken;
  }

  const authData = await authorizeCamundaConnection({ clientId, clientSecret });

  const updatedCredentials: TCamundaConnection["credentials"] = {
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

export const validateCamundaConnectionCredentials = async (appConnection: TCamundaConnectionConfig) => {
  const { credentials } = appConnection;

  try {
    const { accessToken, expiresAt } = await authorizeCamundaConnection(appConnection.credentials);

    return {
      ...credentials,
      accessToken,
      expiresAt
    };
  } catch (e: unknown) {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};
