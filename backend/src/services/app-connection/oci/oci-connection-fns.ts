import { common, identity, keymanagement } from "oci-sdk";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OCIConnectionMethod } from "./oci-connection-enums";
import { TOCIConnection, TOCIConnectionConfig } from "./oci-connection-types";

export const getOCIProvider = async (config: TOCIConnectionConfig) => {
  const {
    credentials: { fingerprint, privateKey, region, tenancyOcid, userOcid }
  } = config;

  const provider = new common.SimpleAuthenticationDetailsProvider(
    tenancyOcid,
    userOcid,
    fingerprint,
    privateKey,
    null,
    common.Region.fromRegionId(region)
  );

  return provider;
};

export const getOCIConnectionListItem = () => {
  return {
    name: "OCI" as const,
    app: AppConnection.OCI as const,
    methods: Object.values(OCIConnectionMethod) as [OCIConnectionMethod.AccessKey]
  };
};

export const validateOCIConnectionCredentials = async (config: TOCIConnectionConfig) => {
  const provider = await getOCIProvider(config);

  try {
    const identityClient = new identity.IdentityClient({
      authenticationDetailsProvider: provider
    });

    // Get user details - a lightweight call that validates all credentials
    await identityClient.getUser({ userId: config.credentials.userOcid });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};

// TODO(andrey): This may need to be removed. I don't think the endpoint is right
export const listOCIVaults = async (appConnection: TOCIConnection, compartmentOcid: string) => {
  const provider = await getOCIProvider(appConnection);
  const signer = new common.DefaultRequestSigner(provider);

  // Create proper type for response
  interface VaultsResponse {
    items: Array<{
      id: string;
      displayName: string;
      compartmentId: string;
      timeCreated: string;
      lifecycleState: string;
    }>;
  }

  const requestParams = await common.composeRequest({
    method: "GET",
    baseEndpoint: `https://vaults.${appConnection.credentials.region}.oci.oraclecloud.com`,
    path: "/20180608/vaults",
    pathParams: { compartmentId: compartmentOcid },
    defaultHeaders: {
      Accept: "application/json"
    }
  });
  await signer.signHttpRequest(requestParams);
  const resp = await request.get<VaultsResponse>(requestParams.uri, {
    headers: requestParams.headers as unknown as Record<string, string>
  });

  return resp.data.items;
};

export const listOCIVaultKeys = async (appConnection: TOCIConnection, compartmentOcid: string, vaultOcid: string) => {
  const provider = await getOCIProvider(appConnection);

  const vaultIdMatch = vaultOcid.match(/ocid1\.vault\.[^.]+\.([^.]+)/);
  if (!vaultIdMatch || !vaultIdMatch[1]) {
    throw new BadRequestError({
      message: "Invalid vault OCID format"
    });
  }

  const keyManagementClient = new keymanagement.KmsManagementClient({
    authenticationDetailsProvider: provider
  });

  keyManagementClient.endpoint = `https://${vaultIdMatch[1]}-crypto.kms.${appConnection.credentials.region}.oraclecloud.com`;

  const keys = await keyManagementClient.listKeys({
    compartmentId: compartmentOcid
  });

  return keys.items.map((key) => ({
    id: key.id,
    displayName: key.displayName
  }));
};
