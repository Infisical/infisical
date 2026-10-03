import {
  CreateDaytonaSyncSchema,
  DaytonaSyncSchema,
  UpdateDaytonaSyncSchema
} from "@app/services/secret-sync/daytona/daytona-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerDaytonaSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Daytona,
    server,
    responseSchema: DaytonaSyncSchema,
    createSchema: CreateDaytonaSyncSchema,
    updateSchema: UpdateDaytonaSyncSchema
  });
