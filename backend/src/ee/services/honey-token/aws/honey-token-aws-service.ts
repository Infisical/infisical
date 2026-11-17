import { getConfig as getAppConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { HoneyTokenConfigStatus } from "../../honey-token-config/honey-token-config-enums";
import { HoneyTokenManagedBy, HoneyTokenType } from "../honey-token-enums";
import { isValidHoneyTokenSignature } from "../honey-token-fns";
import { THoneyTokenProviderHooks, THoneyTokenProviderHooksDep } from "../honey-token-service-types";
import { AwsHoneyTokenConfigSchema, getHoneyTokenManagedBy } from "../honey-token-types";
import {
  AwsHoneyTokenDeploymentUnavailableReason,
  TAwsHoneyTokenInstanceUnavailableReason
} from "./honey-token-aws-enums";
import {
  createAwsIamHoneyTokenCredentials,
  getManagedHoneyTokenUnavailableReason,
  parseAwsHoneyTokenDecryptedCredentials,
  revokeAwsIamHoneyTokenCredentials,
  verifyAwsStackDeployment
} from "./honey-token-aws-fns";

const MANAGED_UNAVAILABLE_MESSAGES: Record<TAwsHoneyTokenInstanceUnavailableReason, string> = {
  [AwsHoneyTokenDeploymentUnavailableReason.InstanceNotConfigured]:
    "the instance administrator has not set HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY.",
  [AwsHoneyTokenDeploymentUnavailableReason.IncompleteAwsCredentials]:
    "HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID and HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY must be set together.",
  [AwsHoneyTokenDeploymentUnavailableReason.InvalidRoleArn]:
    "HONEY_TOKEN_MANAGED_AWS_ROLE_ARN must be an IAM role ARN (arn:aws:iam::<account-id>:role/<name>)."
};

export const honeyTokenAwsProviderHooksFactory = ({
  kmsService,
  appConnectionDAL,
  honeyTokenDAL,
  honeyTokenConfigDAL
}: THoneyTokenProviderHooksDep): THoneyTokenProviderHooks => {
  const $getCompleteOrganizationConfig = async (orgId: string) => {
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

  const $isValidOrganizationSignature = async ({
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
    if (honeyToken && getHoneyTokenManagedBy(honeyToken) === HoneyTokenManagedBy.Organization) {
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
    prepareCreate: async ({ config, orgId, getAppConnection }) => {
      if (config.managedBy === HoneyTokenManagedBy.Instance) {
        const managedUnavailableReason = getManagedHoneyTokenUnavailableReason();
        if (managedUnavailableReason) {
          throw new BadRequestError({
            message: `Infisical-managed honey tokens are not available on this instance: ${MANAGED_UNAVAILABLE_MESSAGES[managedUnavailableReason]} Create the honey token in your own AWS account instead.`
          });
        }
        return { target: { managedBy: HoneyTokenManagedBy.Instance }, orgConnection: null };
      }

      const orgConfig = await $getCompleteOrganizationConfig(orgId);
      const appConnection = await getAppConnection(orgConfig.connectionId);

      return {
        target: { managedBy: HoneyTokenManagedBy.Organization, appConnection },
        orgConnection: {
          appConnection,
          connectionId: orgConfig.connectionId,
          encryptedConfig: orgConfig.encryptedConfig
        }
      };
    },
    getRevokeTarget: async ({ honeyToken, orgId, getAppConnection }) => {
      if (getHoneyTokenManagedBy(honeyToken) === HoneyTokenManagedBy.Instance) {
        return { managedBy: HoneyTokenManagedBy.Instance };
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
        managedBy: HoneyTokenManagedBy.Organization,
        appConnection: await getAppConnection(orgConfig.connectionId)
      };
    },
    authenticateTrigger: async ({ tokenIdentifier, timestamp, signatureHash, rawBody }) => {
      const managedSigningKey = getAppConfig().HONEY_TOKEN_MANAGED_WEBHOOK_SIGNING_KEY;
      // The instance key does not depend on which token fired, so it is checked before any lookup and
      // a managed trigger reveals nothing about which access key IDs are registered.
      const isManagedTrigger = managedSigningKey
        ? isValidHoneyTokenSignature({ signingKey: managedSigningKey, timestamp, rawBody, signatureHash })
        : false;

      // A managed trigger is already authenticated by the instance key, and acknowledging an untracked key stops
      // AWS from retrying, so it reads the primary: a replica behind a new token would drop the alert. Customer
      // account triggers are looked up before they are authenticated, so they stay on the replica.
      const honeyToken = isManagedTrigger
        ? await honeyTokenDAL.transaction((tx) => honeyTokenDAL.findOneByTokenIdentifier(tokenIdentifier, tx))
        : await honeyTokenDAL.findOneByTokenIdentifier(tokenIdentifier);

      if (isManagedTrigger) {
        if (!honeyToken || getHoneyTokenManagedBy(honeyToken) !== HoneyTokenManagedBy.Instance) {
          // Our own stack reported a key we no longer track (eg its project was deleted).
          logger.warn(`Managed honey token trigger for an untracked access key [accessKeyId=${tokenIdentifier}]`);
          return { outcome: "ignored" };
        }
      } else {
        const isValid = await $isValidOrganizationSignature({ honeyToken, timestamp, rawBody, signatureHash });
        if (!honeyToken || !isValid) return { outcome: "rejected" };
      }

      return {
        outcome: "accepted",
        honeyToken,
        telemetryProperties: { managedBy: getHoneyTokenManagedBy(honeyToken) }
      };
    }
  };
};
