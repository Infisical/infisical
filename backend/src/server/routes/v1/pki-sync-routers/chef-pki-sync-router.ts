import { ChefPkiSyncSchema, CreateChefPkiSyncSchema, UpdateChefPkiSyncSchema } from "@app/services/pki-sync/chef";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerChefPkiSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.Chef,
    server,
    responseSchema: ChefPkiSyncSchema,
    createSchema: CreateChefPkiSyncSchema,
    updateSchema: UpdateChefPkiSyncSchema,
    syncOptions: {
      canImportCertificates: false,
      canRemoveCertificates: true
    }
  });
