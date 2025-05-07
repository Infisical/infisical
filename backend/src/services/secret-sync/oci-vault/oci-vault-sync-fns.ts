import { secrets, vault } from "oci-sdk";

import { getOCIProvider } from "@app/services/app-connection/oci";
import {
  TCreateOCIVaultVariable,
  TDeleteOCIVaultVariable,
  TOCIVaultListVariables,
  TOCIVaultSyncWithCredentials,
  TUpdateOCIVaultVariable
} from "@app/services/secret-sync/oci-vault/oci-vault-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

const listOCIVaultVariables = async ({ provider, compartmentId, vaultId, onlyActive }: TOCIVaultListVariables) => {
  const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });
  const secretsClient = new secrets.SecretsClient({ authenticationDetailsProvider: provider });

  const secretsRes = await vaultsClient.listSecrets({
    compartmentId,
    vaultId,
    lifecycleState: onlyActive ? vault.models.SecretSummary.LifecycleState.Active : undefined
  });

  const result: Record<string, vault.models.SecretSummary & { name: string; value: string }> = {};

  for await (const s of secretsRes.items) {
    let secretValue = "";

    if (s.lifecycleState === vault.models.SecretSummary.LifecycleState.Active) {
      const secretBundle = await secretsClient.getSecretBundle({
        secretId: s.id
      });

      secretValue = Buffer.from(secretBundle.secretBundle.secretBundleContent?.content || "", "base64").toString(
        "utf-8"
      );
    }

    result[s.secretName] = {
      ...s,
      name: s.secretName,
      value: secretValue
    };
  }

  return result;
};

const createOCIVaultVariable = async ({
  provider,
  compartmentId,
  vaultId,
  keyId,
  name,
  value
}: TCreateOCIVaultVariable) => {
  if (!value) return;

  const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });

  return vaultsClient.createSecret({
    createSecretDetails: {
      compartmentId,
      vaultId,
      keyId,
      secretName: name,
      enableAutoGeneration: false,
      secretContent: {
        content: Buffer.from(value).toString("base64"),
        contentType: "BASE64"
      }
    }
  });
};

const updateOCIVaultVariable = async ({ provider, secretId, value }: TUpdateOCIVaultVariable) => {
  if (!value) return;

  const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });

  return vaultsClient.updateSecret({
    secretId,
    updateSecretDetails: {
      enableAutoGeneration: false,
      secretContent: {
        content: Buffer.from(value).toString("base64"),
        contentType: "BASE64"
      }
    }
  });
};

const deleteOCIVaultVariable = async ({ provider, secretId }: TDeleteOCIVaultVariable) => {
  const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });

  // Schedule a secret deletion 7 days from now. OCI Vault requires a MINIMUM buffer period of 7 days
  return vaultsClient.scheduleSecretDeletion({
    secretId,
    scheduleSecretDeletionDetails: {
      timeOfDeletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
};

export const OCIVaultSyncFns = {
  syncSecrets: async (secretSync: TOCIVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { compartmentOcid, vaultOcid, keyOcid }
    } = secretSync;

    const provider = await getOCIProvider(connection);
    const variables = await listOCIVaultVariables({ provider, compartmentId: compartmentOcid, vaultId: vaultOcid });

    // Create secrets
    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      if (!Object.values(variables).some((v) => v.secretName === key)) {
        try {
          await createOCIVaultVariable({
            compartmentId: compartmentOcid,
            vaultId: vaultOcid,
            provider,
            keyId: keyOcid,
            name: key,
            value
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }

    // Update and delete secrets
    for await (const [key, variable] of Object.entries(variables)) {
      // Only update / delete active secrets
      if (variable.lifecycleState === vault.models.SecretSummary.LifecycleState.Active) {
        if (key in secretMap) {
          if (variable.value !== secretMap[key].value) {
            try {
              await updateOCIVaultVariable({
                compartmentId: compartmentOcid,
                vaultId: vaultOcid,
                provider,
                secretId: variable.id,
                value: secretMap[key].value
              });
            } catch (error) {
              throw new SecretSyncError({
                error,
                secretKey: key
              });
            }
          }
        } else if (!secretSync.syncOptions.disableSecretDeletion) {
          try {
            await deleteOCIVaultVariable({
              compartmentId: compartmentOcid,
              vaultId: vaultOcid,
              provider,
              secretId: variable.id
            });
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        }
      }
    }
  },
  removeSecrets: async (secretSync: TOCIVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { compartmentOcid, vaultOcid }
    } = secretSync;

    const provider = await getOCIProvider(connection);
    const variables = await listOCIVaultVariables({
      provider,
      compartmentId: compartmentOcid,
      vaultId: vaultOcid,
      onlyActive: true
    });

    for await (const [key, variable] of Object.entries(variables)) {
      if (key in secretMap) {
        try {
          await deleteOCIVaultVariable({
            compartmentId: compartmentOcid,
            vaultId: vaultOcid,
            provider,
            secretId: variable.id
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },
  getSecrets: async (secretSync: TOCIVaultSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { compartmentOcid, vaultOcid }
    } = secretSync;

    const provider = await getOCIProvider(connection);
    return listOCIVaultVariables({ provider, compartmentId: compartmentOcid, vaultId: vaultOcid, onlyActive: true });
  }
};
