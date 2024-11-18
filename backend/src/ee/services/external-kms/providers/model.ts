import { z } from "zod";

export enum KmsProviders {
  Aws = "aws"
}

export enum KmsAwsCredentialType {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
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
          assumeRoleArn: z.string().trim().min(1).describe("AWS user role to be assumed by infisical"),
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
    .describe("A pre existing AWS KMS key id to be used for encryption. If not provided a kms key will be generated.")
});
export type TExternalKmsAwsSchema = z.infer<typeof ExternalKmsAwsSchema>;

// The root schema of the JSON
export const ExternalKmsInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(KmsProviders.Aws), inputs: ExternalKmsAwsSchema })
]);
export type TExternalKmsInputSchema = z.infer<typeof ExternalKmsInputSchema>;

export const ExternalKmsInputUpdateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(KmsProviders.Aws), inputs: ExternalKmsAwsSchema.partial() })
]);
export type TExternalKmsInputUpdateSchema = z.infer<typeof ExternalKmsInputUpdateSchema>;

// generic function shared by all provider
export type TExternalKmsProviderFns = {
  validateConnection: () => Promise<boolean>;
  encrypt: (data: Buffer) => Promise<{ encryptedBlob: Buffer }>;
  decrypt: (encryptedBlob: Buffer) => Promise<{ data: Buffer }>;
};
