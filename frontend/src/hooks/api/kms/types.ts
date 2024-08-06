import slugify from "@sindresorhus/slugify";
import { z } from "zod";

export type Kms = {
  id: string;
  description: string;
  orgId: string;
  slug: string;
  external: {
    id: string;
    status: string;
    statusDetails: string;
    provider: string;
    providerInput: Record<string, any>;
  };
};

export type KmsListEntry = {
  id: string;
  description: string;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  slug: string;
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
  AWS = "aws"
}

export const INTERNAL_KMS_KEY_ID = "internal";

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

export const ExternalKmsInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ExternalKmsProvider.AWS), inputs: ExternalKmsAwsSchema })
]);

export const AddExternalKmsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .refine((v) => slugify(v) === v, {
      message: "Alias must be a valid slug"
    }),
  description: z.string().trim().optional(),
  provider: ExternalKmsInputSchema
});

export type AddExternalKmsType = z.infer<typeof AddExternalKmsSchema>;
