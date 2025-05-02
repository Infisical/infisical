import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getHCVaultAccessToken, getHCVaultInstanceUrl } from "@app/services/app-connection/hc-vault";
import {
  THCVaultListVariables,
  THCVaultListVariablesResponse,
  THCVaultSyncWithCredentials,
  TPostHCVaultVariable
} from "@app/services/secret-sync/hc-vault/hc-vault-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

const listHCVaultVariables = async ({ instanceUrl, namespace, mount, accessToken, path }: THCVaultListVariables) => {
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  try {
    const { data } = await request.get<THCVaultListVariablesResponse>(
      `${instanceUrl}/v1/${removeTrailingSlash(mount)}/data/${path}`,
      {
        headers: {
          "X-Vault-Token": accessToken,
          ...(namespace ? { "X-Vault-Namespace": namespace } : {})
        }
      }
    );

    return data.data.data;
  } catch (error: unknown) {
    // Returning an empty set when a path isn't found allows that path to be created by a later POST request
    if (isAxiosError(error) && error.response?.status === 404) {
      return {};
    }
    throw error;
  }
};

// Hashicorp Vault updates all variables in one batch. This is to respect their versioning
const updateHCVaultVariables = async ({
  path,
  instanceUrl,
  namespace,
  accessToken,
  mount,
  data
}: TPostHCVaultVariable) => {
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return request.post(
    `${instanceUrl}/v1/${removeTrailingSlash(mount)}/data/${path}`,
    {
      data
    },
    {
      headers: {
        "X-Vault-Token": accessToken,
        ...(namespace ? { "X-Vault-Namespace": namespace } : {}),
        "Content-Type": "application/json"
      }
    }
  );
};

export const HCVaultSyncFns = {
  syncSecrets: async (secretSync: THCVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { mount, path },
      syncOptions: { disableSecretDeletion }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables({
      instanceUrl,
      accessToken,
      namespace,
      mount,
      path
    });
    let tainted = false;

    for (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;
      if (value !== variables[key]) {
        variables[key] = value;
        tainted = true;
      }
    }

    if (disableSecretDeletion) return;

    for await (const [key] of Object.entries(variables)) {
      if (!(key in secretMap)) {
        delete variables[key];
        tainted = true;
      }
    }

    // Only update variables if there was a change detected
    if (!tainted) return;

    try {
      await updateHCVaultVariables({ accessToken, instanceUrl, namespace, mount, path, data: variables });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },
  removeSecrets: async (secretSync: THCVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables({ instanceUrl, namespace, accessToken, mount, path });

    for await (const [key] of Object.entries(variables)) {
      if (key in secretMap) {
        delete variables[key];
      }
    }

    try {
      await updateHCVaultVariables({ accessToken, instanceUrl, namespace, mount, path, data: variables });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },
  getSecrets: async (secretSync: THCVaultSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables({
      instanceUrl,
      namespace,
      accessToken,
      mount,
      path
    });

    return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, { value }]));
  }
};
