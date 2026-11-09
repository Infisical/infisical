import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { isValidAwsRegion } from "@app/lib/aws/region";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AwsConnectionMethod } from "./aws-connection-enums";

// AWS-owned DNS suffixes permitted as STS endpoints. Covers all supported AWS partitions:
// commercial + FIPS + GovCloud + VPC PrivateLink all live under .amazonaws.com (GovCloud and
// FIPS differ only by region label / sts-fips prefix, not by domain suffix); China lives under
// .amazonaws.com.cn. The leading dot enforces the suffix as a real DNS boundary so a hostname
// like "amazonaws.com.attacker.com" cannot bypass the check.
const AWS_STS_ALLOWED_HOST_SUFFIXES = [".amazonaws.com", ".amazonaws.com.cn"] as const;

export const isAwsStsHostnameAllowed = (stsEndpoint: string): boolean => {
  try {
    const { hostname } = new URL(stsEndpoint);
    return AWS_STS_ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
};

export const AwsConnectionAssumeRoleCredentialsSchema = z.object({
  roleArn: z.string().trim().min(1, "Role ARN required"),
  stsEndpoint: z
    .string()
    .trim()
    .url("STS endpoint must be a valid URL")
    .startsWith("https://", "STS endpoint must use HTTPS")
    .refine(
      isAwsStsHostnameAllowed,
      "STS endpoint hostname must be an AWS-owned domain (e.g. .amazonaws.com or .amazonaws.com.cn). Custom or third-party hosts are not permitted."
    )
    .optional()
    .describe(AppConnections.CREATE(AppConnection.AWS).stsEndpoint)
});

// Any Partition label is accepted so private and future Partitions work. Applied on create and update only, never on reads.
const AWS_ROLE_ARN_REGEX = /^arn:[a-z0-9-]+:iam::\d{12}:role\/[\w+=,.@/-]+$/;

export const AwsRoleArnInputSchema = z
  .string()
  .trim()
  .min(1, "Role ARN required")
  .regex(
    AWS_ROLE_ARN_REGEX,
    "Role ARN must look like arn:<partition>:iam::<12-digit account ID>:role/<role name>, for example arn:aws:iam::123456789012:role/infisical"
  );

const AwsConnectionAssumeRoleInputCredentialsSchema = AwsConnectionAssumeRoleCredentialsSchema.extend({
  roleArn: AwsRoleArnInputSchema
});

export const AwsConnectionAccessTokenCredentialsSchema = z.object({
  accessKeyId: z.string().trim().min(1, "Access Key ID required"),
  secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
});

export const AwsConnectionProvisioningSchema = z.object({
  launchMethod: z.enum(["launch-stack"]).describe("How the IAM role was provisioned."),
  useCases: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(64)
    .describe("The Use cases the role was provisioned for."),
  stackName: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9-]{0,127}$/, "Stack name must be a valid CloudFormation stack name")
    .describe("The CloudFormation stack name."),
  partition: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{0,31}$/, "Partition must be a valid AWS partition label")
    .describe("The AWS partition the stack was launched in."),
  templateVersion: z.string().trim().min(1).max(64).describe("The version of the Provisioning template."),
  region: z
    .string()
    .trim()
    .refine(isValidAwsRegion, "Region must be a valid AWS region, for example us-east-1")
    .optional()
    .describe("The AWS region the CloudFormation stack lives in."),
  roleName: z
    .string()
    .trim()
    .regex(/^[\w+=,.@-]{1,64}$/, "Role name must be a valid IAM role name of up to 64 characters")
    .optional()
    .describe("The name of the IAM role the stack created.")
});

export const AwsConnectionConfigurationSchema = z.object({
  provisioning: AwsConnectionProvisioningSchema.nullish().describe(
    "How the connection's role was provisioned. Null for roles created manually."
  )
});

const BaseAwsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AWS),
  configuration: AwsConnectionConfigurationSchema.optional()
});

export const AwsConnectionSchema = z.intersection(
  BaseAwsConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AwsConnectionMethod.AssumeRole),
      credentials: AwsConnectionAssumeRoleCredentialsSchema
    }),
    z.object({
      method: z.literal(AwsConnectionMethod.AccessKey),
      credentials: AwsConnectionAccessTokenCredentialsSchema
    })
  ])
);

export const SanitizedAwsConnectionSchema = z.discriminatedUnion("method", [
  BaseAwsConnectionSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: AwsConnectionAssumeRoleCredentialsSchema.pick({ stsEndpoint: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AWS]} (Assume Role)` })),
  BaseAwsConnectionSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: AwsConnectionAccessTokenCredentialsSchema.pick({ accessKeyId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AWS]} (Access Key)` }))
]);

export const ValidateAwsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(AwsConnectionMethod.AssumeRole).describe(AppConnections.CREATE(AppConnection.AWS).method),
    credentials: AwsConnectionAssumeRoleInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AWS).credentials
    )
  }),
  z.object({
    method: z.literal(AwsConnectionMethod.AccessKey).describe(AppConnections.CREATE(AppConnection.AWS).method),
    credentials: AwsConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AWS).credentials
    )
  })
]);

export const CreateAwsConnectionSchema = ValidateAwsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AWS)
).and(z.object({ configuration: AwsConnectionConfigurationSchema.optional() }));

export const UpdateAwsConnectionSchema = z
  .object({
    credentials: z
      .union([AwsConnectionAccessTokenCredentialsSchema, AwsConnectionAssumeRoleInputCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AWS).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AWS));

export const AwsConnectionListItemSchema = z
  .object({
    name: z.literal("AWS"),
    app: z.literal(AppConnection.AWS),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(AwsConnectionMethod.AssumeRole), z.literal(AwsConnectionMethod.AccessKey)]),
    methods: z.nativeEnum(AwsConnectionMethod).array(),
    accessKeyId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AWS] }));
