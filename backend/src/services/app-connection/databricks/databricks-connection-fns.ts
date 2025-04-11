import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { DatabricksConnectionMethod } from "./databricks-connection-enums";
import {
  TAuthorizeDatabricksConnection,
  TDatabricksConnection,
  TDatabricksConnectionConfig
} from "./databricks-connection-types";

export const getDatabricksConnectionListItem = () => {
  return {
    name: "Databricks" as const,
    app: AppConnection.Databricks as const,
    methods: Object.values(DatabricksConnectionMethod) as [DatabricksConnectionMethod.ServicePrincipal]
  };
};

const authorizeDatabricksConnection = async ({
  clientId,
  clientSecret,
  workspaceUrl
}: Pick<TDatabricksConnection["credentials"], "workspaceUrl" | "clientId" | "clientSecret">) => {
  await blockLocalAndPrivateIpAddresses(workspaceUrl);

  const { data } = await request.post<TAuthorizeDatabricksConnection>(
    `${removeTrailingSlash(workspaceUrl)}/oidc/v1/token`,
    "grant_type=client_credentials&scope=all-apis",
    {
      auth: {
        username: clientId,
        password: clientSecret
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return { accessToken: data.access_token, expiresAt: data.expires_in * 1000 + Date.now() };
};

export const getDatabricksConnectionAccessToken = async (
  { id, orgId, credentials }: TDatabricksConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const { clientSecret, clientId, workspaceUrl, accessToken, expiresAt } = credentials;

  // get new token if less than 10 minutes from expiry
  if (Date.now() < expiresAt - 10_000) {
    return accessToken;
  }

  const authData = await authorizeDatabricksConnection({ clientId, clientSecret, workspaceUrl });

  const updatedCredentials: TDatabricksConnection["credentials"] = {
    ...credentials,
    ...authData
  };

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: updatedCredentials,
    orgId,
    kmsService
  });

  await appConnectionDAL.updateById(id, { encryptedCredentials });

  return authData.accessToken;
};

export const validateDatabricksConnectionCredentials = async (appConnection: TDatabricksConnectionConfig) => {
  const { credentials } = appConnection;

  try {
    const { accessToken, expiresAt } = await authorizeDatabricksConnection(appConnection.credentials);

    return {
      ...credentials,
      accessToken,
      expiresAt
    };
  } catch (e: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection: verify credentials`
    });
  }
};
