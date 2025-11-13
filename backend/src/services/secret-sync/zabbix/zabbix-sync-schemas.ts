import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { ZabbixSyncScope } from "./zabbix-sync-enums";

const ZabbixSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(ZabbixSyncScope.Host).describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.scope),
    hostId: z.string().trim().min(1, "Host required").max(255).describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.hostId),
    hostName: z
      .string()
      .trim()
      .min(1, "Host name required")
      .max(255)
      .describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.hostName),
    macroType: z
      .number()
      .min(0, "Macro type required")
      .max(1, "Macro type required")
      .describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.macroType)
  }),
  z.object({
    scope: z.literal(ZabbixSyncScope.Global).describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.scope),
    macroType: z
      .number()
      .min(0, "Macro type required")
      .max(1, "Macro type required")
      .describe(SecretSyncs.DESTINATION_CONFIG.ZABBIX.macroType)
  })
]);

const ZabbixSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ZabbixSyncSchema = BaseSecretSyncSchema(SecretSync.Zabbix, ZabbixSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Zabbix),
    destinationConfig: ZabbixSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Zabbix] }));

export const CreateZabbixSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Zabbix,
  ZabbixSyncOptionsConfig
).extend({
  destinationConfig: ZabbixSyncDestinationConfigSchema
});

export const UpdateZabbixSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Zabbix,
  ZabbixSyncOptionsConfig
).extend({
  destinationConfig: ZabbixSyncDestinationConfigSchema.optional()
});

export const ZabbixSyncListItemSchema = z
  .object({
    name: z.literal("Zabbix"),
    connection: z.literal(AppConnection.Zabbix),
    destination: z.literal(SecretSync.Zabbix),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Zabbix] }));
