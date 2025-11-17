import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GcpConnectionMethod } from "./gcp-connection-enums";

export const GcpConnectionServiceAccountImpersonationCredentialsSchema = z.object({
  serviceAccountEmail: z.string().email().trim().min(1, "Service account email required")
});

const BaseGcpConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GCP) });

export const GcpConnectionSchema = z.intersection(
  BaseGcpConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
      credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema
    })
  ])
);

export const SanitizedGcpConnectionSchema = z.discriminatedUnion("method", [
  BaseGcpConnectionSchema.extend({
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema.pick({})
  }).describe(
    JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GCP]} (Service Account Impersonation)` })
  )
]);

export const ValidateGcpConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(GcpConnectionMethod.ServiceAccountImpersonation)
      .describe(AppConnections.CREATE(AppConnection.GCP).method),
    credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GCP).credentials
    )
  })
]);

export const CreateGcpConnectionSchema = ValidateGcpConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GCP)
);

export const UpdateGcpConnectionSchema = z
  .object({
    credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.GCP).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GCP));

export const GcpConnectionListItemSchema = z
  .object({
    name: z.literal("GCP"),
    app: z.literal(AppConnection.GCP),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(GitHubConnectionMethod.App), z.literal(GitHubConnectionMethod.OAuth)]),
    methods: z.nativeEnum(GcpConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.GCP] }));
