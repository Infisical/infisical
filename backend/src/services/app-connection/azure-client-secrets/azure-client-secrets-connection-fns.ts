/* eslint-disable no-case-declarations */
import { AxiosError, AxiosResponse } from "axios";
import type { KeyObject } from "crypto";
import RE2 from "re2";
import { v4 as uuidv4 } from "uuid";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureClientSecretsConnectionMethod } from "./azure-client-secrets-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureClientSecretsConnectionCertificateCredentials,
  TAzureClientSecretsConnectionClientSecretCredentials,
  TAzureClientSecretsConnectionConfig,
  TAzureClientSecretsConnectionCredentials
} from "./azure-client-secrets-connection-types";

const generateClientAssertion = (
  clientId: string,
  tenantId: string,
  privateKey: string,
  certificate: string
): string => {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const certBuffer = Buffer.from(
    certificate
      .replace(new RE2("-----BEGIN CERTIFICATE-----"), "")
      .replace(new RE2("-----END CERTIFICATE-----"), "")
      .replace(new RE2("\\s", "g"), ""),
    "base64"
  );

  // thumbprint of the certificate is used for the jwt header
  const thumbprint = crypto.nativeCrypto.createHash("sha1").update(certBuffer).digest("hex");
  const x5t = Buffer.from(thumbprint, "hex").toString("base64url");

  // JWT Header
  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: tokenEndpoint,
    exp: now + 600, // expire the assertion in 10 minutes (not the access access token TTL, but rather the assertion TTL itself)
    iss: clientId,
    jti: uuidv4(), // random ID for the JWT
    nbf: now, // not before the jwt is valid
    sub: clientId
  };

  // encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  let keyObject: KeyObject;

  try {
    if (privateKey.includes("BEGIN PRIVATE KEY")) {
      keyObject = crypto.nativeCrypto.createPrivateKey(privateKey);
    } else {
      // if user forgot to wrap in begin/end private key, decode and use as der format
      keyObject = crypto.nativeCrypto.createPrivateKey({
        key: Buffer.from(privateKey, "base64"),
        format: "der",
        type: "pkcs8"
      });
    }
  } catch (error) {
    throw new BadRequestError({
      message: "Invalid private key format provided. Expected PEM format private key."
    });
  }

  // sign with private key
  const signer = crypto.nativeCrypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  signer.end();
  const signature = signer.sign(keyObject, "base64url");

  return `${signatureInput}.${signature}`;
};

export const getAzureClientSecretsConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID } = getConfig();

  return {
    name: "Azure Client Secrets" as const,
    app: AppConnection.AzureClientSecrets as const,
    methods: Object.values(AzureClientSecretsConnectionMethod) as [
      AzureClientSecretsConnectionMethod.OAuth,
      AzureClientSecretsConnectionMethod.ClientSecret,
      AzureClientSecretsConnectionMethod.Certificate
    ],
    oauthClientId: INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID
  };
};

