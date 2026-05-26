import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SalesforceConnectionMethod } from "./salesforce-connection-enums";

export const SalesforceConnectionClientCredentialsCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .min(1, "Instance URL required")
    .describe(AppConnections.CREDENTIALS.SALESFORCE_CONNECTION.instanceUrl),
  consumerKey: z
    .string()
    .trim()
    .min(1, "Consumer Key required")
    .describe(AppConnections.CREDENTIALS.SALESFORCE_CONNECTION.consumerKey),
  consumerSecret: z
    .string()
    .trim()
    .min(1, "Consumer Secret required")
    .describe(AppConnections.CREDENTIALS.SALESFORCE_CONNECTION.consumerSecret)
});

const BaseSalesforceConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Salesforce)
});

export const SalesforceConnectionSchema = z.intersection(
  BaseSalesforceConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(SalesforceConnectionMethod.ClientCredentials),
      credentials: SalesforceConnectionClientCredentialsCredentialsSchema
    })
  ])
);

export const SanitizedSalesforceConnectionSchema = z.discriminatedUnion("method", [
  BaseSalesforceConnectionSchema.extend({
    method: z.literal(SalesforceConnectionMethod.ClientCredentials),
    credentials: SalesforceConnectionClientCredentialsCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Salesforce]} (Client Credentials)` }))
]);

export const ValidateSalesforceConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(SalesforceConnectionMethod.ClientCredentials)
      .describe(AppConnections.CREATE(AppConnection.Salesforce).method),
    credentials: SalesforceConnectionClientCredentialsCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Salesforce).credentials
    )
  })
]);

export const CreateSalesforceConnectionSchema = ValidateSalesforceConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Salesforce)
);

export const UpdateSalesforceConnectionSchema = z
  .object({
    credentials: SalesforceConnectionClientCredentialsCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Salesforce).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Salesforce));

export const SalesforceConnectionListItemSchema = z
  .object({
    name: z.literal("Salesforce"),
    app: z.literal(AppConnection.Salesforce),
    methods: z.nativeEnum(SalesforceConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Salesforce] }));
