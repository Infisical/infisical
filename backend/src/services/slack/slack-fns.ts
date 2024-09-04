import { Block, WebClient } from "@slack/web-api";

import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectSlackConfigDALFactory } from "./project-slack-config-dal";
import { SlackTriggerFeature } from "./slack-types";

export const fetchSlackChannels = async (botKey: string) => {
  const slackChannels: {
    name: string;
    id: string;
  }[] = [];

  const slackWebClient = new WebClient(botKey);
  let cursor;

  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await slackWebClient.conversations.list({
      cursor,
      limit: 1000,
      types: "public_channel,private_channel"
    });

    response.channels?.forEach((channel) =>
      slackChannels.push({
        name: channel.name_normalized as string,
        id: channel.id as string
      })
    );

    // Set the cursor for the next page
    cursor = response.response_metadata?.next_cursor;
  } while (cursor); // Continue while there is a cursor

  return slackChannels;
};

export const triggerSlackNotification = async ({
  projectId,
  payloadBlocks,
  payloadMessage,
  projectSlackConfigDAL,
  projectDAL,
  kmsService,
  feature
}: {
  projectId: string;
  payloadBlocks: Block[];
  payloadMessage: string;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  feature: SlackTriggerFeature;
}) => {
  const project = await projectDAL.findById(projectId);
  const slackIntegration = await projectSlackConfigDAL.getIntegrationDetailsByProject(project.id);

  if (!slackIntegration) {
    return;
  }

  let targetChannelIds: string[] = [];
  if (feature === SlackTriggerFeature.ACCESS_REQUEST) {
    targetChannelIds = slackIntegration.accessRequestChannels?.split(", ") || [];
    if (!targetChannelIds.length || !slackIntegration.isAccessRequestNotificationEnabled) {
      return;
    }
  } else if (feature === SlackTriggerFeature.SECRET_APPROVAL) {
    targetChannelIds = slackIntegration.secretRequestChannels?.split(", ") || [];
    if (!targetChannelIds.length || !slackIntegration.isSecretRequestNotificationEnabled) {
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

  const slackWebClient = new WebClient(botKey);

  for await (const conversationId of targetChannelIds) {
    // we send both text and blocks for compatibility with barebone clients
    await slackWebClient.chat
      .postMessage({
        channel: conversationId,
        text: payloadMessage,
        blocks: payloadBlocks
      })
      .catch((err) => void logger.error(err));
  }
};
