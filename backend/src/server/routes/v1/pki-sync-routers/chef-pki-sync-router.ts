import { ChefPkiSyncSchema, CreateChefPkiSyncSchema, UpdateChefPkiSyncSchema } from "@app/services/pki-sync/chef";
import { CHEF_PKI_SYNC_LIST_OPTION } from "@app/services/pki-sync/chef/chef-pki-sync-list-constants";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerChefPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.Chef,
    server,
    responseSchema: ChefPkiSyncSchema,
    createSchema: CreateChefPkiSyncSchema,
    updateSchema: UpdateChefPkiSyncSchema,
    syncOptions: {
      canImportCertificates: CHEF_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: CHEF_PKI_SYNC_LIST_OPTION.canRemoveCertificates,
      canRunHealthCheckCommand: CHEF_PKI_SYNC_LIST_OPTION.canRunHealthCheckCommand
    },
    enableOperationId
  });
