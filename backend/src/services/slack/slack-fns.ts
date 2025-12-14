import { WebClient, WebClientOptions } from "@slack/web-api";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TNotification, TriggerFeature } from "@app/lib/workflow-integrations/types";

import { KmsDataKey } from "../kms/kms-types";
import { TSendSlackNotificationDTO } from "./slack-types";

const COMPANY_BRAND_COLOR = "#e0ed34";
const ERROR_COLOR = "#e74c3c";

export const fetchSlackChannels = async (botKey: string) => {
  const appCfg = getConfig();
  const slackChannels: {
    name: string;
    id: string;
  }[] = [];

  const webClientOptions: WebClientOptions = {};

  if (appCfg.WORKFLOW_SLACK_GOV_ENABLED) {
    const govBaseUrl = appCfg.WORKFLOW_SLACK_GOV_BASE_URL;
    webClientOptions.slackApiUrl = `${govBaseUrl}/api`;
  }

  const slackWebClient = new WebClient(botKey, webClientOptions);
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
*Secret Key${payload.secretKeys.length > 1 ? "s" : ""}*: ${payload.secretKeys.join(", ")}`;

      const headerBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Secret approval request",
            emoji: true
          }
        }
      ];

      const payloadBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: messageBody
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View request",
                emoji: true
              },
              style: "primary",
              url: payload.approvalUrl
            }
          ]
        }
      ];

      return {
        headerBlocks,
        payloadMessage: messageBody,
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.ACCESS_REQUEST: {
      const { payload } = notification;
      const projectUrl = `${appCfg.SITE_URL}${payload.projectPath}/overview`;
      const accessType = payload.isTemporary ? "temporary" : "permanent";
      const permissionsFormatted = payload.permissions.map((p) => `*${p}*`).join(", ");

      const messageBody = `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${accessType} access to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.\n\nThe following permissions are requested: ${payload.permissions.join(", ")}${
        payload.note ? `\n\nUser note: ${payload.note}` : ""
      }`;

      const headerBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "New access approval request pending for review",
            emoji: true
          }
        }
      ];

      const payloadBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${payload.requesterFullName}* (${payload.requesterEmail}) has requested *${accessType}* access to *${payload.secretPath}* in the *${payload.environment}* environment of *<${projectUrl}|${payload.projectName}>*.\n\nThe following permissions are requested: ${permissionsFormatted}${
              payload.note ? `\n\n*User note:* ${payload.note}` : ""
            }`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View request",
                emoji: true
              },
              style: "primary",
              url: payload.approvalUrl
            }
          ]
        }
      ];

      return {
        headerBlocks,
        payloadMessage: messageBody,
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.ACCESS_REQUEST_UPDATED: {
      const { payload } = notification;
      const projectUrl = `${appCfg.SITE_URL}${payload.projectPath}/overview`;
      const accessType = payload.isTemporary ? "temporary" : "permanent";
      const permissionsFormatted = payload.permissions.map((p) => `*${p}*`).join(", ");

      const messageBody = `${payload.editorFullName} (${payload.editorEmail}) has updated the ${accessType} access request from ${payload.requesterFullName} (${payload.requesterEmail}) to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.\n\nThe following permissions are requested: ${payload.permissions.join(", ")}${
        payload.editNote ? `\n\nEditor Note: ${payload.editNote}` : ""
      }`;

      const headerBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Updated access approval request pending for review",
            emoji: true
          }
        }
      ];

      const payloadBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${payload.editorFullName}* (${payload.editorEmail}) has updated the *${accessType}* access request from *${payload.requesterFullName}* (${payload.requesterEmail}) to *${payload.secretPath}* in the *${payload.environment}* environment of *<${projectUrl}|${payload.projectName}>*.\n\nThe following permissions are requested: ${permissionsFormatted}${
              payload.editNote ? `\n\n*Editor Note:* ${payload.editNote}` : ""
            }`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View request",
                emoji: true
              },
              style: "primary",
              url: payload.approvalUrl
            }
          ]
        }
      ];

      return {
        headerBlocks,
        payloadMessage: messageBody,
        payloadBlocks,
        color: COMPANY_BRAND_COLOR
      };
    }
    case TriggerFeature.SECRET_SYNC_ERROR: {
      const { payload } = notification;
      const projectUrl = `${appCfg.SITE_URL}${payload.projectPath}`;
      const messageBody = `Secret sync ${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}\n\n\nEnvironment: ${payload.environment}\n\n\nSecret Path: ${payload.secretPath}\n\n\nProject: ${payload.projectName} (${projectUrl})\n\n\nReason:\n${payload.failureMessage}`;

      const headerBlocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Secret sync ${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}`,
            emoji: true
          }
        }
      ];

      const payloadBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Environment:* ${payload.environment}\n\n*Secret Path:* ${payload.secretPath}\n\n*Project:* <${projectUrl}|${payload.projectName}>\n\n*Reason:* ${payload.failureMessage}`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open secret sync",
                emoji: true
              },
              style: "primary",
              url: payload.syncUrl
            }
          ]
        }
      ];

      return {
        payloadMessage: messageBody,
        headerBlocks,
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
  const appCfg = getConfig();
  const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });
  const botKey = orgDataKeyDecryptor({
    cipherTextBlob: slackIntegration.encryptedBotAccessToken
  }).toString("utf8");

  const webClientOptions: WebClientOptions = {};

  if (appCfg.WORKFLOW_SLACK_GOV_ENABLED) {
    const govBaseUrl = appCfg.WORKFLOW_SLACK_GOV_BASE_URL;
    webClientOptions.slackApiUrl = `${govBaseUrl}/api`;
  }

  const slackWebClient = new WebClient(botKey, webClientOptions);

  const { payloadMessage, payloadBlocks, color, headerBlocks } = buildSlackPayload(notification);

  for await (const conversationId of targetChannelIds) {
    // we send both text and blocks for compatibility with barebone clients

    await slackWebClient.chat
      .postMessage({
        channel: conversationId,
        text: payloadMessage,
        blocks: headerBlocks,
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
