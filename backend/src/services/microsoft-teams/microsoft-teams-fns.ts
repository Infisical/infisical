/* eslint-disable class-methods-use-this */
import axios from "axios";
import { TeamsActivityHandler, TurnContext } from "botbuilder";
import { Knex } from "knex";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TNotification, TriggerFeature } from "@app/lib/workflow-integrations/types";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TWorkflowIntegrationDALFactory } from "../workflow-integration/workflow-integration-dal";
import { WorkflowIntegrationStatus } from "../workflow-integration/workflow-integration-types";
import { TMicrosoftTeamsIntegrationDALFactory } from "./microsoft-teams-integration-dal";

const ConsentError = "AADSTS65001";

export const verifyTenantFromCode = async (
  tenantId: string,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) => {
  const getAccessToken = async (params: URLSearchParams) => {
    const response = await axios
      .post<{ access_token: string }>(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      })
      .catch((err) => {
        if (axios.isAxiosError(err)) {
          if ((err.response?.data as { error_description?: string })?.error_description?.includes(ConsentError)) {
            throw new BadRequestError({
              message: "Unable to verify tenant, please ensure that you have granted admin consent."
            });
          }
          logger.error(err.response?.data, "Error fetching Microsoft Teams access token");
        }
        throw err;
      });

    return response.data.access_token;
  };

  // Azure App-based auth
  const applicationAccessToken = await getAccessToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      redirect_uri: redirectUri,
      grant_type: "client_credentials"
    })
  );

  // User-based auth
  const authorizationAccessToken = await getAccessToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code
    })
  );

  // Verify application token
  const { tid: tenantIdFromApplicationAccessToken } = crypto.jwt().decode(applicationAccessToken) as { tid: string };

  if (tenantIdFromApplicationAccessToken !== tenantId) {
    throw new BadRequestError({
      message: `Invalid application token tenant ID. Expected ${tenantId}, got ${tenantIdFromApplicationAccessToken}`
    });
  }

  // Verify user authorization token
  const { tid: tenantIdFromAuthorizationAccessToken } = crypto.jwt().decode(authorizationAccessToken) as {
    tid: string;
  };

  if (tenantIdFromAuthorizationAccessToken !== tenantId) {
    throw new BadRequestError({
      message: `Invalid authorization token tenant ID. Expected ${tenantId}, got ${tenantIdFromAuthorizationAccessToken}`
    });
  }
};

