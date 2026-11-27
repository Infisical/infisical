import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import { logger } from "@app/lib/logger";
import { TSlackPayload } from "@app/lib/slack/slack-webhook";

import { decryptChannelConfig, getAlertChannelCipher, TAlertDecryptor } from "./alert-channel-crypto-fns";
import { SlackAppChannelConfigSchema, TAlertChannelDeps } from "./alert-channel-types";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { TAlertSlackMessageDALFactory } from "./alert-slack-message-dal";
import { SlackMessageUpdateResult, updateSlackAppMessage } from "./channels/alert-channel-slack-app-fns";
import { buildResolvedSlackPayload } from "./channels/alert-channel-slack-fns";

export type TAlertMessageResolutionDep = {
  alertProviderRegistry: Pick<TAlertProviderRegistry, "get">;
  alertSlackMessageDAL: Pick<TAlertSlackMessageDALFactory, "findByTargets" | "deleteById">;
  slackIntegrationDAL: TAlertChannelDeps["slackIntegrationDAL"];
  kmsDataKeyService: TAlertChannelDeps["kmsDataKeyService"];
};

export type TAlertMessageResolutionService = ReturnType<typeof alertMessageResolutionFactory>;

export const alertMessageResolutionFactory = ({
  alertProviderRegistry,
  alertSlackMessageDAL,
  slackIntegrationDAL,
  kmsDataKeyService
}: TAlertMessageResolutionDep) => {
  // Returns the errors worth retrying; every message it could finish with is deleted.
  const resolveMessages = async ({
    orgId,
    projectId,
    resourceType,
    targetIds
  }: {
    orgId: string;
    projectId?: string | null;
    resourceType: string;
    targetIds: string[];
  }): Promise<string[]> => {
    const resolver = alertProviderRegistry.get(resourceType)?.messageResolver;
    if (!resolver) return [];

    const messages = await alertSlackMessageDAL.findByTargets({ orgId, resourceType, targetIds });
    if (messages.length === 0) return [];

    const resolutions = await resolver.resolveTargets({
      orgId,
      projectId,
      targetIds: [...new Set(messages.map((message) => message.targetId))]
    });
    const { decryptor } = await kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });

    const destinationDecryptors = new Map<string, Promise<TAlertDecryptor>>();
    // An admin who removed this Slack channel from the alert stops seeing its updates, including reviewer comments.
    const $stillPostsHere = async (message: (typeof messages)[number]) => {
      if (
        !message.alertEnabled ||
        !message.channelEnabled ||
        !message.membershipId ||
        !message.channelEncryptedConfig
      ) {
        return false;
      }
      const key = message.channelProjectId ?? "";
      let destinationDecryptor = destinationDecryptors.get(key);
      if (!destinationDecryptor) {
        destinationDecryptor = getAlertChannelCipher(kmsDataKeyService, {
          orgId,
          projectId: message.channelProjectId
        })
          .then((cipher) => cipher.decryptor)
          .catch((err: unknown) => {
            destinationDecryptors.delete(key);
            throw err;
          });
        destinationDecryptors.set(key, destinationDecryptor);
      }
      const config = SlackAppChannelConfigSchema.safeParse(
        decryptChannelConfig(message.channelEncryptedConfig, await destinationDecryptor)
      );
      return (
        config.success &&
        config.data.workflowIntegrationId === message.workflowIntegrationId &&
        config.data.channels.some((channel) => channel.id === message.slackChannelId)
      );
    };

    const errors: string[] = [];
    for (const message of messages) {
      const resolution = resolutions.get(message.targetId);
      let postsHere: boolean | null = null;
      if (resolution) {
        try {
          // eslint-disable-next-line no-await-in-loop
          postsHere = await $stillPostsHere(message);
        } catch (err) {
          logger.error(err, `Failed to check where a closed Slack alert message posts [messageId=${message.id}]`);
          errors.push(`${message.slackChannelId}/${message.messageTs}: could not check the alert channel`);
        }
      }

      if (resolution && postsHere === false) {
        // eslint-disable-next-line no-await-in-loop
        await alertSlackMessageDAL.deleteById(message.id);
      } else if (resolution && postsHere) {
        let original: TSlackPayload | null = null;
        try {
          original = JSON.parse(decryptor({ cipherTextBlob: message.encryptedMessage }).toString()) as TSlackPayload;
        } catch (err) {
          logger.error(err, `Failed to read a stored Slack alert message [messageId=${message.id}]`);
        }

        const update = original
          ? // eslint-disable-next-line no-await-in-loop -- one message at a time keeps us under Slack's per-workspace rate limit
            await updateSlackAppMessage(
              { slackIntegrationDAL, kmsDataKeyService },
              {
                orgId,
                workflowIntegrationId: message.workflowIntegrationId,
                slackChannelId: message.slackChannelId,
                messageTs: message.messageTs,
                message: buildResolvedSlackPayload(original, resolution)
              }
            )
          : { result: SlackMessageUpdateResult.Gone, error: "unreadable stored message" };

        if (update.result === SlackMessageUpdateResult.Retry) {
          errors.push(`${message.slackChannelId}/${message.messageTs}: ${update.error ?? "unknown error"}`);
        } else {
          if (update.result === SlackMessageUpdateResult.Gone) {
            logger.warn(
              `Skipped updating a closed Slack alert message [messageId=${message.id}] [reason=${update.error ?? "unknown"}]`
            );
          }
          // eslint-disable-next-line no-await-in-loop
          await alertSlackMessageDAL.deleteById(message.id);
        }
      }
    }
    return errors;
  };

  return { resolveMessages };
};
