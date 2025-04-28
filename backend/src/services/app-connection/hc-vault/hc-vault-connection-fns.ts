import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HCVaultConnectionMethod } from "./hc-vault-connection-enums";
import {
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultMountResponse,
  TValidateHCVaultConnectionCredentials
} from "./hc-vault-connection-types";

export const getHCVaultInstanceUrl = async (config: THCVaultConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getHCVaultConnectionListItem = () => ({
  name: "HCVault" as const,
  app: AppConnection.HCVault as const,
  methods: Object.values(HCVaultConnectionMethod) as [
    HCVaultConnectionMethod.AccessToken,
    HCVaultConnectionMethod.AppRole
  ]
});

type TokenRespData = {
  auth: {
    client_token: string;
  };
};

export const getHCVaultAccessToken = async (connection: TValidateHCVaultConnectionCredentials) => {
  // Return access token directly if not using AppRole method
  if (connection.method !== HCVaultConnectionMethod.AppRole) {
    return connection.credentials.accessToken;
  }

  // Generate temporary token for AppRole method
  try {
    const { instanceUrl, roleId, secretId } = connection.credentials;
    const tokenResp = await request.post<TokenRespData>(
      `${removeTrailingSlash(instanceUrl)}/v1/auth/approle/login`,
      { role_id: roleId, secret_id: secretId },
      {
        headers: {
          "Content-Type": "application/json",
          ...(connection.credentials.namespace ? { "X-Vault-Namespace": connection.credentials.namespace } : {})
        }
      }
    );

    if (tokenResp.status !== 200) {
      throw new BadRequestError({
        message: `Unable to validate credentials: Hashicorp Vault responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
      });
    }

    return tokenResp.data.auth.client_token;
  } catch (e: unknown) {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateHCVaultConnectionCredentials = async (config: THCVaultConnectionConfig) => {
  const instanceUrl = await getHCVaultInstanceUrl(config);

  try {
    const accessToken = await getHCVaultAccessToken(config);

    // Verify token
    await request.get(`${instanceUrl}/v1/auth/token/lookup-self`, {
      headers: { "X-Vault-Token": accessToken }
    });

    return config.credentials;
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
};

export const listHCVaultMounts = async (appConnection: THCVaultConnection) => {
  const instanceUrl = await getHCVaultInstanceUrl(appConnection);
  const accessToken = await getHCVaultAccessToken(appConnection);

  const { data } = await request.get<THCVaultMountResponse>(`${instanceUrl}/v1/sys/mounts`, {
    headers: {
      "X-Vault-Token": accessToken,
      ...(appConnection.credentials.namespace ? { "X-Vault-Namespace": appConnection.credentials.namespace } : {})
    }
  });

  const mounts: string[] = [];

  // Filter for "kv" version 2 type only
  Object.entries(data.data).forEach(([path, mount]) => {
    if (mount.type === "kv" && mount.options?.version === "2") {
      mounts.push(path);
    }
  });

  return mounts;
};
