/* eslint-disable class-methods-use-this */
import { isAxiosError } from "axios";

import { ExternalSystemError } from "@app/domains/lib/errors";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";

import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import {
  TChatPostRefusal,
  TIssuedToken,
  TMicrosoftTeamsAppCredentials,
  TMicrosoftTeamsClient,
  TMicrosoftTeamsTeam,
  TTenantConsentOutcome
} from "../../services/dependencies";
import { toTeamsPostRefusal } from "./errors";
import { checkTenantOfTokens, ConsentRequiredError } from "./tenant-consent";

const CONSENT_ERROR = "AADSTS65001";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

type TNamedItem = { displayName: string; id: string };
type TPage<T> = { value: T[]; "@odata.nextLink"?: string };

export class MicrosoftTeamsClient implements TMicrosoftTeamsClient {
  async verifyTenantConsent(input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    code: string;
    redirectUri: string;
  }): Promise<TTenantConsentOutcome> {
    const { credentials, tenantId, code, redirectUri } = input;

    const getAccessToken = async (params: URLSearchParams) => {
      const response = await request
        .post<{ access_token: string }>(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, params, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        })
        .catch((err) => {
          if (isAxiosError(err)) {
            if ((err.response?.data as { error_description?: string })?.error_description?.includes(CONSENT_ERROR)) {
              throw new ConsentRequiredError();
            }
            logger.error(err.response?.data, "Error fetching Microsoft Teams access token");
          }
          throw err;
        });

      return response.data.access_token;
    };

    try {
      const applicationAccessToken = await getAccessToken(
        new URLSearchParams({
          client_id: credentials.appId,
          client_secret: credentials.clientSecret,
          scope: GRAPH_SCOPE,
          redirect_uri: redirectUri,
          grant_type: "client_credentials"
        })
      );

      const authorizationAccessToken = await getAccessToken(
        new URLSearchParams({
          client_id: credentials.appId,
          client_secret: credentials.clientSecret,
          scope: GRAPH_SCOPE,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code
        })
      );

      const { tid: applicationTenantId } = crypto.jwt().decode(applicationAccessToken) as { tid: string };
      const { tid: authorizationTenantId } = crypto.jwt().decode(authorizationAccessToken) as { tid: string };

      return checkTenantOfTokens(tenantId, { applicationTenantId, authorizationTenantId });
    } catch (err) {
      if (err instanceof ConsentRequiredError) return { verified: false, reason: "consent-required" };
      throw new ExternalSystemError({
        message: "Could not verify the Microsoft Teams tenant with Microsoft. Try again in a few minutes.",
        cause: err
      });
    }
  }

  async issueToken(input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    kind: MicrosoftTeamsTokenKind;
  }): Promise<TIssuedToken> {
    const target =
      input.kind === MicrosoftTeamsTokenKind.BotFramework
        ? {
            uri: "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
            scope: "https://api.botframework.com/.default"
          }
        : {
            uri: `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`,
            scope: GRAPH_SCOPE
          };

    try {
      const response = await request.post<{ access_token: string; expires_in: number }>(
        target.uri,
        new URLSearchParams({
          client_id: input.credentials.appId,
          client_secret: input.credentials.clientSecret,
          scope: target.scope,
          grant_type: "client_credentials"
        })
      );

      return {
        accessToken: response.data.access_token,
        expiresAt: new Date(Date.now() + response.data.expires_in * 1000)
      };
    } catch (err) {
      if (isAxiosError(err)) {
        logger.error(
          err.response?.data,
          `MicrosoftTeamsClient.issueToken: Error fetching Microsoft Teams access token [status-code=${err.response?.status}]`
        );
      } else {
        logger.error(err, "MicrosoftTeamsClient.issueToken: Error fetching Microsoft Teams access token");
      }
      throw new ExternalSystemError({
        message: "Microsoft did not issue an access token for the Microsoft Teams integration.",
        cause: err
      });
    }
  }

  async findInstalledApp(input: { graphToken: string; botId: string }) {
    try {
      const response = await request.get<{ value: { id: string; externalId: string }[] }>(
        "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps",
        { headers: { Authorization: `Bearer ${input.graphToken}` } }
      );

      const app = response.data.value.find((a) => a.externalId === input.botId);
      return app ? { internalAppId: app.id } : null;
    } catch (err) {
      logger.error(err, "Error fetching installed apps");
      return null;
    }
  }

  async listTeamsWithChannels(input: { graphToken: string; internalAppId: string }): Promise<TMicrosoftTeamsTeam[]> {
    const headers = { Authorization: `Bearer ${input.graphToken}` };

    const listAll = async (firstUrl: string, failureLog: string) => {
      const items: TNamedItem[] = [];
      let next = firstUrl;
      while (next.length) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const response = await request.get<TPage<TNamedItem>>(next, { headers });
          items.push(...response.data.value);
          next = response.data["@odata.nextLink"] || "";
        } catch (err) {
          logger.error(isAxiosError(err) ? err.response?.data : err, failureLog);
          throw err;
        }
      }
      return items;
    };

    try {
      const teams = await listAll(
        "https://graph.microsoft.com/v1.0/teams",
        "Microsoft Teams Workflow Integration: Failed to fetch teams"
      );

      const result: TMicrosoftTeamsTeam[] = [];

      for await (const team of teams) {
        try {
          const installedApps = await request.get<{ value: { teamsAppDefinition: { teamsAppId: string } }[] }>(
            `https://graph.microsoft.com/v1.0/teams/${team.id}/installedApps?$expand=teamsAppDefinition`,
            { headers }
          );

          if (!installedApps.data.value.some((app) => app.teamsAppDefinition.teamsAppId === input.internalAppId)) {
            // eslint-disable-next-line no-continue
            continue;
          }
        } catch {
          // Skip a team when we cannot tell whether the bot is installed in it.
          // eslint-disable-next-line no-continue
          continue;
        }

        const channels = await listAll(
          `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
          "getTeamsAndChannels: Microsoft Teams Workflow Integration: Failed to fetch channels"
        );

        result.push({
          teamId: team.id,
          teamName: team.displayName,
          channels: channels.map((channel) => ({ channelName: channel.displayName, channelId: channel.id }))
        });
      }

      return result;
    } catch (err) {
      throw new ExternalSystemError({
        message: "Could not list the teams and channels from Microsoft Teams. Try again in a few minutes.",
        cause: err
      });
    }
  }

  async sendChannelCard(input: {
    botToken: string;
    teamId: string;
    channelId: string;
    adaptiveCard: Record<string, unknown>;
  }): Promise<TChatPostRefusal | null> {
    const activity = {
      type: "message",
      attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: input.adaptiveCard }],
      conversation: { id: input.channelId, isGroup: true },
      channelData: { channel: { id: input.channelId }, team: { id: input.teamId } }
    };

    try {
      await request.post(
        `https://smba.trafficmanager.net/amer/v3/conversations/${input.channelId}/activities`,
        activity,
        {
          headers: { Authorization: `Bearer ${input.botToken}`, "Content-Type": "application/json" }
        }
      );
      return null;
    } catch (err) {
      logger.error(
        isAxiosError(err) ? err.response?.data : err,
        `MicrosoftTeamsClient.sendChannelCard: Failed to send message to channel [channelId=${input.channelId}] [teamId=${input.teamId}]`
      );
      return toTeamsPostRefusal(err);
    }
  }
}
