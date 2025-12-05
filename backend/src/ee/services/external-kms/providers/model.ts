import { z } from "zod";

export enum KmsProviders {
  Aws = "aws",
  Gcp = "gcp"
}

export enum KmsAwsCredentialType {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
}
// Google uses snake_case for their enum values and we need to match that
export enum KmsGcpCredentialType {
  ServiceAccount = "service_account"
}

export enum KmsGcpKeyFetchAuthType {
  Credential = "credential",
  Kms = "kmsId"
}

const AwsConnectionAssumeRoleCredentialsSchema = z.object({
  assumeRoleArn: z.string().trim().min(1).describe("AWS user role to be assumed by infisical"),
  externalId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("AWS assume role external id for further security in authentication")
});

const AwsConnectionAccessTokenCredentialsSchema = z.object({
  accessKey: z.string().trim().min(1).describe("AWS user account access key"),
  secretKey: z.string().trim().min(1).describe("AWS user account secret key")
});

export const ExternalKmsAwsSchema = z.object({
  credential: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal(KmsAwsCredentialType.AccessKey),
        data: AwsConnectionAccessTokenCredentialsSchema
      }),
      z.object({
        type: z.literal(KmsAwsCredentialType.AssumeRole),
        data: AwsConnectionAssumeRoleCredentialsSchema
      })
    ])
    .describe("AWS credential information to connect"),
  awsRegion: z.string().min(1).trim().describe("AWS region to connect"),
  kmsKeyId: z
    .string()
    .trim()
    .optional()
    .describe("A pre existing AWS KMS key id to be used for encryption. If not provided a kms key will be generated.")
});
export type TExternalKmsAwsSchema = z.infer<typeof ExternalKmsAwsSchema>;

export const SanitizedExternalKmsAwsSchema = ExternalKmsAwsSchema.extend({
  credential: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(KmsAwsCredentialType.AccessKey),
      data: AwsConnectionAccessTokenCredentialsSchema.pick({ accessKey: true })
    }),
    z.object({
      type: z.literal(KmsAwsCredentialType.AssumeRole),
      data: AwsConnectionAssumeRoleCredentialsSchema.pick({
        assumeRoleArn: true,
        externalId: true
      })
    })
  ])
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

export type TExternalKmsGcpCredentialSchema = z.infer<typeof ExternalKmsGcpCredentialSchema>;

export const ExternalKmsGcpSchema = z.object({
  credential: ExternalKmsGcpCredentialSchema.describe("GCP Service Account JSON credential to connect"),
  gcpRegion: z.string().trim().describe("GCP region where the KMS key is located"),
  keyName: z.string().trim().describe("GCP key name")
});
export type TExternalKmsGcpSchema = z.infer<typeof ExternalKmsGcpSchema>;

export const SanitizedExternalKmsGcpSchema = ExternalKmsGcpSchema.pick({ gcpRegion: true, keyName: true });

const ExternalKmsGcpClientSchema = ExternalKmsGcpSchema.pick({ gcpRegion: true }).extend({
  credential: ExternalKmsGcpCredentialSchema
});
export type TExternalKmsGcpClientSchema = z.infer<typeof ExternalKmsGcpClientSchema>;

// The root schema of the JSON
export const ExternalKmsInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(KmsProviders.Aws), inputs: ExternalKmsAwsSchema }),
  z.object({ type: z.literal(KmsProviders.Gcp), inputs: ExternalKmsGcpSchema })
]);
export type TExternalKmsInputSchema = z.infer<typeof ExternalKmsInputSchema>;

export const ExternalKmsInputUpdateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(KmsProviders.Aws), inputs: ExternalKmsAwsSchema.partial() }),
  z.object({ type: z.literal(KmsProviders.Gcp), inputs: ExternalKmsGcpSchema.partial() })
]);
export type TExternalKmsInputUpdateSchema = z.infer<typeof ExternalKmsInputUpdateSchema>;

// generic function shared by all provider
export type TExternalKmsProviderFns = {
  validateConnection: () => Promise<boolean>;
  encrypt: (data: Buffer) => Promise<{ encryptedBlob: Buffer }>;
  decrypt: (encryptedBlob: Buffer) => Promise<{ data: Buffer }>;
  cleanup: () => Promise<void>;
};
