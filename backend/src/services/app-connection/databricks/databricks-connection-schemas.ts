import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DatabricksConnectionMethod } from "./databricks-connection-enums";

export const DatabricksConnectionServicePrincipalInputCredentialsSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID required"),
  clientSecret: z.string().trim().min(1, "Client Secret required"),
  workspaceUrl: z.string().trim().url().min(1, "Workspace URL required")
});

const DatabricksConnectionServicePrincipalOutputCredentialsSchema = z
  .object({
    accessToken: z.string(),
    expiresAt: z.number()
  })
  .merge(DatabricksConnectionServicePrincipalInputCredentialsSchema);

const BaseDatabricksConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Databricks) });

export const DatabricksConnectionSchema = z.intersection(
  BaseDatabricksConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(DatabricksConnectionMethod.ServicePrincipal),
      credentials: DatabricksConnectionServicePrincipalOutputCredentialsSchema
    })
  ])
);

export const SanitizedDatabricksConnectionSchema = z.discriminatedUnion("method", [
  BaseDatabricksConnectionSchema.extend({
    method: z.literal(DatabricksConnectionMethod.ServicePrincipal),
    credentials: DatabricksConnectionServicePrincipalOutputCredentialsSchema.pick({
      clientId: true,
      workspaceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Databricks]} (Service Principal)` }))
]);

export const ValidateDatabricksConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(DatabricksConnectionMethod.ServicePrincipal)
      .describe(AppConnections.CREATE(AppConnection.Databricks).method),
    credentials: DatabricksConnectionServicePrincipalInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Databricks).credentials
    )
  })
]);

export const CreateDatabricksConnectionSchema = ValidateDatabricksConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Databricks)
);

export const UpdateDatabricksConnectionSchema = z
  .object({
    credentials: DatabricksConnectionServicePrincipalInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Databricks).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Databricks));

export const DatabricksConnectionListItemSchema = z
  .object({
    name: z.literal("Databricks"),
    app: z.literal(AppConnection.Databricks),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(AwsConnectionMethod.ServicePrincipal), z.literal(AwsConnectionMethod.AccessKey)]),
    methods: z.nativeEnum(DatabricksConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Databricks] }));
