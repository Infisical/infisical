import {
  AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION,
  AwsSecretsManagerPkiSyncSchema,
  CreateAwsSecretsManagerPkiSyncSchema,
  UpdateAwsSecretsManagerPkiSyncSchema
} from "@app/services/pki-sync/aws-secrets-manager";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerAwsSecretsManagerPkiSyncRouter =
  (enableOperationId: boolean = true) =>
  async (server: FastifyZodProvider) =>
    registerSyncPkiEndpoints({
      destination: PkiSync.AwsSecretsManager,
      server,
      responseSchema: AwsSecretsManagerPkiSyncSchema,
      createSchema: CreateAwsSecretsManagerPkiSyncSchema,
      updateSchema: UpdateAwsSecretsManagerPkiSyncSchema,
      syncOptions: {
        canImportCertificates: AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION.canImportCertificates,
        canRemoveCertificates: AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
      },
      enableOperationId
    });
