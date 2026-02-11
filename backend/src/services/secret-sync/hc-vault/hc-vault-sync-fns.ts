import { isAxiosError } from "axios";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import {
  getHCVaultAccessToken,
  getHCVaultInstanceUrl,
  requestWithHCVaultGateway,
  THCVaultConnection
} from "@app/services/app-connection/hc-vault";
import { KvVersion } from "@app/services/external-migration/external-migration-types";
import {
  THCVaultListVariables,
  THCVaultListVariablesResponse,
  THCVaultSyncWithCredentials,
  TPostHCVaultVariable
} from "@app/services/secret-sync/hc-vault/hc-vault-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

const getKvMountVersion = async ({
  instanceUrl,
  namespace,
  mount,
  accessToken,
  connection,
  gatewayService,
  gatewayV2Service
}: {
  instanceUrl: string;
  namespace?: string;
  mount: string;
  accessToken: string;
  connection: THCVaultConnection;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
}) => {
  const { data } = await requestWithHCVaultGateway<{
    data: {
      [key: string]: {
        options: {
          version?: string;
        } | null;
      };
    };
  }>(connection, gatewayService, gatewayV2Service, {
    url: `${instanceUrl}/v1/sys/mounts`,
    method: "GET",
    headers: {
      "X-Vault-Token": accessToken,
      ...(namespace ? { "X-Vault-Namespace": namespace } : {})
    }
  });

  const normalizedMount = `${removeTrailingSlash(mount)}/`;

  const mountData = data.data[normalizedMount];

  if (!mountData) {
    throw new Error(`Mount '${mount}' not found`);
  }

  // default to v1
  const kvVersion = mountData.options?.version === KvVersion.V2 ? KvVersion.V2 : KvVersion.V1;

  return {
    version: kvVersion
  };
};

const listHCVaultVariables = async (
  { instanceUrl, namespace, mount, mountVersion, accessToken, path }: THCVaultListVariables,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<{ [key: string]: string }> => {
  try {
    // KV v2 uses /data/ in the path, KV v1 does not
    const urlPath =
      mountVersion === KvVersion.V2
        ? `${removeTrailingSlash(mount)}/data/${path}`
        : `${removeTrailingSlash(mount)}/${path}`;

    if (mountVersion === KvVersion.V2) {
      // KV v2 response structure
      const { data } = await requestWithHCVaultGateway<THCVaultListVariablesResponse>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${urlPath}`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            ...(namespace ? { "X-Vault-Namespace": namespace } : {})
          }
        }
      );
      return data.data.data;
    }

    // KV v1 response structure (data is one level less nested)
    const { data } = await requestWithHCVaultGateway<{
      data: {
        [key: string]: string;
      };
    }>(connection, gatewayService, gatewayV2Service, {
      url: `${instanceUrl}/v1/${urlPath}`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        ...(namespace ? { "X-Vault-Namespace": namespace } : {})
      }
    });
    return data.data;
  } catch (error: unknown) {
    // Returning an empty set when a path isn't found allows that path to be created by a later POST request
    if (
      (isAxiosError(error) && error.response?.status === 404) ||
      (error instanceof BadRequestError && error.message === "Request failed with status code 404")
    ) {
      return {};
    }

    throw error;
  }
};

// Hashicorp Vault updates all variables in one batch. This is to respect their versioning
const updateHCVaultVariables = async (
  { path, instanceUrl, namespace, accessToken, mount, mountVersion, data }: TPostHCVaultVariable,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  // KV v2 uses /data/ in the path, KV v1 does not
  const urlPath =
    mountVersion === KvVersion.V2
      ? `${removeTrailingSlash(mount)}/data/${path}`
      : `${removeTrailingSlash(mount)}/${path}`;

  // KV v2 wraps data in { data: { ... } }, KV v1 sends data directly
  const payload = mountVersion === KvVersion.V2 ? { data } : data;

  return requestWithHCVaultGateway(connection, gatewayService, gatewayV2Service, {
    url: `${instanceUrl}/v1/${urlPath}`,
    method: "POST",
    headers: {
      "X-Vault-Token": accessToken,
      ...(namespace ? { "X-Vault-Namespace": namespace } : {}),
      "Content-Type": "application/json"
    },
    data: payload
  });
};

export const HCVaultSyncFns = {
  syncSecrets: async (
    secretSync: THCVaultSyncWithCredentials,
    secretMap: TSecretMap,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
  ) => {
    const {
      connection,
      environment,
      destinationConfig: { mount, path },
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    // Get mount details to determine KV version
    const { version: mountVersion } = await getKvMountVersion({
      instanceUrl,
      namespace,
      mount,
      accessToken,
      connection,
      gatewayService,
      gatewayV2Service
    });

    const variables = await listHCVaultVariables(
      {
        instanceUrl,
        accessToken,
        namespace,
        mount,
        mountVersion,
        path
      },
      connection,
      gatewayService,
      gatewayV2Service
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
        { accessToken, instanceUrl, namespace, mount, mountVersion, path, data: variables },
        connection,
        gatewayService,
        gatewayV2Service
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
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
  ) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    // Get mount details to determine KV version
    const { version: mountVersion } = await getKvMountVersion({
      instanceUrl,
      namespace,
      mount,
      accessToken,
      connection,
      gatewayService,
      gatewayV2Service
    });

    const variables = await listHCVaultVariables(
      { instanceUrl, namespace, accessToken, mount, mountVersion, path },
      connection,
      gatewayService,
      gatewayV2Service
    );

    for await (const [key] of Object.entries(variables)) {
      if (key in secretMap) {
        delete variables[key];
      }
    }

    try {
      // if no secrets remain after removal
      if (Object.keys(variables).length === 0) {
        // for kv v1: must DELETE the path entirely (empty secrets not allowed)
        // for kv v2: can write empty data to keep the path with metadata
        if (mountVersion === KvVersion.V1) {
          const urlPath = `${removeTrailingSlash(mount)}/${path}`;
          await requestWithHCVaultGateway(connection, gatewayService, gatewayV2Service, {
            url: `${instanceUrl}/v1/${urlPath}`,
            method: "DELETE",
            headers: {
              "X-Vault-Token": accessToken,
              ...(namespace ? { "X-Vault-Namespace": namespace } : {})
            }
          });
          return;
        }
      }

      await updateHCVaultVariables(
        { accessToken, instanceUrl, namespace, mount, mountVersion, path, data: variables },
        connection,
        gatewayService,
        gatewayV2Service
      );
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },
  getSecrets: async (
    secretSync: THCVaultSyncWithCredentials,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
  ) => {
    const {
      connection,
      destinationConfig: { mount, path }
    } = secretSync;

    const { namespace } = connection.credentials;
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);
    const instanceUrl = await getHCVaultInstanceUrl(connection);

    // Get mount details to determine KV version
    const { version: mountVersion } = await getKvMountVersion({
      instanceUrl,
      namespace,
      mount,
      accessToken,
      connection,
      gatewayService,
      gatewayV2Service
    });

    const variables = await listHCVaultVariables(
      {
        instanceUrl,
        namespace,
        accessToken,
        mount,
        mountVersion,
        path
      },
      connection,
      gatewayService,
      gatewayV2Service
    );

    return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, { value }]));
  }
};
