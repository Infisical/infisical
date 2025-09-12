import { isAxiosError } from "axios";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { removeTrailingSlash } from "@app/lib/fn";
import {
  getHCVaultAccessToken,
  getHCVaultInstanceUrl,
  requestWithHCVaultGateway,
  THCVaultConnection
} from "@app/services/app-connection/hc-vault";
import {
  THCVaultListVariables,
  THCVaultListVariablesResponse,
  THCVaultSyncWithCredentials,
  TPostHCVaultVariable
} from "@app/services/secret-sync/hc-vault/hc-vault-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

const listHCVaultVariables = async (
  { instanceUrl, namespace, mount, accessToken, path }: THCVaultListVariables,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  try {
    const { data } = await requestWithHCVaultGateway<THCVaultListVariablesResponse>(connection, gatewayService, {
      url: `${instanceUrl}/v1/${removeTrailingSlash(mount)}/data/${path}`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        ...(namespace ? { "X-Vault-Namespace": namespace } : {})
      }
    });

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
const updateHCVaultVariables = async (
  { path, instanceUrl, namespace, accessToken, mount, data }: TPostHCVaultVariable,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  return requestWithHCVaultGateway(connection, gatewayService, {
    url: `${instanceUrl}/v1/${removeTrailingSlash(mount)}/data/${path}`,
    method: "POST",
    headers: {
      "X-Vault-Token": accessToken,
      ...(namespace ? { "X-Vault-Namespace": namespace } : {}),
      "Content-Type": "application/json"
    },
    data: { data }
  });
};

export const HCVaultSyncFns = {
  syncSecrets: async (
    secretSync: THCVaultSyncWithCredentials,
    secretMap: TSecretMap,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
  ) => {
    const {
      connection,
      environment,
      destinationConfig: { mount, path },
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables(
      {
        instanceUrl,
        accessToken,
        namespace,
        mount,
        path
      },
      connection,
      gatewayService
    );
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
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

      if (!(key in secretMap)) {
        delete variables[key];
        tainted = true;
      }
    }

    // Only update variables if there was a change detected
    if (!tainted) return;

    try {
      await updateHCVaultVariables(
        { accessToken, instanceUrl, namespace, mount, path, data: variables },
        connection,
        gatewayService
      );
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },
  removeSecrets: async (
    secretSync: THCVaultSyncWithCredentials,
    secretMap: TSecretMap,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
  ) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables(
      { instanceUrl, namespace, accessToken, mount, path },
      connection,
      gatewayService
    );

    for await (const [key] of Object.entries(variables)) {
      if (key in secretMap) {
        delete variables[key];
      }
    }

    try {
      await updateHCVaultVariables(
        { accessToken, instanceUrl, namespace, mount, path, data: variables },
        connection,
        gatewayService
      );
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },
  getSecrets: async (
    secretSync: THCVaultSyncWithCredentials,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
  ) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    const variables = await listHCVaultVariables(
      {
        instanceUrl,
        namespace,
        accessToken,
        mount,
        path
      },
      connection,
      gatewayService
    );

    return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, { value }]));
  }
};
