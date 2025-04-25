/* eslint-disable class-methods-use-this */
import axios from "axios";
import { TeamsActivityHandler, TurnContext } from "botbuilder";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TNotification, TriggerFeature } from "@app/lib/workflow-integrations/types";

import { TWorkflowIntegrationDALFactory } from "../workflow-integration/workflow-integration-dal";
import { WorkflowIntegrationStatus } from "../workflow-integration/workflow-integration-types";
import { TMicrosoftTeamsIntegrationDALFactory } from "./microsoft-teams-integration-dal";

export const getMicrosoftTeamsAccessToken = async ({
  tenantId,
  clientId,
  clientSecret,
  getBotFrameworkToken = false
}: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  getBotFrameworkToken?: boolean;
}) => {
  const details = getBotFrameworkToken
    ? {
        uri: "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
        scope: "https://api.botframework.com/.default"
      }
    : {
        uri: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        scope: "https://graph.microsoft.com/.default"
      };

  const tokenResponse = await axios.post<{ access_token: string }>(
    details.uri,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: details.scope,
      grant_type: "client_credentials"
    })
  );

  return tokenResponse.data.access_token;
};

export const isBotInstalledInTenant = async ({
  tenantId,
  botAppId,
  botAppPassword,
  botId
}: {
  tenantId: string;
  botAppId: string;
  botAppPassword: string;
  botId: string;
}) => {
  try {
    const botAccessToken = await getMicrosoftTeamsAccessToken({
      tenantId,
      clientId: botAppId.toString(),
      clientSecret: botAppPassword.toString(),
      getBotFrameworkToken: true
    }).catch(() => null);

    const accessToken = await getMicrosoftTeamsAccessToken({
      tenantId,
      clientId: botAppId.toString(),
      clientSecret: botAppPassword.toString()
    }).catch(() => null);

    if (!botAccessToken || !accessToken) {
      return {
        accessToken: null,
        botAccessToken: null,
        installed: false,
        internalId: null
      } as const;
    }

    const appsResponse = await axios
      .get<{ value: { id: string; displayName: string; distributionMethod: string; externalId: string }[] }>(
        "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      )
      .catch((error) => {
        logger.error(error, "Error fetching installed apps");
        return null;
      });

    if (!appsResponse) {
      return {
        installed: false,
        internalId: null,
        accessToken,
        botAccessToken
      } as const;
    }

    const botInstalledInTenant = appsResponse.data.value.find((a) => a.externalId === botId);

    if (!botInstalledInTenant) {
      return {
        installed: false,
        internalId: null,
        accessToken,
        botAccessToken
      } as const;
    }

    return {
      installed: true,
      internalId: botInstalledInTenant.id,
      accessToken,
      botAccessToken
    } as const;
  } catch (error) {
    logger.error(error, "Error fetching installed apps");
    return {
      installed: false,
      internalId: null,
      accessToken: null,
      botAccessToken: null
    } as const;
  }
};

export const buildTeamsPayload = (notification: TNotification) => {
  const appCfg = getConfig();

  switch (notification.type) {
    case TriggerFeature.SECRET_APPROVAL: {
      const { payload } = notification;

      const adaptiveCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [
          {
            type: "TextBlock",
            text: "Secret approval request",
            weight: "Bolder",
            size: "Large"
          },
          {
            type: "TextBlock",
            text: `A secret approval request has been opened by ${payload.userEmail}.`,
            wrap: true
          },
          {
            type: "FactSet",
            facts: [
              {
                title: "Environment",
                value: payload.environment
              },
              {
                title: "Secret path",
                value: payload.secretPath || "/"
              },
              {
                title: `Secret Key${payload.secretKeys.length > 1 ? "s" : ""}`,
                value: payload.secretKeys.join(", ")
              }
            ]
          }
        ],
        actions: [
          {
            type: "Action.OpenUrl",
            title: "View request in Infisical",
            url: `${appCfg.SITE_URL}/secret-manager/${payload.projectId}/approval?requestId=${payload.requestId}`
          }
        ]
      };

      return {
        adaptiveCard
      };
    }

    case TriggerFeature.ACCESS_REQUEST: {
      const { payload } = notification;

      const adaptiveCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [
          {
            type: "TextBlock",
            text: "New access approval request pending for review",
            weight: "Bolder",
            size: "Large"
          },
          {
            type: "TextBlock",
            text: `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${
              payload.isTemporary ? "temporary" : "permanent"
            } access to path '${payload.secretPath}' in the ${payload.environment} environment of ${
              payload.projectName
            } project.`,
            wrap: true
          },
          {
            type: "TextBlock",
            text: `The following permissions are requested: ${payload.permissions.join(", ")}`,
            wrap: true
          },
          payload.note
            ? {
                type: "TextBlock",
                text: `**User Note**: ${payload.note}`,
                wrap: true
              }
            : null
        ].filter(Boolean),
        actions: [
          {
            type: "Action.OpenUrl",
            title: "View request in Infisical",
            url: payload.approvalUrl
          }
        ]
      };

      return {
        adaptiveCard
      };
    }

    default: {
      throw new BadRequestError({
        message: "Teams notification type not supported."
      });
    }
  }
};

