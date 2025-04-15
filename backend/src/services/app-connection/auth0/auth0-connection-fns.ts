import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { Auth0ConnectionMethod } from "./auth0-connection-enums";
import { TAuth0AccessTokenResponse, TAuth0Connection, TAuth0ConnectionConfig } from "./auth0-connection-types";

export const getAuth0ConnectionListItem = () => {
  return {
    name: "Auth0" as const,
    app: AppConnection.Auth0 as const,
    methods: Object.values(Auth0ConnectionMethod) as [Auth0ConnectionMethod.ClientCredentials]
  };
};

const authorizeAuth0Connection = async ({
  clientId,
  clientSecret,
  domain,
  audience
}: TAuth0ConnectionConfig["credentials"]) => {
  const instanceUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  const { data } = await request.request<TAuth0AccessTokenResponse>({
    method: "POST",
    url: `${removeTrailingSlash(instanceUrl)}/oauth/token`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "client_credentials", // this will need to be resolved if we support methods other than client credentials
      client_id: clientId,
      client_secret: clientSecret,
      audience
    })
  });

  if (data.token_type !== "Bearer") {
    throw new Error(`Unhandled token type: ${data.token_type}`);
  }

  return {
    accessToken: data.access_token,
    // cap token lifespan to 10 minutes
    expiresAt: Math.min(data.expires_in * 1000, 600000) + Date.now()
  };
};

export const getAuth0ConnectionAccessToken = async (
  { id, orgId, credentials }: TAuth0Connection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const { expiresAt, accessToken } = credentials;

  // get new token if expired or less than 5 minutes until expiry
  if (Date.now() < expiresAt - 300000) {
    return accessToken;
  }

  const authData = await authorizeAuth0Connection(credentials);

  const updatedCredentials: TAuth0Connection["credentials"] = {
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

export const validateAuth0ConnectionCredentials = async ({ credentials }: TAuth0ConnectionConfig) => {
  try {
    const { accessToken, expiresAt } = await authorizeAuth0Connection(credentials);

    return {
      ...credentials,
      accessToken,
      expiresAt
    };
  } catch (e: unknown) {
    throw new BadRequestError({
      message: (e as Error).message ?? `Unable to validate connection: verify credentials`
    });
  }
};
