import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteUserCommand,
  IAMClient
} from "@aws-sdk/client-iam";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws";
import { AwsConnectionSchema } from "@app/services/app-connection/aws/aws-connection-schemas";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenConfigDALFactory } from "../../honey-token-config/honey-token-config-dal";
import { HoneyTokenConfigStatus } from "../../honey-token-config/honey-token-config-enums";
import { TLicenseServiceFactory } from "../../license/license-service";
import { HoneyTokenType } from "../honey-token-enums";
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

export const createAwsIamHoneyTokenCredentials = async ({ appConnection }: { appConnection: TAppConnection }) => {
  const awsConfig = parseAwsConnectionConfig(appConnection);
  const { credentials: awsCredentials, region } = await getAwsConnectionConfig(awsConfig);
  const iam = new IAMClient({ credentials: awsCredentials, region });

  const iamUserName = `${HONEY_TOKEN_IAM_USER_PREFIX}${crypto.randomBytes(8).toString("hex")}`;
  await iam.send(new CreateUserCommand({ UserName: iamUserName }));

  const createKeyRes = await iam.send(new CreateAccessKeyCommand({ UserName: iamUserName }));
  if (!createKeyRes.AccessKey?.AccessKeyId || !createKeyRes.AccessKey?.SecretAccessKey) {
    throw new BadRequestError({ message: "Failed to create AWS access key for honey token" });
  }

  return {
    accessKeyId: createKeyRes.AccessKey.AccessKeyId,
    secretAccessKey: createKeyRes.AccessKey.SecretAccessKey,
    iamUserName
  };
};

export const revokeAwsIamHoneyTokenCredentials = async ({
  appConnection,
  iamUserName,
  accessKeyId
}: {
  appConnection: TAppConnection;
  iamUserName: string;
  accessKeyId: string;
}) => {
  const awsConfig = parseAwsConnectionConfig(appConnection);
  const { credentials: awsCredentials, region } = await getAwsConnectionConfig(awsConfig);
  const iam = new IAMClient({ credentials: awsCredentials, region });

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
