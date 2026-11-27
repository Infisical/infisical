/* eslint-disable class-methods-use-this */
import { ExternalSystemError } from "@app/domains/lib/errors";

import { MicrosoftTeamsTokenKind } from "../models/microsoft-teams-installation";
import {
  TChatPostRefusal,
  TIssuedToken,
  TMicrosoftTeamsAppCredentials,
  TMicrosoftTeamsClient,
  TMicrosoftTeamsTeam,
  TTenantConsentOutcome
} from "../services/dependencies";

// Tokens carry the tenant they were issued for: `<kind>-token-<tenantId>-<n>`.
const tenantOfToken = (token: string) => /^[a-z-]+-token-(.+)-\d+$/.exec(token)?.[1] ?? null;

export class FakeMicrosoftTeamsClient implements TMicrosoftTeamsClient {
  // The app catalog entry per tenant; null (or a missing tenant) means the bot is not installed.
  readonly tenants = new Map<string, { installedAppId: string | null }>();

  readonly teamsByTenant = new Map<string, TMicrosoftTeamsTeam[]>();

  readonly consentOutcomes = new Map<string, TTenantConsentOutcome>();

  readonly issued: { tenantId: string; kind: MicrosoftTeamsTokenKind }[] = [];

  readonly sent: { botToken: string; teamId: string; channelId: string; adaptiveCard: Record<string, unknown> }[] = [];

  failTokens = false;

  tokenLifetimeMs = 60 * 60 * 1000;

  private readonly refusals = new Map<string, TChatPostRefusal>();

  private tokenCounter = 0;

  refuse = (channelId: string, refusal: TChatPostRefusal) => {
    this.refusals.set(channelId, refusal);
  };

  verifyTenantConsent = async (input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    code: string;
    redirectUri: string;
  }): Promise<TTenantConsentOutcome> => this.consentOutcomes.get(input.tenantId) ?? { verified: true };

  issueToken = async (input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    kind: MicrosoftTeamsTokenKind;
  }): Promise<TIssuedToken> => {
    if (this.failTokens) {
      throw new ExternalSystemError({
        message: "Microsoft did not issue an access token for the Microsoft Teams integration."
      });
    }
    this.issued.push({ tenantId: input.tenantId, kind: input.kind });
    this.tokenCounter += 1;
    return {
      accessToken: `${input.kind}-token-${input.tenantId}-${this.tokenCounter}`,
      expiresAt: new Date(Date.now() + this.tokenLifetimeMs)
    };
  };

  findInstalledApp = async (input: { graphToken: string; botId: string }) => {
    const tenantId = tenantOfToken(input.graphToken);
    const installedAppId = tenantId ? this.tenants.get(tenantId)?.installedAppId : null;
    return installedAppId ? { internalAppId: installedAppId } : null;
  };

  listTeamsWithChannels = async (input: { graphToken: string; internalAppId: string }) => {
    const tenantId = tenantOfToken(input.graphToken);
    if (!tenantId || this.tenants.get(tenantId)?.installedAppId !== input.internalAppId) return [];
    return this.teamsByTenant.get(tenantId) ?? [];
  };

  sendChannelCard = async (input: {
    botToken: string;
    teamId: string;
    channelId: string;
    adaptiveCard: Record<string, unknown>;
  }) => {
    this.sent.push(input);
    return this.refusals.get(input.channelId) ?? null;
  };
}
