import { WebClient } from "@slack/web-api";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectSlackConfigDALFactory } from "./project-slack-config-dal";
import { SlackTriggerFeature, TSlackNotification } from "./slack-types";

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

const buildSlackPayload = (notification: TSlackNotification) => {
  const appCfg = getConfig();

  switch (notification.type) {
    case SlackTriggerFeature.SECRET_APPROVAL: {
      const { payload } = notification;
      const messageBody = `A secret approval request has been opened by ${payload.userEmail}.
*Environment*: ${payload.environment}
*Secret path*: ${payload.secretPath || "/"}

View the complete details <${appCfg.SITE_URL}/project/${payload.projectId}/approval?requestId=${
        payload.requestId
      }|here>.`;

      const payloadBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Secret approval request",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: messageBody
          }
        }
      ];

      return {
        payloadMessage: messageBody,
        payloadBlocks
      };
    }
    case SlackTriggerFeature.ACCESS_REQUEST: {
      const { payload } = notification;
      const messageBody = `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${
        payload.isTemporary ? "temporary" : "permanent"
      } access to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.
      
The following permissions are requested: ${payload.permissions.join(", ")}

View the request and approve or deny it <${payload.approvalUrl}|here>.`;

      const payloadBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "New access approval request pending for review",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: messageBody
          }
        }
      ];

      return {
        payloadMessage: messageBody,
        payloadBlocks
      };
    }
    default: {
      throw new BadRequestError({
        message: "Slack notification type not supported."
      });
    }
  }
};

export const triggerSlackNotification = async ({
  projectId,
  notification,
  projectSlackConfigDAL,
  projectDAL,
  kmsService
}: {
  projectId: string;
  notification: TSlackNotification;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { payloadMessage, payloadBlocks } = buildSlackPayload(notification);
  const project = await projectDAL.findById(projectId);
  const slackIntegration = await projectSlackConfigDAL.getIntegrationDetailsByProject(project.id);

  if (!slackIntegration) {
    return;
  }

  let targetChannelIds: string[] = [];
  if (notification.type === SlackTriggerFeature.ACCESS_REQUEST) {
    targetChannelIds = slackIntegration.accessRequestChannels?.split(", ") || [];
    if (!targetChannelIds.length || !slackIntegration.isAccessRequestNotificationEnabled) {
      return;
    }
  } else if (notification.type === SlackTriggerFeature.SECRET_APPROVAL) {
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
      .catch((err) => logger.error(err));
  }
};
