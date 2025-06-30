import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { CreateZabbixSyncSchema, UpdateZabbixSyncSchema, ZabbixSyncSchema } from "@app/services/secret-sync/zabbix";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerZabbixSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Zabbix,
    server,
    responseSchema: ZabbixSyncSchema,
    createSchema: CreateZabbixSyncSchema,
    updateSchema: UpdateZabbixSyncSchema
  });
