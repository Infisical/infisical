import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ZabbixConnectionMethod } from "./zabbix-connection-enums";

export const ZabbixConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .max(1000)
    .describe(AppConnections.CREDENTIALS.ZABBIX.apiToken),
  instanceUrl: z.string().trim().url("Invalid Instance URL").describe(AppConnections.CREDENTIALS.ZABBIX.instanceUrl)
});

const BaseZabbixConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Zabbix) });

export const ZabbixConnectionSchema = BaseZabbixConnectionSchema.extend({
  method: z.literal(ZabbixConnectionMethod.ApiToken),
  credentials: ZabbixConnectionApiTokenCredentialsSchema
});

export const SanitizedZabbixConnectionSchema = z.discriminatedUnion("method", [
  BaseZabbixConnectionSchema.extend({
    method: z.literal(ZabbixConnectionMethod.ApiToken),
    credentials: ZabbixConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Zabbix]} (API Token)` }))
]);

export const ValidateZabbixConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(ZabbixConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Zabbix).method),
    credentials: ZabbixConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Zabbix).credentials
    )
  })
]);

export const CreateZabbixConnectionSchema = ValidateZabbixConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Zabbix)
);

export const UpdateZabbixConnectionSchema = z
  .object({
    credentials: ZabbixConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Zabbix).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Zabbix));

export const ZabbixConnectionListItemSchema = z
  .object({
    name: z.literal("Zabbix"),
    app: z.literal(AppConnection.Zabbix),
    methods: z.nativeEnum(ZabbixConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Zabbix] }));
