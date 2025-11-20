import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { Auth0ConnectionMethod } from "./auth0-connection-enums";

export const Auth0ConnectionClientCredentialsInputCredentialsSchema = z.object({
  domain: z.string().trim().min(1, "Domain required").describe(AppConnections.CREDENTIALS.AUTH0_CONNECTION.domain),
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID required")
    .describe(AppConnections.CREDENTIALS.AUTH0_CONNECTION.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .describe(AppConnections.CREDENTIALS.AUTH0_CONNECTION.clientSecret),
  audience: z
    .string()
    .trim()
    .url()
    .min(1, "Audience required")
    .describe(AppConnections.CREDENTIALS.AUTH0_CONNECTION.audience)
});

const Auth0ConnectionClientCredentialsOutputCredentialsSchema = z
  .object({
    accessToken: z.string(),
    expiresAt: z.number()
  })
  .merge(Auth0ConnectionClientCredentialsInputCredentialsSchema);

const BaseAuth0ConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Auth0)
});

export const Auth0ConnectionSchema = z.intersection(
  BaseAuth0ConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(Auth0ConnectionMethod.ClientCredentials),
      credentials: Auth0ConnectionClientCredentialsOutputCredentialsSchema
    })
  ])
);

export const SanitizedAuth0ConnectionSchema = z.discriminatedUnion("method", [
  BaseAuth0ConnectionSchema.extend({
    method: z.literal(Auth0ConnectionMethod.ClientCredentials),
    credentials: Auth0ConnectionClientCredentialsInputCredentialsSchema.pick({
      domain: true,
      clientId: true,
      audience: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Auth0]} (Client Credentials)` }))
]);

export const ValidateAuth0ConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(Auth0ConnectionMethod.ClientCredentials)
      .describe(AppConnections.CREATE(AppConnection.Auth0).method),
    credentials: Auth0ConnectionClientCredentialsInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Auth0).credentials
    )
  })
]);

export const CreateAuth0ConnectionSchema = ValidateAuth0ConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Auth0)
);

export const UpdateAuth0ConnectionSchema = z
  .object({
    credentials: Auth0ConnectionClientCredentialsInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Auth0).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Auth0));

export const Auth0ConnectionListItemSchema = z
  .object({
    name: z.literal("Auth0"),
    app: z.literal(AppConnection.Auth0),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(AwsConnectionMethod.ServicePrincipal), z.literal(AwsConnectionMethod.AccessKey)]),
    methods: z.nativeEnum(Auth0ConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Auth0] }));
