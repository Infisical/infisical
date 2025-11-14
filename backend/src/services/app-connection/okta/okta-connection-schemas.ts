import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OktaConnectionMethod } from "./okta-connection-enums";

export const OktaConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.OKTA.instanceUrl),
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .refine((value) => new RE2("^00[a-zA-Z0-9_-]{40}$").test(value), "Invalid Okta API Token format")
    .describe(AppConnections.CREDENTIALS.OKTA.apiToken)
});

const BaseOktaConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Okta) });

export const OktaConnectionSchema = BaseOktaConnectionSchema.extend({
  method: z.literal(OktaConnectionMethod.ApiToken),
  credentials: OktaConnectionApiTokenCredentialsSchema
});

export const SanitizedOktaConnectionSchema = z.discriminatedUnion("method", [
  BaseOktaConnectionSchema.extend({
    method: z.literal(OktaConnectionMethod.ApiToken),
    credentials: OktaConnectionApiTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Okta]} (API Token)` }))
]);

export const ValidateOktaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OktaConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Okta).method),
    credentials: OktaConnectionApiTokenCredentialsSchema.describe(AppConnections.CREATE(AppConnection.Okta).credentials)
  })
]);

export const CreateOktaConnectionSchema = ValidateOktaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Okta)
);

export const UpdateOktaConnectionSchema = z
  .object({
    credentials: OktaConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Okta).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Okta));

export const OktaConnectionListItemSchema = z
  .object({
    name: z.literal("Okta"),
    app: z.literal(AppConnection.Okta),
    methods: z.nativeEnum(OktaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Okta] }));
