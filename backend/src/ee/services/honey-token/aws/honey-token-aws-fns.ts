import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteUserCommand,
  IAMClient,
  LimitExceededException
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig as getAppConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws";
import { AwsConnectionSchema } from "@app/services/app-connection/aws/aws-connection-schemas";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenConfigDALFactory } from "../../honey-token-config/honey-token-config-dal";
import { HoneyTokenConfigStatus } from "../../honey-token-config/honey-token-config-enums";
import { TLicenseServiceFactory } from "../../license/license-service";
import { HoneyTokenHosting, HoneyTokenManagedUnavailableReason, HoneyTokenType } from "../honey-token-enums";
import type { THoneyTokenCredentialTarget } from "../honey-token-service-types";
import { AwsHoneyTokenConfigSchema } from "../honey-token-types";
import {
  TGetAwsHoneyTokenConfigInput,
  THoneyTokenConfigRecord,
  THoneyTokenConfigWithDecrypted,
  TTestAwsHoneyTokenConnectionInput,
  TUpsertAwsHoneyTokenConfigInput
} from "./honey-token-aws-config-types";
import { AwsHoneyTokenDecryptedCredentialsSchema, TAwsHoneyTokenDecryptedCredentials } from "./honey-token-aws-types";

type TConfigProviderDep = {
  honeyTokenConfigDAL: THoneyTokenConfigDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
};

const HONEY_TOKEN_IAM_USER_PREFIX = "inf_ht_";
// IAM is a global service; the region only picks which endpoint the SDK signs against.
const MANAGED_AWS_REGION = "us-east-1";
const IAM_ROLE_ARN_REGEX = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/;
const CF_COMPLETE_STATUSES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE", "IMPORT_COMPLETE"]);

const parseAwsConnectionConfig = (decryptedConnection: unknown): TAwsConnectionConfig => {
  const parsedConnection = AwsConnectionSchema.safeParse(decryptedConnection);
  if (!parsedConnection.success) {
    throw new BadRequestError({
      message: "Invalid AWS App Connection configuration"
    });
  }

  return parsedConnection.data as TAwsConnectionConfig;
};

