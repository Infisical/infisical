import {
  CreatePortainerSyncSchema,
  PortainerSyncSchema,
  UpdatePortainerSyncSchema
} from "@app/services/secret-sync/portainer";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerPortainerSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Portainer,
    server,
    responseSchema: PortainerSyncSchema,
    createSchema: CreatePortainerSyncSchema,
    updateSchema: UpdatePortainerSyncSchema
  });
