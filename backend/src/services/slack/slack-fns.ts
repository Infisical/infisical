import { WebClient } from "@slack/web-api";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TNotification, TriggerFeature } from "@app/lib/workflow-integrations/types";

import { KmsDataKey } from "../kms/kms-types";
import { TSendSlackNotificationDTO } from "./slack-types";

const COMPANY_BRAND_COLOR = "#e0ed34";
const ERROR_COLOR = "#e74c3c";

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

const buildSlackPayload = (notification: TNotification) => {
  const appCfg = getConfig();

  switch (notification.type) {
    case TriggerFeature.SECRET_APPROVAL: {
      const { payload } = notification;
      const messageBody = `A secret approval request has been opened by ${payload.userEmail}.
*Environment*: ${payload.environment}
*Secret path*: ${payload.secretPath || "/"}
*Secret Key${payload.secretKeys.length > 1 ? "s" : ""}*: ${payload.secretKeys.join(", ")}

View the complete details <${appCfg.SITE_URL}/projects/secret-management/${payload.projectId}/approval?requestId=${
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
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.ACCESS_REQUEST: {
      const { payload } = notification;
      const messageBody = `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${
        payload.isTemporary ? "temporary" : "permanent"
      } access to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.
      
The following permissions are requested: ${payload.permissions.join(", ")}

View the request and approve or deny it <${payload.approvalUrl}|here>.${
        payload.note
          ? `
User Note: ${payload.note}`
          : ""
      }`;

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
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.ACCESS_REQUEST_UPDATED: {
      const { payload } = notification;
      const messageBody = `${payload.editorFullName} (${payload.editorEmail}) has updated the ${
        payload.isTemporary ? "temporary" : "permanent"
      } access request from ${payload.requesterFullName} (${payload.requesterEmail}) to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.
      
The following permissions are requested: ${payload.permissions.join(", ")}

View the request and approve or deny it <${payload.approvalUrl}|here>.${
        payload.editNote
          ? `
Editor Note: ${payload.editNote}`
          : ""
      }`;

      const payloadBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Updated access approval request pending for review",
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
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.SECRET_SYNC_ERROR: {
      const { payload } = notification;
      const messageBody = `${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}

Sync Error: ${payload.failureMessage}`;

      const payloadBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}`,
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Sync Error:* ${payload.failureMessage}`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: `Open ${payload.syncName}`,
                emoji: true
              },
              url: payload.syncUrl
            }
          ]
        }
      ];

      return {
        payloadMessage: messageBody,
        payloadBlocks,
        color: ERROR_COLOR
      };
    }
    default: {
      throw new BadRequestError({
        message: "Slack notification type not supported."
      });
    }
  }
};

export const sendSlackNotification = async ({
  orgId,
  notification,
  kmsService,
  targetChannelIds,
  slackIntegration
}: TSendSlackNotificationDTO) => {
  const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });
  const botKey = orgDataKeyDecryptor({
    cipherTextBlob: slackIntegration.encryptedBotAccessToken
  }).toString("utf8");
  const slackWebClient = new WebClient(botKey);

  const { payloadMessage, payloadBlocks, color } = buildSlackPayload(notification);

  for await (const conversationId of targetChannelIds) {
    // we send both text and blocks for compatibility with barebone clients
    await slackWebClient.chat
      .postMessage({
        channel: conversationId,
        text: payloadMessage,
        attachments: [
          {
            color,
            blocks: payloadBlocks
          }
        ]
      })
      .catch((err) => logger.error(err));
  }
};