export const getAzureConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appCfg = getConfig();
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AzureClientSecrets) {
    throw new BadRequestError({
      message: `Connection with ID '${connectionId}' is not an Azure Client Secrets connection`
    });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials
  })) as TAzureClientSecretsConnectionCredentials;

  const { refreshToken } = credentials;
  const currentTime = Date.now();
  switch (appConnection.method) {
    case AzureClientSecretsConnectionMethod.OAuth: {
      if (
        !appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID ||
        !appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET
      ) {
        throw new BadRequestError({
          message: `Azure OAuth environment variables have not been configured`
        });
      }
      const { data } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", credentials.tenantId || "common"),
        new URLSearchParams({
          grant_type: "refresh_token",
          scope: `openid offline_access https://graph.microsoft.com/.default`,
          client_id: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID,
          client_secret: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET,
          refresh_token: refreshToken
        })
      );

      const updatedCredentials = {
        ...credentials,
        accessToken: data.access_token,
        expiresAt: currentTime + data.expires_in * 1000,
        refreshToken: data.refresh_token
      };

      const encryptedCredentials = await encryptAppConnectionCredentials({
        credentials: updatedCredentials,
        orgId: appConnection.orgId,
        projectId: appConnection.projectId,
        kmsService
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials });

      return data.access_token;
    }
    case AzureClientSecretsConnectionMethod.ClientSecret: {
      const accessTokenCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        projectId: appConnection.projectId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials
      })) as TAzureClientSecretsConnectionClientSecretCredentials;
      const { accessToken, expiresAt, clientId, clientSecret, tenantId } = accessTokenCredentials;
      if (accessToken && expiresAt && expiresAt > currentTime + 300000) {
        return accessToken;
      }

      const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: `https://graph.microsoft.com/.default`,
          client_id: clientId,
          client_secret: clientSecret
        })
      );

      const updatedClientCredentials = {
        ...accessTokenCredentials,
        accessToken: clientData.access_token,
        expiresAt: currentTime + clientData.expires_in * 1000
      };

      const encryptedClientCredentials = await encryptAppConnectionCredentials({
        credentials: updatedClientCredentials,
        orgId: appConnection.orgId,
        projectId: appConnection.projectId,
        kmsService
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return clientData.access_token;
    }

    case AzureClientSecretsConnectionMethod.Certificate: {
      const accessTokenCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        projectId: appConnection.projectId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials
      })) as TAzureClientSecretsConnectionCertificateCredentials;
      const { accessToken, expiresAt, clientId, tenantId, certificateBody, privateKey } = accessTokenCredentials;
      if (accessToken && expiresAt && expiresAt > currentTime + 300000) {
        return accessToken;
      }

      const clientAssertion = generateClientAssertion(clientId, tenantId, privateKey, certificateBody);
      const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: `https://graph.microsoft.com/.default`,
          client_id: clientId,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          client_assertion: clientAssertion
        })
      );

      const updatedClientCredentials = {
        ...accessTokenCredentials,
        accessToken: clientData.access_token,
        expiresAt: currentTime + clientData.expires_in * 1000
      };

      const encryptedClientCredentials = await encryptAppConnectionCredentials({
        credentials: updatedClientCredentials,
        orgId: appConnection.orgId,
        projectId: appConnection.projectId,
        kmsService
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return clientData.access_token;
    }

    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${appConnection.method as AzureClientSecretsConnectionMethod}`
      });
  }
};

export const validateAzureClientSecretsConnectionCredentials = async (config: TAzureClientSecretsConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const {
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET,
    SITE_URL
  } = getConfig();

  switch (method) {
    case AzureClientSecretsConnectionMethod.OAuth: {
      if (!SITE_URL) {
        throw new InternalServerError({ message: "SITE_URL env var is required to complete Azure OAuth flow" });
      }

      if (
        !INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID ||
        !INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET
      ) {
        throw new InternalServerError({
          message: `Azure ${getAppConnectionMethodName(method)} environment variables have not been configured`
        });
      }

      let tokenResp: AxiosResponse<ExchangeCodeAzureResponse> | null = null;
      let tokenError: AxiosError | null = null;

      try {
        tokenResp = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", inputCredentials.tenantId || "common"),
          new URLSearchParams({
            grant_type: "authorization_code",
            code: inputCredentials.code,
            scope: `openid offline_access https://graph.microsoft.com/.default`,
            client_id: INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID,
            client_secret: INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET,
            redirect_uri: `${SITE_URL}/organization/app-connections/azure/oauth/callback`
          })
        );
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          tokenError = e;
        } else {
          throw new BadRequestError({
            message: "Unable to validate connection: verify credentials"
          });
        }
      }

      if (tokenError) {
        if (tokenError instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (tokenError?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else {
          throw new InternalServerError({
            message: "Failed to get access token"
          });
        }
      }

      if (!tokenResp) {
        throw new InternalServerError({
          message: `Failed to get access token: Token was empty with no error`
        });
      }

      return {
        tenantId: inputCredentials.tenantId,
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000
      };
    }

    case AzureClientSecretsConnectionMethod.ClientSecret: {
      const { tenantId, clientId, clientSecret } = inputCredentials;
      try {
        const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
          new URLSearchParams({
            grant_type: "client_credentials",
            scope: `https://graph.microsoft.com/.default`,
            client_id: clientId,
            client_secret: clientSecret
          })
        );

        return {
          tenantId,
          accessToken: clientData.access_token,
          expiresAt: Date.now() + clientData.expires_in * 1000,
          clientId,
          clientSecret
        };
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (e?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else {
          throw new InternalServerError({
            message: "Failed to get access token"
          });
        }
      }
    }
    case AzureClientSecretsConnectionMethod.Certificate: {
      const { tenantId, certificateBody, privateKey, clientId } = inputCredentials;
      try {
        const clientAssertion = generateClientAssertion(clientId, tenantId, privateKey, certificateBody);

        const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

        const params = new URLSearchParams({
          client_id: clientId,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          client_assertion: clientAssertion,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials"
        });

        const response = await request.post<ExchangeCodeAzureResponse>(tokenEndpoint, params.toString(), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        });

        return {
          tenantId,
          clientId,
          certificateBody,
          privateKey,
          accessToken: response.data.access_token,
          expiresAt: Date.now() + response.data.expires_in * 1000
        };
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (e?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else if (e instanceof BadRequestError) {
          throw e;
        } else {
          logger.error(
            e,
            "validateAzureClientSecretsConnectionCredentials: Failed to get access token using certificate authentication"
          );
          throw new InternalServerError({
            message: "Failed to get access token"
          });
        }
      }
    }

    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${method as AzureClientSecretsConnectionMethod}`
      });
  }
};
