import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

export type Kms = {
  id: string;
  description: string;
  orgId: string;
  name: string;
  externalKms: {
    id: string;
    status: string;
    statusDetails: string;
    provider: string;
    configuration: Record<string, any>;
    credentialsHash?: string;
  };
};

export type KmsListEntry = {
  id: string;
  description: string;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  name: string;
  externalKms: {
    provider: string;
    status: string;
    statusDetails: string;
  };
};

export enum KmsType {
  Internal = "internal",
  External = "external"
}

export enum ExternalKmsProvider {
  Aws = "aws",
  Gcp = "gcp"
}

export const INTERNAL_KMS_KEY_ID = "internal";

export enum KmsAwsCredentialType {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
}
// Google uses snake_case for their enum values and we need to match that
export enum KmsGcpCredentialType {
  ServiceAccount = "service_account"
}

export const ExternalKmsAwsSchema = z.object({
  credential: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal(KmsAwsCredentialType.AccessKey),
        data: z.object({
          accessKey: z.string().trim().min(1).describe("AWS user account access key"),
          secretKey: z.string().trim().min(1).describe("AWS user account secret key")
        })
      }),
      z.object({
        type: z.literal(KmsAwsCredentialType.AssumeRole),
        data: z.object({
          assumeRoleArn: z
            .string()
            .trim()
            .min(1)
            .describe("AWS user role to be assumed by infisical"),
          externalId: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe("AWS assume role external id for furthur security in authentication")
        })
      })
    ])
    .describe("AWS credential information to connect"),
  awsRegion: z.string().min(1).trim().describe("AWS region to connect"),
  kmsKeyId: z
    .string()
    .trim()
    .optional()
    .describe(
      "A pre existing AWS KMS key id to be used for encryption. If not provided a kms key will be generated."
    )
});

export const ExternalKmsGcpCredentialSchema = z.object({
  type: z.literal(KmsGcpCredentialType.ServiceAccount),
  project_id: z.string().min(1),
  private_key_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().min(1),
  client_id: z.string().min(1),
  auth_uri: z.string().min(1),
  token_uri: z.string().min(1),
  auth_provider_x509_cert_url: z.string().min(1),
  client_x509_cert_url: z.string().min(1),
  universe_domain: z.string().min(1)
});

export type ExternalKmsGcpCredentialSchemaType = z.infer<typeof ExternalKmsGcpCredentialSchema>;

export const ExternalKmsGcpSchema = z.object({
  credential: ExternalKmsGcpCredentialSchema.describe(
    "GCP Service Account JSON credential to connect"
  ),
  gcpRegion: z.string().min(1).trim().describe("GCP region where the KMS key is located"),
  keyName: z.string().min(1).trim().describe("GCP key name")
});
export type ExternalKmsGcpSchemaType = z.infer<typeof ExternalKmsGcpSchema>;

export const ExternalKmsInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ExternalKmsProvider.Aws), inputs: ExternalKmsAwsSchema }),
  z.object({ type: z.literal(ExternalKmsProvider.Gcp), inputs: ExternalKmsGcpSchema })
]);

export const AddExternalKmsSchema = z.object({
  name: slugSchema({ min: 1, field: "Alias" }),
  description: z.string().trim().optional(),
  configuration: ExternalKmsInputSchema
});

export type AddExternalKmsType = z.infer<typeof AddExternalKmsSchema>;

// we need separate schema for update because the credential field is not required on GCP
export const ExternalKmsUpdateInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ExternalKmsProvider.Aws), inputs: ExternalKmsAwsSchema.partial() }),
  z.object({
    type: z.literal(ExternalKmsProvider.Gcp),
    inputs: ExternalKmsGcpSchema.pick({ gcpRegion: true, keyName: true })
  })
]);

export const UpdateExternalKmsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((v) => slugify(v) === v, {
      message: "Alias must be a valid slug"
    })
    .optional(),
  description: z.string().trim().optional(),
  configuration: ExternalKmsUpdateInputSchema.optional()
});

export type UpdateExternalKmsType = z.infer<typeof UpdateExternalKmsSchema>;

const GCP_CREDENTIAL_MAX_FILE_SIZE = 8 * 1024; // 8KB
const GCP_CREDENTIAL_ACCEPTED_FILE_TYPES = ["application/json"];

const AddExternalKmsGcpFormSchemaStandardInputs = z.object({
  keyObject: z
    .object({ label: z.string().trim(), value: z.string().trim() })
    .describe("GCP key name"),
  gcpRegion: z.object({ label: z.string().trim(), value: z.string().trim() }).describe("GCP Region")
});

export const AddExternalKmsGcpFormSchema = z.discriminatedUnion("formType", [
  z
    .object({
      formType: z.literal("newGcpKms"),
      // `FileList` is a browser-only (window-specific) type, so we need to handle it differently on the server to avoid SSR errors
      credentialFile:
        typeof window === "undefined"
          ? z.any()
          : z
              .instanceof(FileList)
              .refine((files) => files?.length === 1, "Image is required.")
              .refine(
                (files) => files?.[0]?.size <= GCP_CREDENTIAL_MAX_FILE_SIZE,
                "Max file size is 8KB."
              )
              .refine(
                (files) => GCP_CREDENTIAL_ACCEPTED_FILE_TYPES.includes(files?.[0]?.type),
                "Only .json files are accepted."
              )
    })
    .merge(AddExternalKmsGcpFormSchemaStandardInputs)
    .merge(AddExternalKmsSchema.pick({ name: true, description: true })),
  z
    .object({ formType: z.literal("updateGcpKmsDetails") })
    .merge(AddExternalKmsSchema.pick({ name: true, description: true })),
  z
    .object({ formType: z.literal("updateGcpKmsCredentials") })
    .merge(AddExternalKmsGcpFormSchemaStandardInputs)
    .merge(AddExternalKmsSchema.pick({ name: true, description: true }))
]);

export type AddExternalKmsGcpFormSchemaType = z.infer<typeof AddExternalKmsGcpFormSchema>;

export enum KmsGcpKeyFetchAuthType {
  Credential = "credential",
  Kms = "kmsId"
}
