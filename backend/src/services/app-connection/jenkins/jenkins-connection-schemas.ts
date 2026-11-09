import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { JenkinsConnectionMethod } from "./jenkins-connection-enums";

export const JenkinsConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.JENKINS.instanceUrl),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.JENKINS.username),
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.JENKINS.apiToken)
});

const BaseJenkinsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Jenkins)
});

export const JenkinsConnectionSchema = z.discriminatedUnion("method", [
  BaseJenkinsConnectionSchema.extend({
    method: z.literal(JenkinsConnectionMethod.ApiToken),
    credentials: JenkinsConnectionApiTokenCredentialsSchema
  })
]);

export const SanitizedJenkinsConnectionSchema = z.discriminatedUnion("method", [
  BaseJenkinsConnectionSchema.extend({
    method: z.literal(JenkinsConnectionMethod.ApiToken),
    credentials: JenkinsConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true, username: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Jenkins]} (API Token)` }))
]);

export const ValidateJenkinsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(JenkinsConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Jenkins).method),
    credentials: JenkinsConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Jenkins).credentials
    )
  })
]);

export const CreateJenkinsConnectionSchema = ValidateJenkinsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Jenkins, { supportsGateways: true })
);

export const UpdateJenkinsConnectionSchema = z
  .object({
    credentials: JenkinsConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Jenkins).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Jenkins, { supportsGateways: true }));

export const JenkinsConnectionListItemSchema = z
  .object({
    name: z.literal("Jenkins"),
    app: z.literal(AppConnection.Jenkins),
    methods: z.nativeEnum(JenkinsConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Jenkins] }));
