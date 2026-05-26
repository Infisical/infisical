import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NutanixPrismCentralConnectionMethod } from "./nutanix-prism-central-connection-enums";
import { TNutanixPrismCentralConnectionConfig } from "./nutanix-prism-central-connection-types";

export const getNutanixPrismCentralConnectionListItem = () => {
  return {
    name: "Nutanix Prism Central" as const,
    app: AppConnection.NutanixPrismCentral as const,
    methods: Object.values(NutanixPrismCentralConnectionMethod) as [
      NutanixPrismCentralConnectionMethod.ApiKey,
      NutanixPrismCentralConnectionMethod.BasicAuth
    ]
  };
};

// Shared builder: configures an ApiClient with host, TLS, and auth settings.
// Exported so the PKI sync module can reuse it without duplicating the auth wiring.
export const buildNutanixApiClient = async (
  credentials: TNutanixPrismCentralConnectionConfig["credentials"],
  method: NutanixPrismCentralConnectionMethod
) => {
  const { ApiClient } = await import("@nutanix-api/clustermgmt-js-client/dist/es");

  const { hostname, port, sslRejectUnauthorized } = credentials;

  const apiClient = new ApiClient();
  apiClient.host = hostname;
  apiClient.port = String(port ?? 9440);
  apiClient.scheme = "https";

  // Use the SDK's per-client verifySsl setter (creates a scoped https.Agent) instead of
  // the process-wide NODE_TLS_REJECT_UNAUTHORIZED env var which leaks across all connections.
  apiClient.verifySsl = sslRejectUnauthorized !== false;

  if (method === NutanixPrismCentralConnectionMethod.ApiKey) {
    const { apiKey } = credentials as { apiKey: string; hostname: string; port?: number };
    apiClient.setApiKey(apiKey);
  } else {
    const { username, password } = credentials as { username: string; password: string; hostname: string };
    apiClient.username = username;
    apiClient.password = password;
  }

  return apiClient;
};

export const validateNutanixPrismCentralConnectionCredentials = async (
  config: TNutanixPrismCentralConnectionConfig
) => {
  const { credentials } = config;
  const { hostname } = credentials;

  await blockLocalAndPrivateIpAddresses(`https://${hostname}`, false);

  try {
    const { ClustersApi } = await import("@nutanix-api/clustermgmt-js-client/dist/es");
    const apiClient = await buildNutanixApiClient(config.credentials, config.method);
    const clustersApi = new ClustersApi(apiClient);
    await clustersApi.listClusters({ $limit: 1 } as Parameters<typeof clustersApi.listClusters>[0]);
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Unable to validate Nutanix Prism Central connection: ${error instanceof Error ? error.message : "verify credentials and that Prism Central is reachable"}`
    });
  }

  return config.credentials;
};

export const listNutanixClusters = async (
  config: TNutanixPrismCentralConnectionConfig
): Promise<{ id: string; name: string }[]> => {
  const { credentials } = config;
  const { hostname } = credentials;

  await blockLocalAndPrivateIpAddresses(`https://${hostname}`, false);

  try {
    const { ClustersApi } = await import("@nutanix-api/clustermgmt-js-client/dist/es");
    const apiClient = await buildNutanixApiClient(config.credentials, config.method);
    const clustersApi = new ClustersApi(apiClient);
    const response = await clustersApi.listClusters({ $limit: 100 } as Parameters<typeof clustersApi.listClusters>[0]);
    const apiResponse = (response as unknown as { data: { getData: () => unknown } }).data;
    const data = apiResponse.getData();

    if (!Array.isArray(data)) return [];

    return data
      .map((cluster: { getExtId: () => string; getName: () => string }) => ({
        id: cluster.getExtId(),
        name: cluster.getName()
      }))
      .filter((c: { id: string; name: string }) => c.id && c.name);
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to fetch Nutanix clusters: ${error instanceof Error ? error.message : "verify credentials and that Prism Central is reachable"}`
    });
  }
};