export class TeamsBot extends TeamsActivityHandler {
  private botAppId: string;

  private botAppPassword: string;

  private workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "update">;

  private microsoftTeamsIntegrationDAL: Pick<TMicrosoftTeamsIntegrationDALFactory, "findOne">;

  constructor({
    botAppId,
    botAppPassword,
    workflowIntegrationDAL,
    microsoftTeamsIntegrationDAL
  }: {
    botAppId: string;
    botAppPassword: string;
    workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "update">;
    microsoftTeamsIntegrationDAL: Pick<TMicrosoftTeamsIntegrationDALFactory, "findOne">;
  }) {
    super();

    this.botAppId = botAppId;
    this.botAppPassword = botAppPassword;
    this.workflowIntegrationDAL = workflowIntegrationDAL;
    this.microsoftTeamsIntegrationDAL = microsoftTeamsIntegrationDAL;

    // We know when a bot is added, but we can't know when it's fully removed from the tenant.
    this.onTeamsMembersAddedEvent(async (membersAdded, _, context) => {
      const botWasAdded = membersAdded.some((member) => member.id === context.activity.recipient.id);

      if (botWasAdded && context.activity.conversation.tenantId) {
        const microsoftTeamIntegration = await this.microsoftTeamsIntegrationDAL.findOne({
          tenantId: context.activity.conversation.tenantId
        });

        await this.workflowIntegrationDAL
          .update(
            {
              id: microsoftTeamIntegration.id,
              status: WorkflowIntegrationStatus.PENDING
            },
            {
              status: WorkflowIntegrationStatus.INSTALLED
            }
          )
          .catch((error) => {
            logger.error(error, "Microsoft Teams Workflow Integration: Failed to update workflow integration");
          });

        // This is required in order for the bot to send proactive messages, which is required for the bot to pass the bot release validation step.
        await context.sendActivity(
          "👋 Thanks for installing the Infisical app! You can now use the bot to send notifications to your selected teams."
        );
      }
    });
  }

  async run(context: TurnContext) {
    console.log("Running Microsoft Teams bot", {
      context
    });
    await super.run(context);
  }

  async sendMessageToChannel(tenantId: string, channelId: string, teamId: string, notification: TNotification) {
    const { adaptiveCard } = buildTeamsPayload(notification);

    const botToken = await getMicrosoftTeamsAccessToken({
      tenantId,
      clientId: this.botAppId,
      clientSecret: this.botAppPassword,
      getBotFrameworkToken: true
    });

    const adaptiveCardActivity = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: adaptiveCard
        }
      ],
      conversation: {
        id: channelId,
        isGroup: true
      },
      channelData: {
        channel: {
          id: channelId
        },
        team: {
          id: teamId
        }
      }
    };

    await axios.post(
      `https://smba.trafficmanager.net/amer/v3/conversations/${channelId}/activities`,
      adaptiveCardActivity,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  }

  // todo: filter out teams that the bot is not a member of
  async getTeamsAndChannels(tenantId: string, internalAppId: string) {
    try {
      const token = await getMicrosoftTeamsAccessToken({
        tenantId,
        clientId: this.botAppId,
        clientSecret: this.botAppPassword
      });

      const teamsResponse = await axios
        .get<{ value: { displayName: string; id: string }[] }>(`https://graph.microsoft.com/v1.0/teams`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        .catch((error) => {
          logger.error(error, "Microsoft Teams Workflow Integration: Failed to fetch teams");
          throw error;
        });

      const teams = teamsResponse.data.value;
      const result = [];

      for await (const team of teams) {
        try {
          // Get installed apps for this team
          const installedAppsResponse = await axios.get<{ value: { teamsAppDefinition: { teamsAppId: string } }[] }>(
            `https://graph.microsoft.com/v1.0/teams/${team.id}/installedApps?$expand=teamsAppDefinition`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );

          if (!installedAppsResponse.data.value.some((app) => app.teamsAppDefinition.teamsAppId === internalAppId)) {
            // eslint-disable-next-line no-continue
            continue;
          }
        } catch (error) {
          // eslint-disable-next-line no-continue
          continue; // skip this team if we can't determine if the bot is installed
        }

        const channelsResponse = await axios
          .get<{ value: { displayName: string; id: string }[] }>(
            `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )
          .catch((error) => {
            logger.error(error, "Microsoft Teams Workflow Integration: Failed to fetch channels");
            throw error;
          });

        const channels = channelsResponse.data.value.map((channel) => ({
          channelName: channel.displayName,
          channelId: channel.id
        }));

        result.push({
          teamId: team.id,
          teamName: team.displayName,
          channels
        });
      }

      return result;
    } catch (error) {
      logger.error(error, "Microsoft Teams Workflow Integration: Error fetching teams and channels");
      throw error;
    }
  }
}

export const MicrosoftTeamsChannelsSchema = z
  .object({
    teamId: z.string(),
    channelIds: z.array(z.string()).min(1)
  })
  .optional()
  .refine((data) => data === undefined || data?.channelIds.length <= 5, {
    message: "You can only select up to 5 microsoft teams channels"
  });
