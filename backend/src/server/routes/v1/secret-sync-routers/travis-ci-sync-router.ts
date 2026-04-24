import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateTravisCISyncSchema,
  TravisCISyncSchema,
  UpdateTravisCISyncSchema
} from "@app/services/secret-sync/travis-ci";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerTravisCISyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.TravisCI,
    server,
    responseSchema: TravisCISyncSchema,
    createSchema: CreateTravisCISyncSchema,
    updateSchema: UpdateTravisCISyncSchema
  });
