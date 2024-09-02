import { Block, WebClient } from "@slack/web-api";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TSlackIntegrationDALFactory } from "./slack-integration-dal";
import { SlackTriggerFeature } from "./slack-types";

export const triggerSlackNotification = async ({
  projectId,
  payloadBlocks,
  payloadMessage,
  slackIntegrationDAL,
  projectDAL,
  kmsService,
  feature
}: {
  projectId: string;
  payloadBlocks: Block[];
  payloadMessage: string;
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  feature: SlackTriggerFeature;
}) => {
  const project = await projectDAL.findById(projectId);
  const slackIntegration = await slackIntegrationDAL.findOne({
    projectId
  });

  if (!slackIntegration) {
    return;
  }

  let targetChannels: string[] = [];
  if (feature === SlackTriggerFeature.ACCESS_REQUEST) {
    targetChannels = slackIntegration.accessRequestChannels?.split(", ") || [];
    if (!targetChannels.length || !slackIntegration.isAccessRequestNotificationEnabled) {
      return;
    }
  } else if (feature === SlackTriggerFeature.SECRET_APPROVAL) {
    targetChannels = slackIntegration.secretRequestChannels?.split(", ") || [];
    if (!targetChannels.length || !slackIntegration.isSecretRequestNotificationEnabled) {
      return;
    }
  }

  const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId: project.orgId
  });

  const botKey = orgDataKeyDecryptor({
    cipherTextBlob: slackIntegration.encryptedBotAccessToken
  }).toString("utf8");

  const targetChannelSet = new Set<string>(targetChannels);
  const slackWebClient = new WebClient(botKey);
  const channelIdsToSendNotif: string[] = [];
  let cursor;

  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await slackWebClient.conversations.list({
      cursor,
      limit: 1000,
      types: "public_channel,private_channel"
    });

    response.channels?.forEach((channel) => {
      if (channel.name_normalized && targetChannelSet.has(channel.name_normalized)) {
        channelIdsToSendNotif.push(channel.id as string);
      }
    });

    // Set the cursor for the next page
    cursor = response.response_metadata?.next_cursor;
  } while (cursor); // Continue while there is a cursor

  for await (const conversationId of channelIdsToSendNotif) {
    // we send both text and blocks for compatibility with barebone clients
    await slackWebClient.chat.postMessage({
      channel: conversationId,
      text: payloadMessage,
      blocks: payloadBlocks
    });
  }
};
