import { Block, WebClient } from "@slack/web-api";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectSlackConfigDALFactory } from "./project-slack-config-dal";
import { SlackTriggerFeature } from "./slack-types";

export const getCustomSlackBotManifest = () => {
  const appCfg = getConfig();

  return {
    display_information: {
      name: "Infisical",
      description: "Get real-time Infisical updates in Slack",
      background_color: "#c2d62b",
      long_description: `This Slack application is designed specifically for use with your self-hosted Infisical instance, allowing seamless integration between your Infisical projects and your Slack workspace. With this integration, your team can stay up-to-date with the latest events, changes, and notifications directly inside Slack.
      - Notifications: Receive real-time updates and alerts about critical events in your Infisical projects. Whether it's a new project being created, updates to secrets, or changes to your team's configuration, you will be promptly notified within the designated Slack channels of your choice.
      - Customization: Tailor the notifications to your team's specific needs by configuring which types of events trigger alerts and in which channels they are sent.
      - Collaboration: Keep your entire team in the loop with notifications that help facilitate more efficient collaboration by ensuring that everyone is aware of important developments in your Infisical projects.
      
      By integrating Infisical with Slack, you can enhance your workflow by combining the power of secure secrets management with the communication capabilities of Slack.`
    },
    features: {
      app_home: {
        home_tab_enabled: false,
        messages_tab_enabled: false,
        messages_tab_read_only_enabled: true
      },
      bot_user: {
        display_name: "Infisical",
        always_online: true
      }
    },
    oauth_config: {
      redirect_urls: [`${appCfg.SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect`],
      scopes: {
        bot: ["chat:write.public", "chat:write", "channels:read", "groups:read", "im:read", "mpim:read"]
      }
    },
    settings: {
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false
    }
  };
};

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
