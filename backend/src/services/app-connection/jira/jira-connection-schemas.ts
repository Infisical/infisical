import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { JiraConnectionMethod } from "./jira-connection-enums";

const isValidInstanceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
};

const InstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .max(512, "Instance URL cannot exceed 512 characters")
  .refine(isValidInstanceUrl, "Instance URL must be an http or https URL without credentials, a query, or a fragment")
  .describe(AppConnections.CREDENTIALS.JIRA.instanceUrl);

export const JiraConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: InstanceUrlSchema,
  email: z
    .string()
    .trim()
    .min(1, "Email required")
    .max(320, "Email cannot exceed 320 characters")
    .email("Email must be a valid email address")
    .describe(AppConnections.CREDENTIALS.JIRA.email),
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(1024, "API token cannot exceed 1024 characters")
    .describe(AppConnections.CREDENTIALS.JIRA.apiToken)
});

export const JiraConnectionPersonalAccessTokenCredentialsSchema = z.object({
  instanceUrl: InstanceUrlSchema,
  personalAccessToken: z
    .string()
    .trim()
    .min(1, "Personal access token required")
    .max(1024, "Personal access token cannot exceed 1024 characters")
    .describe(AppConnections.CREDENTIALS.JIRA.personalAccessToken),
  sslRejectUnauthorized: z.boolean().optional().describe(AppConnections.CREDENTIALS.JIRA.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(16384, "SSL certificate cannot exceed 16384 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.JIRA.sslCertificate)
});

const BaseJiraConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Jira) });

export const JiraConnectionSchema = z.intersection(
  BaseJiraConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(JiraConnectionMethod.ApiToken),
      credentials: JiraConnectionApiTokenCredentialsSchema
    }),
    z.object({
      method: z.literal(JiraConnectionMethod.PersonalAccessToken),
      credentials: JiraConnectionPersonalAccessTokenCredentialsSchema
    })
  ])
);

export const SanitizedJiraConnectionSchema = z.discriminatedUnion("method", [
  BaseJiraConnectionSchema.extend({
    method: z.literal(JiraConnectionMethod.ApiToken),
    credentials: JiraConnectionApiTokenCredentialsSchema.pick({
      instanceUrl: true,
      email: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Jira]} (API Token)` })),
  BaseJiraConnectionSchema.extend({
    method: z.literal(JiraConnectionMethod.PersonalAccessToken),
    credentials: JiraConnectionPersonalAccessTokenCredentialsSchema.pick({
      instanceUrl: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Jira]} (Personal Access Token)` }))
]);

export const ValidateJiraConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(JiraConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Jira).method),
    credentials: JiraConnectionApiTokenCredentialsSchema.describe(AppConnections.CREATE(AppConnection.Jira).credentials)
  }),
  z.object({
    method: z
      .literal(JiraConnectionMethod.PersonalAccessToken)
      .describe(AppConnections.CREATE(AppConnection.Jira).method),
    credentials: JiraConnectionPersonalAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Jira).credentials
    )
  })
]);

export const CreateJiraConnectionSchema = ValidateJiraConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Jira, { supportsGateways: true })
);

export const UpdateJiraConnectionSchema = z
  .object({
    credentials: z
      .union([JiraConnectionApiTokenCredentialsSchema, JiraConnectionPersonalAccessTokenCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.Jira).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Jira, { supportsGateways: true }));

export const JiraConnectionListItemSchema = z
  .object({
    name: z.literal("Jira"),
    app: z.literal(AppConnection.Jira),
    methods: z.nativeEnum(JiraConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Jira] }));
