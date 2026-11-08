import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import {
  ProvisioningTemplateKind,
  TProvisioningTemplate,
  TProvisioningTemplateProvider
} from "../provisioning-template-types";
import { AWS_PARTITIONS, AwsPartition } from "./aws-partitions";
import {
  AWS_PROVISIONING_TEMPLATE_VERSION,
  DEFAULT_AWS_ROLE_NAME,
  DEFAULT_AWS_STACK_NAME,
  DEFAULT_AWS_TEMPLATE_BASE_URL
} from "./aws-provisioning-template-constants";

const TRUSTED_ACCOUNT_CACHE_TTL_MS = 60 * 60 * 1000;

const trustedAccountCache: Record<string, { accountId: string; expiresAt: number }> = {};

const toggleName = (useCase: string) =>
  `Enable${useCase.replace(/(^|-)(\w)/g, (_, __, char: string) => char.toUpperCase())}`;

export const getAwsTemplateUrl = () => {
  const baseUrl = (getConfig().INF_APP_CONNECTION_AWS_TEMPLATE_BASE_URL ?? DEFAULT_AWS_TEMPLATE_BASE_URL).replace(
    /\/+$/,
    ""
  );
  return `${baseUrl}/aws-app-connection/v${AWS_PROVISIONING_TEMPLATE_VERSION}/infisical-aws-app-connection.yaml`;
};

export const getAwsTrustedAccountId = async (partitionName: string = AwsPartition.Commercial) => {
  const appCfg = getConfig();
  if (appCfg.INF_APP_CONNECTION_AWS_TRUSTED_ACCOUNT_ID) return appCfg.INF_APP_CONNECTION_AWS_TRUSTED_ACCOUNT_ID;

  const cached = trustedAccountCache[partitionName];
  if (cached && cached.expiresAt > Date.now()) return cached.accountId;

  try {
    const partition = AWS_PARTITIONS[partitionName];
    if (!partition) throw new Error(`Unknown AWS partition '${partitionName}'`);

    const client = new STSClient({
      region: partition.defaultRegion,
      sha256: CustomAWSHasher,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      credentials:
        appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID && appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID,
              secretAccessKey: appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
            }
          : undefined
    });
    const { Account: accountId } = await client.send(new GetCallerIdentityCommand({}));
    if (!accountId) throw new Error("GetCallerIdentity returned no account");

    trustedAccountCache[partitionName] = { accountId, expiresAt: Date.now() + TRUSTED_ACCOUNT_CACHE_TTL_MS };
    return accountId;
  } catch (err) {
    logger.error(err, "Failed to derive the AWS Trusted account for the provisioning template");
    throw new BadRequestError({
      message:
        "Infisical could not determine the AWS account to trust, so a launch link can't be created. Create the role manually, or ask your instance administrator to set INF_APP_CONNECTION_AWS_TRUSTED_ACCOUNT_ID."
    });
  }
};

export type TAwsProvisioningTemplateQuery = {
  partition: string;
  region?: string;
  useCases: string[];
  roleName?: string;
  stackName?: string;
};

export const awsProvisioningTemplateProvider: TProvisioningTemplateProvider<TAwsProvisioningTemplateQuery> = {
  getTemplate: async ({ externalId }, query): Promise<TProvisioningTemplate | null> => {
    const partition = AWS_PARTITIONS[query.partition];
    if (!partition?.launchSupported) return null;

    if (query.region && !partition.isRegionInPartition(query.region)) {
      throw new BadRequestError({
        message: `Region ${query.region} does not belong to the ${query.partition} partition`
      });
    }

    const region = query.region ?? partition.defaultRegion;
    const stackName = query.stackName ?? DEFAULT_AWS_STACK_NAME;
    const templateUrl = getAwsTemplateUrl();

    const parameters: Record<string, string> = {
      ExternalId: externalId,
      TrustedAccountId: await getAwsTrustedAccountId(query.partition),
      RoleName: query.roleName ?? DEFAULT_AWS_ROLE_NAME
    };
    query.useCases
      .filter((useCase) => !partition.unsupportedUseCases.includes(useCase))
      .forEach((useCase) => {
        parameters[toggleName(useCase)] = "true";
      });

    const params = [
      `templateURL=${encodeURIComponent(templateUrl)}`,
      `stackName=${encodeURIComponent(stackName)}`,
      ...Object.entries(parameters).map(([key, value]) => `param_${key}=${encodeURIComponent(value)}`)
    ].join("&");

    return {
      kind: ProvisioningTemplateKind.CloudFormationLaunch,
      launchUrl: `https://${region}.${partition.consoleDomain}/cloudformation/home?region=${region}#/stacks/quickcreate?${params}`,
      templateUrl,
      stackName,
      region,
      partition: query.partition,
      templateVersion: AWS_PROVISIONING_TEMPLATE_VERSION,
      parameters,
      outputKey: "RoleArn"
    };
  }
};
