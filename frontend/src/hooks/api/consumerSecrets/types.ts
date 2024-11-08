import slugify from '@sindresorhus/slugify';
import { z } from 'zod';

export type ConsumerSecrets = {
  id: string;
  description: string;
  orgId: string;
  name: string;
  external: {
    id: string;
    status: string;
    statusDetails: string;
    provider: string;
    providerInput: Record<string, any>;
  };
};

export type ConsumerSecretsListEntry = {
  id: string;
  description: string;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  name: string;
  externalConsumerSecrets: {
    provider: string;
    status: string;
    statusDetails: string;
  };
};

export enum ConsumerSecretsType {
  Internal = 'internal',
  External = 'external',
}

export enum ExternalConsumerSecretsProvider {
  AWS = 'aws',
}

export const INTERNAL_KMS_KEY_ID = 'internal';

export enum ConsumerSecretsAwsCredentialType {
  AssumeRole = 'assume-role',
  AccessKey = 'access-key',
}

export const ExternalConsumerSecretsAwsSchema = z.object({
  credential: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal(ConsumerSecretsAwsCredentialType.AccessKey),
        data: z.object({
          accessKey: z
            .string()
            .trim()
            .min(1)
            .describe('AWS user account access key'),
          secretKey: z
            .string()
            .trim()
            .min(1)
            .describe('AWS user account secret key'),
        }),
      }),
      z.object({
        type: z.literal(ConsumerSecretsAwsCredentialType.AssumeRole),
        data: z.object({
          assumeRoleArn: z
            .string()
            .trim()
            .min(1)
            .describe('AWS user role to be assumed by infisical'),
          externalId: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
              'AWS assume role external id for furthur security in authentication',
            ),
        }),
      }),
    ])
    .describe('AWS credential information to connect'),
  awsRegion: z.string().min(1).trim().describe('AWS region to connect'),
  consumerSecretsKeyId: z
    .string()
    .trim()
    .optional()
    .describe(
      'A pre existing AWS KMS key id to be used for encryption. If not provided a consumerSecrets key will be generated.',
    ),
});

export const ExternalConsumerSecretsInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(ExternalConsumerSecretsProvider.AWS),
    inputs: ExternalConsumerSecretsAwsSchema,
  }),
]);

export const AddExternalConsumerSecretsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((v) => slugify(v) === v, {
      message: 'Alias must be a valid slug',
    }),
  description: z.string().trim().optional(),
  provider: ExternalConsumerSecretsInputSchema,
});

export type AddExternalConsumerSecretsType = z.infer<
  typeof AddExternalConsumerSecretsSchema
>;
