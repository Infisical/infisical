import { AxiosError, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { HerokuConnectionMethod } from "./heroku-connection-enums";
import { THerokuApp, THerokuConnection, THerokuConnectionConfig } from "./heroku-connection-types";

interface HerokuOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user_id: string;
  session_nonce: string;
}

export const getHerokuConnectionListItem = () => {
  const { CLIENT_ID_HEROKU } = getConfig();

  return {
    name: "Heroku" as const,
    app: AppConnection.Heroku as const,
    methods: Object.values(HerokuConnectionMethod) as [HerokuConnectionMethod.AuthToken, HerokuConnectionMethod.OAuth],
    oauthClientId: CLIENT_ID_HEROKU
  };
};

export const refreshHerokuToken = async (
  refreshToken: string,
  appId: string,
  orgId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<string> => {
  const { CLIENT_SECRET_HEROKU } = getConfig();

  const payload = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_secret: CLIENT_SECRET_HEROKU
  };

  const { data } = await request.post<{ access_token: string; expires_in: number }>(
    IntegrationUrls.HEROKU_TOKEN_URL,
    payload,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: {
      refreshToken,
      authToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000 - 60000)
    },
    orgId,
    kmsService
  });

  await appConnectionDAL.updateById(appId, { encryptedCredentials });

  return data.access_token;
};

export const exchangeHerokuOAuthCode = async (code: string): Promise<HerokuOAuthTokenResponse> => {
  const { CLIENT_SECRET_HEROKU } = getConfig();

  try {
    const response = await request.post<HerokuOAuthTokenResponse>(
      IntegrationUrls.HEROKU_TOKEN_URL,
      {
        grant_type: "authorization_code",
        code,
        client_secret: CLIENT_SECRET_HEROKU
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (!response.data) {
      throw new InternalServerError({
        message: "Failed to exchange OAuth code: Empty response"
      });
    }

    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to exchange OAuth code: ${error.response?.data?.message || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to exchange OAuth code"
    });
  }
};

export const validateHerokuConnectionCredentials = async (config: THerokuConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  let authToken: string;
  let oauthData: HerokuOAuthTokenResponse | null = null;

  if (method === HerokuConnectionMethod.OAuth && "code" in inputCredentials) {
    oauthData = await exchangeHerokuOAuthCode(inputCredentials.code);
    authToken = oauthData.access_token;
  } else if (method === HerokuConnectionMethod.AuthToken && "authToken" in inputCredentials) {
    authToken = inputCredentials.authToken;
  } else {
    throw new BadRequestError({
      message: "Invalid credentials for the selected connection method"
    });
  }

  let response: AxiosResponse<THerokuApp[]> | null = null;

  try {
    response = await request.get<THerokuApp[]>(`${IntegrationUrls.HEROKU_API_URL}/apps`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/vnd.heroku+json; version=3"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  if (!response?.data) {
    throw new InternalServerError({
      message: "Failed to get apps: Response was empty"
    });
  }

  if (method === HerokuConnectionMethod.OAuth && oauthData) {
    return {
      authToken,
      refreshToken: oauthData.refresh_token,
      expiresIn: oauthData.expires_in,
      tokenType: oauthData.token_type,
      userId: oauthData.user_id,
      sessionNonce: oauthData.session_nonce
    };
  }

  return inputCredentials;
};

export const listHerokuApps = async ({
  appConnection,
  appConnectionDAL,
  kmsService
}: {
  appConnection: THerokuConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<THerokuApp[]> => {
  let authCredential = appConnection.credentials.authToken;
  if (
    appConnection.method === HerokuConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    appConnection.credentials.expiresAt < new Date()
  ) {
    authCredential = await refreshHerokuToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnectionDAL,
      kmsService
    );
  }

  const { data } = await request.get<THerokuApp[]>(`${IntegrationUrls.HEROKU_API_URL}/apps`, {
    headers: {
      Authorization: `Bearer ${authCredential}`,
      Accept: "application/vnd.heroku+json; version=3"
    }
  });

  if (!data) {
    throw new InternalServerError({
      message: "Failed to get apps: Response was empty"
    });
  }

  return data.map((res) => ({ name: res.name, id: res.id }));
};
