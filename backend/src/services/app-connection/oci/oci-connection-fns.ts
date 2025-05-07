import { common, identity, keymanagement } from "oci-sdk";

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

export const listOCICompartments = async (appConnection: TOCIConnection) => {
  const provider = await getOCIProvider(appConnection);

  const identityClient = new identity.IdentityClient({ authenticationDetailsProvider: provider });

  const rootCompartment = await identityClient
    .getTenancy({
      tenancyId: appConnection.credentials.tenancyOcid
    })
    .then((response) => ({
      ...response.tenancy,
      id: appConnection.credentials.tenancyOcid,
      name: response.tenancy.name ? `${response.tenancy.name} (root)` : "root"
    }));

  const compartments = await identityClient.listCompartments({
    compartmentId: appConnection.credentials.tenancyOcid,
    compartmentIdInSubtree: true,
    accessLevel: identity.requests.ListCompartmentsRequest.AccessLevel.Any
  });

  return [rootCompartment, ...compartments.items];
};

export const listOCIVaults = async (appConnection: TOCIConnection, compartmentOcid: string) => {
  const provider = await getOCIProvider(appConnection);

  const keyManagementClient = new keymanagement.KmsVaultClient({
    authenticationDetailsProvider: provider
  });

  const vaults = await keyManagementClient.listVaults({
    compartmentId: compartmentOcid
  });

  return vaults.items;
};

export const listOCIVaultKeys = async (appConnection: TOCIConnection, compartmentOcid: string, vaultOcid: string) => {
  const provider = await getOCIProvider(appConnection);

  const vaultIdMatch = vaultOcid.match(/ocid1\.vault\.[^.]+\.[^.]+\.([^.]+)/);
  if (!vaultIdMatch || !vaultIdMatch[1]) {
    throw new BadRequestError({
      message: "Invalid vault OCID format"
    });
  }

  const keyManagementClient = new keymanagement.KmsManagementClient({
    authenticationDetailsProvider: provider
  });

  keyManagementClient.endpoint = `https://${vaultIdMatch[1]}-management.kms.${appConnection.credentials.region}.oraclecloud.com`;

  const keys = await keyManagementClient.listKeys({
    compartmentId: compartmentOcid
  });

  return keys.items;
};
