import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GCP_WORKLOAD_IDENTITY_PROVIDER_PATTERN } from "./gcp-connection-constants";
import { GcpConnectionMethod } from "./gcp-connection-enums";

export const GcpConnectionServiceAccountImpersonationCredentialsSchema = z.object({
  serviceAccountEmail: z.string().email().trim().min(1, "Service account email required"),
  workloadIdentityProvider: z
    .undefined({
      errorMap: () => ({
        message:
          "A Service Account Impersonation connection has no workload identity provider. Create a Workload Identity Federation connection instead."
      })
    })
    .optional()
});

export const GcpConnectionWorkloadIdentityFederationInputCredentialsSchema = z.object({
  workloadIdentityProvider: z
    .string()
    .trim()
    .min(1, "Workload identity provider required")
    .max(255)
    .refine((value) => GCP_WORKLOAD_IDENTITY_PROVIDER_PATTERN.test(value), {
      message:
        "Workload identity provider must be in the format projects/<project-number>/locations/global/workloadIdentityPools/<pool-id>/providers/<provider-id>"
    })
    .describe(
      "The full resource name of the GCP workload identity pool provider that trusts this organization's Infisical OIDC issuer, e.g. projects/123456789/locations/global/workloadIdentityPools/infisical/providers/infisical."
    ),
  serviceAccountEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional()
    .describe(
      "The GCP service account to impersonate with the federated token. Omit it to use the federated token directly, with GCP roles granted to the connection's principal."
    )
});

export const GcpConnectionWorkloadIdentityFederationOutputCredentialsSchema =
  GcpConnectionWorkloadIdentityFederationInputCredentialsSchema.extend({
    accessToken: z.string().optional(),
    expiresAt: z.number().optional()
  });

export const GcpConnectionFederatedCredentialSchema = z.object({
  issuerUrl: z.string().nullable(),
  subjectIdentifier: z.string(),
  audience: z.string()
});

const BaseGcpConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GCP) });

export const GcpConnectionSchema = z.intersection(
  BaseGcpConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
      credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema
    }),
    z.object({
      method: z.literal(GcpConnectionMethod.WorkloadIdentityFederation),
      credentials: GcpConnectionWorkloadIdentityFederationOutputCredentialsSchema
    })
  ])
);

export const SanitizedGcpConnectionSchema = z.discriminatedUnion("method", [
  BaseGcpConnectionSchema.extend({
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema.pick({})
  }).describe(
    JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GCP]} (Service Account Impersonation)` })
  ),
  BaseGcpConnectionSchema.extend({
    method: z.literal(GcpConnectionMethod.WorkloadIdentityFederation),
    credentials: GcpConnectionWorkloadIdentityFederationOutputCredentialsSchema.pick({
      workloadIdentityProvider: true,
      serviceAccountEmail: true
    }).extend({
      federatedCredential: GcpConnectionFederatedCredentialSchema.describe(
        "The values to configure on the GCP workload identity pool provider and IAM binding. The issuer is null when SITE_URL is not set."
      )
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GCP]} (Workload Identity Federation)` }))
]);

export const ValidateGcpConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(GcpConnectionMethod.ServiceAccountImpersonation)
      .describe(AppConnections.CREATE(AppConnection.GCP).method),
    credentials: GcpConnectionServiceAccountImpersonationCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GCP).credentials
    )
  }),
  z.object({
    method: z
      .literal(GcpConnectionMethod.WorkloadIdentityFederation)
      .describe(AppConnections.CREATE(AppConnection.GCP).method),
    credentials: GcpConnectionWorkloadIdentityFederationInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GCP).credentials
    )
  })
]);

export const CreateGcpConnectionSchema = ValidateGcpConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GCP)
);

export const UpdateGcpConnectionSchema = z
  .object({
    // Workload identity federation first: zod strips unknown keys, so the impersonation schema would
    // otherwise match a federation payload and drop its provider
    credentials: z
      .union([
        GcpConnectionWorkloadIdentityFederationInputCredentialsSchema,
        GcpConnectionServiceAccountImpersonationCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.GCP).credentials)
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