export const getMicrosoftTeamsAccessToken = async (
  {
    orgId,
    microsoftTeamsIntegrationId,
    tenantId,
    clientId,
    clientSecret,
    kmsService,
    microsoftTeamsIntegrationDAL,
    getBotFrameworkToken
  }: {
    microsoftTeamsIntegrationId: string;
    orgId: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    microsoftTeamsIntegrationDAL: Pick<TMicrosoftTeamsIntegrationDALFactory, "findOne" | "update">;
    getBotFrameworkToken?: boolean;
  },
  tx?: Knex
) => {
  try {
    const details = getBotFrameworkToken
      ? {
          uri: "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
          scope: "https://api.botframework.com/.default"
        }
      : {
          uri: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          scope: "https://graph.microsoft.com/.default"
        };

    const integration = await microsoftTeamsIntegrationDAL.findOne(
      {
        id: microsoftTeamsIntegrationId
      },
      tx
    );

    if (!integration) {
      throw new BadRequestError({ message: "Microsoft Teams integration not found" });
    }

    if (getBotFrameworkToken) {
      // If the token expires within the next 5 minutes, we'll get a new token instead of using the stored one.
      const currentTime = new Date(new Date().getTime() + 5 * 60 * 1000);

      if (
        integration.encryptedBotAccessToken &&
        integration.botAccessTokenExpiresAt &&
        integration.botAccessTokenExpiresAt > currentTime
      ) {
        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          orgId,
          type: KmsDataKey.Organization
        });

        const botAccessToken = decryptor({
          cipherTextBlob: integration.encryptedBotAccessToken
        });

        return botAccessToken.toString();
      }
    } else {
      // If the token expires within the next 5 minutes, we'll get a new token instead of using the stored one.
      const currentTime = new Date(new Date().getTime() + 5 * 60 * 1000);

      if (
        integration.encryptedAccessToken &&
        integration.accessTokenExpiresAt &&
        integration.accessTokenExpiresAt > currentTime
      ) {
        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          orgId,
          type: KmsDataKey.Organization
        });

        const accessToken = decryptor({
          cipherTextBlob: integration.encryptedAccessToken
        });

        return accessToken.toString();
      }
    }

    const tokenResponse = await axios.post<{ access_token: string; expires_in: number }>(
      details.uri,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: details.scope,
        grant_type: "client_credentials"
      })
    );

    if (getBotFrameworkToken) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        orgId,
        type: KmsDataKey.Organization
      });

      const { cipherTextBlob: encryptedBotAccessToken } = encryptor({
        plainText: Buffer.from(tokenResponse.data.access_token)
      });

      const expiresAt = new Date(new Date().getTime() + tokenResponse.data.expires_in * 1000);

      await microsoftTeamsIntegrationDAL.update(
        {
          id: microsoftTeamsIntegrationId
        },
        {
          botAccessTokenExpiresAt: expiresAt,
          encryptedBotAccessToken
        },
        tx
      );
    } else {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        orgId,
        type: KmsDataKey.Organization
      });

      const { cipherTextBlob: encryptedAccessToken } = encryptor({
        plainText: Buffer.from(tokenResponse.data.access_token)
      });

      const expiresAt = new Date(new Date().getTime() + tokenResponse.data.expires_in * 1000);

      await microsoftTeamsIntegrationDAL.update(
        {
          id: microsoftTeamsIntegrationId
        },
        {
          accessTokenExpiresAt: expiresAt,
          encryptedAccessToken
        },
        tx
      );
    }

    return tokenResponse.data.access_token;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        error.response?.data,
        `getMicrosoftTeamsAccessToken: Error fetching Microsoft Teams access token [status-code=${error.response?.status}]`
      );
    } else {
      logger.error(error, "getMicrosoftTeamsAccessToken: Error fetching Microsoft Teams access token");
    }
    throw error;
  }
};

