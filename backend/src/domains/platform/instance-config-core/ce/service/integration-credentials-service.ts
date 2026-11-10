import { ServerConfigCache } from "../data-access/server-config-cache";
import { InstanceConfig } from "../model/instance-config";
import {
  TInstanceConfigEnv,
  TIntegrationCredentials,
  TMicrosoftTeamsCredentials,
  TRootKeyCipher
} from "./instance-config-types";
import { IntegrationCredentialsHolder } from "./integration-credentials-holder";

export type TIntegrationCredentialsServiceDeps = {
  cache: ServerConfigCache;
  credentials: IntegrationCredentialsHolder;
  kmsCoreDomain: TRootKeyCipher;
  env: TInstanceConfigEnv;
};

// The instance's Slack, Teams and GitHub app credentials, decrypted. Reads the shared cached row, so an update on
// another pod shows up within the cache TTL; decrypts again only when the row's updatedAt changed.
export class IntegrationCredentialsService {
  constructor(private readonly deps: TIntegrationCredentialsServiceDeps) {}

  async getIntegrationCredentials(): Promise<TIntegrationCredentials> {
    const { credentials } = await this.current();
    return credentials;
  }

  // The stored credentials, or WORKFLOW_SLACK_CLIENT_ID and WORKFLOW_SLACK_CLIENT_SECRET when none are stored.
  async getSlackCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const { credentials } = await this.current();
    const envCfg = this.deps.env.getConfig();
    return {
      clientId: credentials.slack.clientId || envCfg.WORKFLOW_SLACK_CLIENT_ID || "",
      clientSecret: credentials.slack.clientSecret || envCfg.WORKFLOW_SLACK_CLIENT_SECRET || ""
    };
  }

  async getMicrosoftTeamsCredentials(): Promise<TMicrosoftTeamsCredentials> {
    const { credentials, updatedAt } = await this.current();
    return { ...credentials.microsoftTeams, updatedAt };
  }

  private async current(): Promise<{ credentials: TIntegrationCredentials; updatedAt: Date }> {
    const config = await this.deps.cache.get();
    const held = this.deps.credentials.get(config.updatedAt);
    if (held) return { credentials: held, updatedAt: config.updatedAt };

    const credentials = this.decrypt(config);
    this.deps.credentials.set(credentials, config.updatedAt);
    return { credentials, updatedAt: config.updatedAt };
  }

  private decrypt(config: InstanceConfig): TIntegrationCredentials {
    const decrypt = this.deps.kmsCoreDomain.decryptWithRootKey();
    const read = (column: Parameters<InstanceConfig["encrypted"]>[0]) => {
      const cipherText = config.encrypted(column);
      return cipherText ? decrypt(cipherText).toString() : "";
    };
    return {
      slack: { clientId: read("encryptedSlackClientId"), clientSecret: read("encryptedSlackClientSecret") },
      microsoftTeams: {
        appId: read("encryptedMicrosoftTeamsAppId"),
        clientSecret: read("encryptedMicrosoftTeamsClientSecret"),
        botId: read("encryptedMicrosoftTeamsBotId")
      },
      gitHubAppConnection: {
        clientId: read("encryptedGitHubAppConnectionClientId"),
        clientSecret: read("encryptedGitHubAppConnectionClientSecret"),
        appSlug: read("encryptedGitHubAppConnectionSlug"),
        appId: read("encryptedGitHubAppConnectionId"),
        privateKey: read("encryptedGitHubAppConnectionPrivateKey")
      }
    };
  }
}
