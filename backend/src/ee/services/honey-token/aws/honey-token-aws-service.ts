import { getConfig as getAppConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { HoneyTokenConfigStatus } from "../../honey-token-config/honey-token-config-enums";
import { HoneyTokenHosting, HoneyTokenManagedUnavailableReason, HoneyTokenType } from "../honey-token-enums";
import { isValidHoneyTokenSignature } from "../honey-token-fns";
import { THoneyTokenProviderHooks, THoneyTokenProviderHooksDep } from "../honey-token-service-types";
import { AwsHoneyTokenConfigSchema, getHoneyTokenHosting } from "../honey-token-types";
import {
  createAwsIamHoneyTokenCredentials,
  getManagedHoneyTokenUnavailableReason,
  parseAwsHoneyTokenDecryptedCredentials,
  revokeAwsIamHoneyTokenCredentials,
  verifyAwsStackDeployment
} from "./honey-token-aws-fns";

const MANAGED_UNAVAILABLE_MESSAGES: Record<HoneyTokenManagedUnavailableReason, string> = {
  [HoneyTokenManagedUnavailableReason.NotConfigured]:
    "the instance administrator has not set HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY.",
  [HoneyTokenManagedUnavailableReason.IncompleteAwsCredentials]:
    "HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID and HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY must be set together.",
  [HoneyTokenManagedUnavailableReason.InvalidRoleArn]:
    "HONEY_TOKEN_MANAGED_AWS_ROLE_ARN must be an IAM role ARN (arn:aws:iam::<account-id>:role/<name>)."
};

export const honeyTokenAwsProviderHooksFactory = ({
  kmsService,
  appConnectionDAL,
  honeyTokenDAL,
  honeyTokenConfigDAL
}: THoneyTokenProviderHooksDep): THoneyTokenProviderHooks => {
  const $getCompleteCustomerAccountConfig = async (orgId: string) => {
    const orgConfig = await honeyTokenConfigDAL.findOne({
      orgId,
      type: HoneyTokenType.AWS,
      status: HoneyTokenConfigStatus.Complete
    });

    if (!orgConfig?.connectionId) {
      const pendingConfig = await honeyTokenConfigDAL.findOne({
        orgId,
        type: HoneyTokenType.AWS,
        status: HoneyTokenConfigStatus.VerificationPending
      });

      throw new BadRequestError({
        message: pendingConfig
          ? "Your AWS account is connected but stack verification is still pending. Deploy and verify the stack in Organization Settings before creating honey tokens in your own AWS account."
          : "Your organization has not connected its own AWS account for honey tokens. Connect it in Organization Settings, or create an Infisical-managed honey token instead."
      });
    }

    return { ...orgConfig, connectionId: orgConfig.connectionId };
  };

  const $isValidCustomerAccountSignature = async ({
    honeyToken,
    timestamp,
    rawBody,
    signatureHash
  }: {
    honeyToken: Awaited<ReturnType<typeof honeyTokenDAL.findOneByTokenIdentifier>>;
    timestamp: string;
    rawBody: string;
    signatureHash: string;
  }) => {
    let webhookSigningKey: string | null = null;
    if (honeyToken && getHoneyTokenHosting(honeyToken) === HoneyTokenHosting.CustomerAccount) {
      const config = await honeyTokenConfigDAL.findOne({
        orgId: honeyToken.orgId,
        type: HoneyTokenType.AWS,
        status: HoneyTokenConfigStatus.Complete
      });

      if (config?.encryptedConfig) {
        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.Organization,
          orgId: honeyToken.orgId
        });
        const decrypted = decryptor({ cipherTextBlob: config.encryptedConfig });
        const storedConfig = AwsHoneyTokenConfigSchema.parse(JSON.parse(decrypted.toString()) as unknown);
        webhookSigningKey = storedConfig.webhookSigningKey;
      }
    }

    // Always compute HMAC to prevent timing side-channel that reveals token existence
    const dummySigningKey = "0".repeat(64);
    const isValid = isValidHoneyTokenSignature({
      signingKey: webhookSigningKey ?? dummySigningKey,
      timestamp,
      rawBody,
      signatureHash
    });

    return Boolean(webhookSigningKey) && isValid;
  };

  return {
    createCredentials: (target) =>
      createAwsIamHoneyTokenCredentials(target).then((credentials) => ({
        credentials,
        tokenIdentifier: credentials.accessKeyId
      })),
    revokeCredentials: ({ target, credentials }) =>
      revokeAwsIamHoneyTokenCredentials({
        target,
        iamUserName: credentials.iamUserName,
        accessKeyId: credentials.accessKeyId
      }),
    verifyDeployment: async ({ connectionId, orgId, encryptedConfig }) => {
      const { decryptor: configDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId
      });
      const config = encryptedConfig
        ? AwsHoneyTokenConfigSchema.parse(
            JSON.parse(configDecryptor({ cipherTextBlob: encryptedConfig }).toString()) as unknown
          )
        : null;

      return verifyAwsStackDeployment({
        connectionId,
        stackName: config?.stackName ?? "infisical-honey-tokens",
        awsRegion: config?.awsRegion ?? "us-east-1",
        appConnectionDAL,
        kmsService
      });
    },
    getCredentialsForDisplay: async ({ encryptedCredentials, projectId }) => {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const decryptedCredentials = parseAwsHoneyTokenDecryptedCredentials(
        JSON.parse(decryptor({ cipherTextBlob: encryptedCredentials }).toString()) as unknown
      );
      return {
        accessKeyId: decryptedCredentials.accessKeyId,
        secretAccessKey: decryptedCredentials.secretAccessKey
      };
    },
    getCreationOptions: async ({ orgId }) => {
      const orgConfig = await honeyTokenConfigDAL.findOne({ orgId, type: HoneyTokenType.AWS });
      const managedUnavailableReason = getManagedHoneyTokenUnavailableReason();

      return {
        infisicalManaged: { isAvailable: !managedUnavailableReason, unavailableReason: managedUnavailableReason },
        customerAccount: { configStatus: orgConfig ? (orgConfig.status as HoneyTokenConfigStatus) : null }
      };
    },
    prepareCreate: async ({ config, orgId, getAppConnection }) => {
      if (config.hosting === HoneyTokenHosting.InfisicalManaged) {
        const managedUnavailableReason = getManagedHoneyTokenUnavailableReason();
        if (managedUnavailableReason) {
          throw new BadRequestError({
            message: `Infisical-managed honey tokens are not available on this instance: ${MANAGED_UNAVAILABLE_MESSAGES[managedUnavailableReason]} Create the honey token in your own AWS account instead.`
          });
        }
        return { target: { hosting: HoneyTokenHosting.InfisicalManaged }, orgConnection: null };
      }

      const orgConfig = await $getCompleteCustomerAccountConfig(orgId);
      const appConnection = await getAppConnection(orgConfig.connectionId);

      return {
        target: { hosting: HoneyTokenHosting.CustomerAccount, appConnection },
        orgConnection: {
          appConnection,
          connectionId: orgConfig.connectionId,
          encryptedConfig: orgConfig.encryptedConfig
        }
      };
    },
    getRevokeTarget: async ({ honeyToken, orgId, getAppConnection }) => {
      if (getHoneyTokenHosting(honeyToken) === HoneyTokenHosting.InfisicalManaged) {
        return { hosting: HoneyTokenHosting.InfisicalManaged };
      }

      const orgConfig = await honeyTokenConfigDAL.findOne({
        orgId,
        type: HoneyTokenType.AWS,
        status: HoneyTokenConfigStatus.Complete
      });

      if (!orgConfig?.connectionId) {
        throw new BadRequestError({
          message:
            "This honey token lives in your own AWS account, but that account is no longer connected. Reconnect it in Organization Settings to revoke the honey token."
        });
      }

      return {
        hosting: HoneyTokenHosting.CustomerAccount,
        appConnection: await getAppConnection(orgConfig.connectionId)
      };
    },
    authenticateTrigger: async ({ tokenIdentifier, timestamp, signatureHash, rawBody }) => {
      const appCfg = getAppConfig();
      const managedSigningKeys = [
        appCfg.HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY,
        appCfg.HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY_PREVIOUS
      ].filter((key): key is string => Boolean(key));
      // The instance key does not depend on which token fired, so it is checked before any lookup and
      // a managed trigger reveals nothing about which access key IDs are registered.
      const isManagedTrigger = managedSigningKeys.some((key) =>
        isValidHoneyTokenSignature({ signingKey: key, timestamp, rawBody, signatureHash })
      );

      // A managed trigger is already authenticated by the instance key, and acknowledging an untracked key stops
      // AWS from retrying, so it reads the primary: a replica behind a new token would drop the alert. Customer
      // account triggers are looked up before they are authenticated, so they stay on the replica.
      const honeyToken = isManagedTrigger
        ? await honeyTokenDAL.transaction((tx) => honeyTokenDAL.findOneByTokenIdentifier(tokenIdentifier, tx))
        : await honeyTokenDAL.findOneByTokenIdentifier(tokenIdentifier);

      if (isManagedTrigger) {
        if (!honeyToken || getHoneyTokenHosting(honeyToken) !== HoneyTokenHosting.InfisicalManaged) {
          // Our own stack reported a key we no longer track (eg its project was deleted).
          logger.warn(`Managed honey token trigger for an untracked access key [accessKeyId=${tokenIdentifier}]`);
          return { outcome: "ignored" };
        }
      } else {
        const isValid = await $isValidCustomerAccountSignature({ honeyToken, timestamp, rawBody, signatureHash });
        if (!honeyToken || !isValid) return { outcome: "rejected" };
      }

      return {
        outcome: "accepted",
        honeyToken,
        telemetryProperties: { hosting: getHoneyTokenHosting(honeyToken) }
      };
    }
  };
};