export const isBotInstalledInTenant = async (
  {
    tenantId,
    botAppId,
    botAppPassword,
    botId,
    orgId,
    kmsService,
    microsoftTeamsIntegrationDAL,
    microsoftTeamsIntegrationId
  }: {
    tenantId: string;
    botAppId: string;
    botAppPassword: string;
    botId: string;
    orgId: string;
    kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    microsoftTeamsIntegrationDAL: Pick<TMicrosoftTeamsIntegrationDALFactory, "findOne" | "update">;
    microsoftTeamsIntegrationId: string;
  },
  tx?: Knex
) => {
  try {
    const botAccessToken = await getMicrosoftTeamsAccessToken(
      {
        tenantId,
        clientId: botAppId.toString(),
        clientSecret: botAppPassword.toString(),
        getBotFrameworkToken: true,
        orgId,
        kmsService,
        microsoftTeamsIntegrationDAL,
        microsoftTeamsIntegrationId
      },
      tx
    ).catch(() => null);

    const accessToken = await getMicrosoftTeamsAccessToken(
      {
        orgId,
        tenantId,
        clientId: botAppId.toString(),
        clientSecret: botAppPassword.toString(),
        kmsService,
        microsoftTeamsIntegrationDAL,
        microsoftTeamsIntegrationId
      },
      tx
    ).catch(() => null);

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

export const buildTeamsPayload = (orgId: string, notification: TNotification) => {
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
            url: `${appCfg.SITE_URL}/organizations/${orgId}/projects/secret-management/${payload.projectId}/approval?requestId=${payload.requestId}`
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

    case TriggerFeature.ACCESS_REQUEST_UPDATED: {
      const { payload } = notification;

      const adaptiveCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [
          {
            type: "TextBlock",
            text: "Updated access approval request pending for review",
            weight: "Bolder",
            size: "Large"
          },
          {
            type: "TextBlock",
            text: `${payload.editorFullName} (${payload.editorEmail}) has updated the ${
              payload.isTemporary ? "temporary" : "permanent"
            } access request from ${payload.requesterFullName} (${payload.requesterEmail}) to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.`,
            wrap: true
          },
          {
            type: "TextBlock",
            text: `The following permissions are requested: ${payload.permissions.join(", ")}`,
            wrap: true
          },
          payload.editNote
            ? {
                type: "TextBlock",
                text: `**Editor Note**: ${payload.editNote}`,
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
        const microsoftTeamIntegration = await this.microsoftTeamsIntegrationDAL
          .findOne({
            tenantId: context.activity.conversation.tenantId
          })
          .catch(() => null);

        if (microsoftTeamIntegration) {
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
        }

        // This is required in order for the bot to send proactive messages, which is required for the bot to pass the bot release validation step.
        await context.sendActivity(
          "👋 Thanks for installing the Infisical app! You can now use the bot to send notifications to your selected teams."
        );
      }
    });
  }

  async run(context: TurnContext) {
    logger.info(context, "Processing Microsoft Teams context");
    await super.run(context);
  }

  async sendMessageToChannel(
    botAccessToken: string,
    tenantId: string,
    channelId: string,
    teamId: string,
    orgId: string,
    notification: TNotification
  ) {
    try {
      const { adaptiveCard } = buildTeamsPayload(orgId, notification);

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
            Authorization: `Bearer ${botAccessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          error.response?.data,
          `sendMessageToChannel: Axios Error, Microsoft Teams Workflow Integration: Failed to send message to channel [channelId=${channelId}] [teamId=${teamId}] [tenantId=${tenantId}]`
        );
      } else {
        logger.error(
          error,
          `sendMessageToChannel: Microsoft Teams Workflow Integration: Failed to send message to channel [channelId=${channelId}] [teamId=${teamId}] [tenantId=${tenantId}]`
        );
      }
      throw error;
    }
  }

  async getTeamsAndChannels(accessToken: string, internalAppId: string) {
    try {
      let teamsNextLink: string = "https://graph.microsoft.com/v1.0/teams";

      let allTeams: { displayName: string; id: string }[] = [];
      while (teamsNextLink?.length) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const response = await axios.get<{
            value: { displayName: string; id: string }[];
            "@odata.nextLink"?: string;
          }>(teamsNextLink, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });

          allTeams = allTeams.concat(response.data.value);
          teamsNextLink = response.data["@odata.nextLink"] || "";
        } catch (error) {
          logger.error(error, "Microsoft Teams Workflow Integration: Failed to fetch teams");
          throw error;
        }
      }

      const result = [];

      for await (const team of allTeams) {
        try {
          // Get installed apps for this team
          const installedAppsResponse = await axios.get<{ value: { teamsAppDefinition: { teamsAppId: string } }[] }>(
            `https://graph.microsoft.com/v1.0/teams/${team.id}/installedApps?$expand=teamsAppDefinition`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
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

        let allChannels: { displayName: string; id: string }[] = [];

        let channelNextLink: string = `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`;

        while (channelNextLink?.length) {
          // eslint-disable-next-line no-await-in-loop
          const resp = await axios
            .get<{
              value: { displayName: string; id: string }[];
              "@odata.nextLink"?: string;
            }>(channelNextLink, {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            })
            .catch((error) => {
              if (axios.isAxiosError(error)) {
                logger.error(
                  error.response?.data,
                  "getTeamsAndChannels: Axios error, Microsoft Teams Workflow Integration: Failed to fetch channels"
                );
              } else {
                logger.error(
                  error,
                  "getTeamsAndChannels: Microsoft Teams Workflow Integration: Failed to fetch channels"
                );
              }
              throw error;
            });

          allChannels = allChannels.concat(resp.data.value);
          channelNextLink = resp.data["@odata.nextLink"] || "";
        }

        const channels = allChannels.map((channel) => ({
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

export const validateMicrosoftTeamsChannelsSchema = z
  .object({
    teamId: z.string(),
    channelIds: z.array(z.string()).min(1)
  })
  .optional()
  .refine((data) => data === undefined || data?.channelIds.length <= 20, {
    message: "You can only select up to 20 Microsoft Teams channels"
  });
