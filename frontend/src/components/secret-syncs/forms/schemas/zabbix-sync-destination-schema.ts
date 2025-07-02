import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { ZabbixMacroType, ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ZabbixSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Zabbix),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(ZabbixSyncScope.Host),
        hostId: z.string().trim().min(1, "Host ID required"),
        hostName: z.string().trim().min(1, "Host name required"),
        macroType: z.nativeEnum(ZabbixMacroType, {
          errorMap: () => ({ message: "Macro type must be either 'text' or 'secret'" })
        })
      }),
      z.object({
        scope: z.literal(ZabbixSyncScope.Global),
        macroType: z.nativeEnum(ZabbixMacroType, {
          errorMap: () => ({ message: "Macro type must be either 'text' or 'secret'" })
        })
      })
    ])
  })
);