export const verifyAwsStackDeployment = async ({
  connectionId,
  stackName,
  awsRegion,
  appConnectionDAL,
  kmsService
}: {
  connectionId: string;
  stackName: string;
  awsRegion: string;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<{ deployed: boolean; status: string | null }> => {
  try {
    const appConnection = await appConnectionDAL.findById(connectionId);
    if (!appConnection) {
      return { deployed: false, status: null };
    }

    const decryptedConnection = await decryptAppConnection(appConnection, kmsService);
    const awsConfig = parseAwsConnectionConfig(decryptedConnection);
    const { credentials: awsCredentials } = await getAwsConnectionConfig(awsConfig);

    const cfn = new CloudFormationClient({ credentials: awsCredentials, region: awsRegion });
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = res.Stacks?.[0];

    if (!stack) return { deployed: false, status: null };

    return {
      deployed: CF_COMPLETE_STATUSES.has(stack.StackStatus ?? ""),
      status: stack.StackStatus ?? null
    };
  } catch (err) {
    const awsCode = (err as { code?: string }).code;

    if (awsCode === "ValidationError") {
      return { deployed: false, status: null };
    }

    logger.warn({ err, connectionId, stackName }, "Failed to verify honey token CloudFormation stack deployment");
    return { deployed: false, status: null };
  }
};

// Only what can be checked without calling AWS. Credentials that are present but wrong still surface
// as an AWS error when a managed token is created.
export const getManagedHoneyTokenUnavailableReason = (): HoneyTokenManagedUnavailableReason | null => {
  const appCfg = getAppConfig();

  if (!appCfg.HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY) {
    return HoneyTokenManagedUnavailableReason.NotConfigured;
  }

  // One half of a key pair would otherwise fall through to the default credential chain unnoticed.
  if (
    Boolean(appCfg.HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID) !== Boolean(appCfg.HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY)
  ) {
    return HoneyTokenManagedUnavailableReason.IncompleteAwsCredentials;
  }

  // A user ARN here is an easy mistake, and AWS only reports it as a generic AssumeRole denial.
  if (appCfg.HONEY_TOKEN_MANAGED_AWS_ROLE_ARN && !IAM_ROLE_ARN_REGEX.test(appCfg.HONEY_TOKEN_MANAGED_AWS_ROLE_ARN)) {
    return HoneyTokenManagedUnavailableReason.InvalidRoleArn;
  }

  return null;
};

const getManagedAwsCredentials = async () => {
  const appCfg = getAppConfig();

  const baseCredentials =
    appCfg.HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID && appCfg.HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: appCfg.HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID,
          secretAccessKey: appCfg.HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY
        }
      : undefined; // if hosting on AWS

  if (!appCfg.HONEY_TOKEN_MANAGED_AWS_ROLE_ARN) return baseCredentials;

  const sts = new STSClient({
    region: MANAGED_AWS_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: baseCredentials
  });

  const assumeRes = await sts.send(
    new AssumeRoleCommand({
      RoleArn: appCfg.HONEY_TOKEN_MANAGED_AWS_ROLE_ARN,
      RoleSessionName: `infisical-honey-token-${crypto.nativeCrypto.randomUUID()}`,
      DurationSeconds: 900
    })
  );

  if (!assumeRes.Credentials?.AccessKeyId || !assumeRes.Credentials?.SecretAccessKey) {
    throw new InternalServerError({ message: "Failed to access the Infisical-managed honey token AWS account" });
  }

  return {
    accessKeyId: assumeRes.Credentials.AccessKeyId,
    secretAccessKey: assumeRes.Credentials.SecretAccessKey,
    sessionToken: assumeRes.Credentials.SessionToken
  };
};

const getManagedIamClient = async () => {
  const appCfg = getAppConfig();

  try {
    const iam = new IAMClient({
      region: MANAGED_AWS_REGION,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      sha256: CustomAWSHasher,
      credentials: await getManagedAwsCredentials()
    });
    // Resolved now rather than on the first IAM call, so a missing credential reads as a setup problem
    // instead of a raw SDK error halfway through creating a token.
    await iam.config.credentials();

    return { iam, path: appCfg.HONEY_TOKEN_MANAGED_AWS_IAM_PATH };
  } catch (err) {
    logger.error({ err }, "Failed to obtain AWS credentials for Infisical-managed honey tokens");

    if (appCfg.isCloud) {
      throw new InternalServerError({
        message: "Infisical-managed honey tokens are temporarily unavailable. Contact support if this persists."
      });
    }

    const isMissingCredentials = (err as { name?: string }).name === "CredentialsProviderError";
    throw new InternalServerError({
      message: isMissingCredentials
        ? "Infisical-managed honey tokens are not fully set up on this instance: no AWS credentials were found. Ask your instance administrator to set HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID and HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY (or INF_APP_CONNECTION_AWS_ACCESS_KEY_ID and INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY), or to run Infisical with an AWS role."
        : `Infisical-managed honey tokens could not reach their AWS account${
            appCfg.HONEY_TOKEN_MANAGED_AWS_ROLE_ARN ? " because HONEY_TOKEN_MANAGED_AWS_ROLE_ARN could not be assumed" : ""
          }. Ask your instance administrator to check the managed honey token AWS settings.`
    });
  }
};

const getIamClient = async (target: THoneyTokenCredentialTarget) => {
  if (target.hosting === HoneyTokenHosting.InfisicalManaged) {
    return getManagedIamClient();
  }

  const awsConfig = parseAwsConnectionConfig(target.appConnection);
  const { credentials: awsCredentials, region } = await getAwsConnectionConfig(awsConfig);
  return { iam: new IAMClient({ credentials: awsCredentials, region }), path: undefined };
};

export const createAwsIamHoneyTokenCredentials = async (target: THoneyTokenCredentialTarget) => {
  const { iam, path } = await getIamClient(target);

  const iamUserName = `${HONEY_TOKEN_IAM_USER_PREFIX}${crypto.randomBytes(8).toString("hex")}`;
  try {
    await iam.send(new CreateUserCommand({ UserName: iamUserName, Path: path }));
  } catch (err) {
    if (err instanceof LimitExceededException) {
      throw new BadRequestError({
        message:
          target.hosting === HoneyTokenHosting.InfisicalManaged
            ? "Infisical-managed honey tokens are at capacity. Create the honey token in your own AWS account instead, or contact support."
            : "Your AWS account has reached its IAM user limit. Revoke unused honey tokens or IAM users, then try again."
      });
    }
    throw err;
  }

  try {
    const createKeyRes = await iam.send(new CreateAccessKeyCommand({ UserName: iamUserName }));
    if (!createKeyRes.AccessKey?.AccessKeyId || !createKeyRes.AccessKey?.SecretAccessKey) {
      throw new BadRequestError({ message: "Failed to create AWS access key for honey token" });
    }

    return {
      accessKeyId: createKeyRes.AccessKey.AccessKeyId,
      secretAccessKey: createKeyRes.AccessKey.SecretAccessKey,
      iamUserName
    };
  } catch (err) {
    await iam.send(new DeleteUserCommand({ UserName: iamUserName })).catch((deleteErr: unknown) => {
      logger.error(
        { err: deleteErr, iamUserName },
        `Failed to clean up honey token IAM user after access key creation failed [iamUserName=${iamUserName}]`
      );
    });
    throw err;
  }
};

export const revokeAwsIamHoneyTokenCredentials = async ({
  target,
  iamUserName,
  accessKeyId
}: {
  target: THoneyTokenCredentialTarget;
  iamUserName: string;
  accessKeyId: string;
}) => {
  const { iam } = await getIamClient(target);

  try {
    await iam.send(
      new DeleteAccessKeyCommand({
        UserName: iamUserName,
        AccessKeyId: accessKeyId
      })
    );
  } catch (err) {
    logger.info(
      { err, iamUserName, accessKeyId },
      "Skipping AWS access key deletion for honey token because it may already be deleted"
    );
  }

  try {
    await iam.send(new DeleteUserCommand({ UserName: iamUserName }));
  } catch (err) {
    logger.info(
      { err, iamUserName, accessKeyId },
      "Skipping AWS IAM user deletion for honey token because it may already be deleted"
    );
  }
};

export const parseAwsHoneyTokenDecryptedCredentials = (value: unknown): TAwsHoneyTokenDecryptedCredentials => {
  const result = AwsHoneyTokenDecryptedCredentialsSchema.safeParse(value);

  if (!result.success) {
    throw new BadRequestError({ message: "Invalid AWS honey token credentials" });
  }

  return result.data;
};

export const honeyTokenAwsConfigProviderFactory = ({
  honeyTokenConfigDAL,
  kmsService,
  licenseService,
  appConnectionDAL
}: TConfigProviderDep) => {
  const upsertConfig = async ({
    orgId,
    connectionId,
    config
  }: TUpsertAwsHoneyTokenConfigInput): Promise<THoneyTokenConfigRecord> => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.honeyTokens) {
      throw new BadRequestError({
        message: "Failed to save honey token configuration due to plan restriction. Upgrade plan to use honey tokens."
      });
    }

    const validatedConfig = AwsHoneyTokenConfigSchema.parse(config);
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const encryptedConfig = encryptor({
      plainText: Buffer.from(JSON.stringify(validatedConfig))
    }).cipherTextBlob;

    const stackDeployment = await verifyAwsStackDeployment({
      connectionId,
      stackName: validatedConfig.stackName,
      awsRegion: validatedConfig.awsRegion,
      appConnectionDAL,
      kmsService
    });
    const derivedStatus = stackDeployment.deployed
      ? HoneyTokenConfigStatus.Complete
      : HoneyTokenConfigStatus.VerificationPending;

    const existing = await honeyTokenConfigDAL.findOne({
      orgId,
      type: HoneyTokenType.AWS
    });
    if (existing) {
      // Keep webhook signing key immutable after first save.
      if (existing.encryptedConfig) {
        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.Organization,
          orgId
        });
        const decrypted = decryptor({ cipherTextBlob: existing.encryptedConfig });
        const existingConfig = AwsHoneyTokenConfigSchema.parse(JSON.parse(decrypted.toString()) as unknown);
        validatedConfig.webhookSigningKey = existingConfig.webhookSigningKey;
      }

      const updatedEncryptedConfig = encryptor({
        plainText: Buffer.from(JSON.stringify(validatedConfig))
      }).cipherTextBlob;

      return honeyTokenConfigDAL.updateById(existing.id, {
        connectionId,
        encryptedConfig: updatedEncryptedConfig,
        status: derivedStatus
      });
    }
    return honeyTokenConfigDAL.create({
      orgId,
      type: HoneyTokenType.AWS,
      connectionId,
      status: derivedStatus,
      encryptedConfig
    });
  };

  const testConnection = async ({ orgId }: TTestAwsHoneyTokenConnectionInput) => {
    const config = await honeyTokenConfigDAL.findOne({
      orgId,
      type: HoneyTokenType.AWS
    });
    if (!config?.encryptedConfig || !config.connectionId) {
      throw new BadRequestError({ message: "Honey token configuration not found. Save the configuration first." });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const decrypted = decryptor({ cipherTextBlob: config.encryptedConfig });
    const storedConfig = AwsHoneyTokenConfigSchema.parse(JSON.parse(decrypted.toString()) as unknown);

    const stackDeployment = await verifyAwsStackDeployment({
      connectionId: config.connectionId,
      stackName: storedConfig.stackName,
      awsRegion: storedConfig.awsRegion,
      appConnectionDAL,
      kmsService
    });

    await honeyTokenConfigDAL.updateById(config.id, {
      status: stackDeployment.deployed ? HoneyTokenConfigStatus.Complete : HoneyTokenConfigStatus.VerificationPending
    });

    return {
      isConnected: stackDeployment.deployed,
      status: stackDeployment.status,
      stackName: storedConfig.stackName
    };
  };

  const getConfig = async ({
    orgId
  }: TGetAwsHoneyTokenConfigInput): Promise<THoneyTokenConfigWithDecrypted | undefined> => {
    const config = await honeyTokenConfigDAL.findOne({
      orgId,
      type: HoneyTokenType.AWS
    });
    if (!config) {
      return undefined;
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    let decryptedConfig: THoneyTokenConfigWithDecrypted["decryptedConfig"] = null;
    if (config.encryptedConfig) {
      const decrypted = decryptor({ cipherTextBlob: config.encryptedConfig });
      decryptedConfig = AwsHoneyTokenConfigSchema.parse(JSON.parse(decrypted.toString()) as unknown);
    }
    return { ...config, decryptedConfig };
  };

  return { upsertConfig, testConnection, getConfig };
};
