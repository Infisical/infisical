import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateTeamCitySyncSchema,
  TeamCitySyncSchema,
  UpdateTeamCitySyncSchema
} from "@app/services/secret-sync/teamcity";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerTeamCitySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.TeamCity,
    server,
    responseSchema: TeamCitySyncSchema,
    createSchema: CreateTeamCitySyncSchema,
    updateSchema: UpdateTeamCitySyncSchema
  });
