import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { HCVaultConnectionMethod } from "./hc-vault-connection-enums";

const InstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .url("Invalid Instance URL")
  .describe(AppConnections.CREDENTIALS.HC_VAULT.instanceUrl);

const NamespaceSchema = z.string().trim().optional().describe(AppConnections.CREDENTIALS.HC_VAULT.namespace);

export const HCVaultConnectionAccessTokenCredentialsSchema = z.object({
  instanceUrl: InstanceUrlSchema,
  namespace: NamespaceSchema,
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.HC_VAULT.accessToken)
});

export const HCVaultConnectionAppRoleCredentialsSchema = z.object({
  instanceUrl: InstanceUrlSchema,
  namespace: NamespaceSchema,
  roleId: z.string().trim().min(1, "Role ID required").describe(AppConnections.CREDENTIALS.HC_VAULT.roleId),
  secretId: z.string().trim().min(1, "Secret ID required").describe(AppConnections.CREDENTIALS.HC_VAULT.secretId)
});

const BaseHCVaultConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.HCVault) });

export const HCVaultConnectionSchema = z.intersection(
  BaseHCVaultConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(HCVaultConnectionMethod.AccessToken),
      credentials: HCVaultConnectionAccessTokenCredentialsSchema
    }),
    z.object({
      method: z.literal(HCVaultConnectionMethod.AppRole),
      credentials: HCVaultConnectionAppRoleCredentialsSchema
    })
  ])
);

export const SanitizedHCVaultConnectionSchema = z.discriminatedUnion("method", [
  BaseHCVaultConnectionSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AccessToken),
    credentials: HCVaultConnectionAccessTokenCredentialsSchema.pick({
      namespace: true,
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.HCVault]} (Access Token)` })),
  BaseHCVaultConnectionSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AppRole),
    credentials: HCVaultConnectionAppRoleCredentialsSchema.pick({
      namespace: true,
      instanceUrl: true,
      roleId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.HCVault]} (App Role)` }))
]);

export const ValidateHCVaultConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(HCVaultConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.HCVault).method),
    credentials: HCVaultConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.HCVault).credentials
    )
  }),
  z.object({
    method: z.literal(HCVaultConnectionMethod.AppRole).describe(AppConnections.CREATE(AppConnection.HCVault).method),
    credentials: HCVaultConnectionAppRoleCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.HCVault).credentials
    )
  })
]);

export const CreateHCVaultConnectionSchema = ValidateHCVaultConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.HCVault, { supportsGateways: true })
);

export const UpdateHCVaultConnectionSchema = z
  .object({
    credentials: z
      .union([HCVaultConnectionAccessTokenCredentialsSchema, HCVaultConnectionAppRoleCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.HCVault).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.HCVault, { supportsGateways: true }));

export const HCVaultConnectionListItemSchema = z
  .object({
    name: z.literal("HCVault"),
    app: z.literal(AppConnection.HCVault),
    methods: z.nativeEnum(HCVaultConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.HCVault] }));
