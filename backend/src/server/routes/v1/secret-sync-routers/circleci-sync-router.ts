import {
  CircleCISyncSchema,
  CreateCircleCISyncSchema,
  UpdateCircleCISyncSchema
} from "@app/services/secret-sync/circleci";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerCircleCISyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.CircleCI,
    server,
    responseSchema: CircleCISyncSchema,
    createSchema: CreateCircleCISyncSchema,
    updateSchema: UpdateCircleCISyncSchema
  });
