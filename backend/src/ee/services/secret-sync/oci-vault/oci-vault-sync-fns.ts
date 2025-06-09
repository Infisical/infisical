import { secrets, vault } from "oci-sdk";

import { getOCIProvider } from "@app/ee/services/app-connections/oci";
import {
  TCreateOCIVaultVariable,
  TDeleteOCIVaultVariable,
  TOCIVaultListVariables,
  TOCIVaultSyncWithCredentials,
  TUnmarkOCIVaultVariableFromDeletion,
  TUpdateOCIVaultVariable
} from "@app/ee/services/secret-sync/oci-vault/oci-vault-sync-types";
import { delay } from "@app/lib/delay";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
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

const unmarkOCIVaultVariableFromDeletion = async ({ provider, secretId }: TUnmarkOCIVaultVariableFromDeletion) => {
  const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });

  return vaultsClient.cancelSecretDeletion({
    secretId
  });
};

export const OCIVaultSyncFns = {
  syncSecrets: async (secretSync: TOCIVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      environment,
      destinationConfig: { compartmentOcid, vaultOcid, keyOcid }
    } = secretSync;

    const provider = await getOCIProvider(connection);
    const variables = await listOCIVaultVariables({ provider, compartmentId: compartmentOcid, vaultId: vaultOcid });

    // Throw an error if any keys are updating in OCI vault to prevent skipped updates
    if (
      Object.entries(variables).some(
        ([, secret]) =>
          secret.lifecycleState === vault.models.SecretSummary.LifecycleState.Updating ||
          secret.lifecycleState === vault.models.SecretSummary.LifecycleState.CancellingDeletion ||
          secret.lifecycleState === vault.models.SecretSummary.LifecycleState.Creating ||
          secret.lifecycleState === vault.models.SecretSummary.LifecycleState.Deleting ||
          secret.lifecycleState === vault.models.SecretSummary.LifecycleState.SchedulingDeletion
      )
    ) {
      throw new SecretSyncError({
        error: "Cannot sync while keys are updating in OCI Vault."
      });
    }

    // Create secrets
    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      // skip secrets that don't have a value set
      if (!value) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const existingVariable = Object.values(variables).find((v) => v.secretName === key);

      if (!existingVariable) {
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
      } else if (existingVariable.lifecycleState === vault.models.SecretSummary.LifecycleState.PendingDeletion) {
        // If a secret exists but is pending deletion, cancel the deletion and update the secret
        await unmarkOCIVaultVariableFromDeletion({
          provider,
          compartmentId: compartmentOcid,
          vaultId: vaultOcid,
          secretId: existingVariable.id
        });

        const vaultsClient = new vault.VaultsClient({ authenticationDetailsProvider: provider });
        const MAX_RETRIES = 10;

        for (let i = 0; i < MAX_RETRIES; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await delay(5000);

          // eslint-disable-next-line no-await-in-loop
          const secret = await vaultsClient.getSecret({
            secretId: existingVariable.id
          });

          if (secret.secret.lifecycleState === vault.models.SecretSummary.LifecycleState.Active) {
            // eslint-disable-next-line no-await-in-loop
            await updateOCIVaultVariable({
              provider,
              compartmentId: compartmentOcid,
              vaultId: vaultOcid,
              secretId: existingVariable.id,
              value
            });
            break;
          }

          if (i === MAX_RETRIES - 1) {
            throw new SecretSyncError({
              error: "Failed to update secret after cancelling deletion.",
              secretKey: key
            });
          }
        }
      }
    }

    // Update and delete secrets
    for await (const [key, variable] of Object.entries(variables)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      // Only update / delete active secrets
      if (variable.lifecycleState === vault.models.SecretSummary.LifecycleState.Active) {
        if (key in secretMap && secretMap[key].value.length > 0) {
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
