import RE2 from "re2";
import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/lib/regex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { LdapConnectionMethod, LdapProvider } from "./ldap-connection-enums";

export const LdapConnectionSimpleBindCredentialsSchema = z.object({
  provider: z.nativeEnum(LdapProvider).describe(AppConnections.CREDENTIALS.LDAP.provider),
  url: z
    .string()
    .trim()
    .min(1, "URL required")
    .regex(new RE2(/^ldaps?:\/\//))
    .describe(AppConnections.CREDENTIALS.LDAP.url),
  dn: z
    .string()
    .trim()
    .min(1, "DN/UPN required")
    .refine((value) => new RE2(DistinguishedNameRegex).test(value) || new RE2(UserPrincipalNameRegex).test(value), {
      message: "Invalid DN/UPN format"
    })
    .describe(AppConnections.CREDENTIALS.LDAP.dn),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.LDAP.password),
  sslRejectUnauthorized: z.boolean().optional().describe(AppConnections.CREDENTIALS.LDAP.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.LDAP.sslCertificate)
});

const BaseLdapConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.LDAP)
});

export const LdapConnectionSchema = z.intersection(
  BaseLdapConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(LdapConnectionMethod.SimpleBind),
      credentials: LdapConnectionSimpleBindCredentialsSchema
    })
  ])
);

export const SanitizedLdapConnectionSchema = z.discriminatedUnion("method", [
  BaseLdapConnectionSchema.extend({
    method: z.literal(LdapConnectionMethod.SimpleBind),
    credentials: LdapConnectionSimpleBindCredentialsSchema.pick({
      provider: true,
      url: true,
      dn: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  })
]);

export const ValidateLdapConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(LdapConnectionMethod.SimpleBind).describe(AppConnections.CREATE(AppConnection.LDAP).method),
    credentials: LdapConnectionSimpleBindCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.LDAP).credentials
    )
  })
]);

export const CreateLdapConnectionSchema = ValidateLdapConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.LDAP)
);

export const UpdateLdapConnectionSchema = z
  .object({
    credentials: LdapConnectionSimpleBindCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.LDAP).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.LDAP));

export const LdapConnectionListItemSchema = z.object({
  name: z.literal("LDAP"),
  app: z.literal(AppConnection.LDAP),
  // the below is preferable but currently breaks with our zod to json schema parser
  // methods: z.tuple([z.literal(AwsConnectionMethod.ServicePrincipal), z.literal(AwsConnectionMethod.AccessKey)]),
  methods: z.nativeEnum(LdapConnectionMethod).array()
});
