import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { ServerConfigCache } from "../data-access/server-config-cache";
import { IntegrationCredentials, TIntegrationCredentialsProps } from "../model/integration-credentials";
import { decryptCredentials, loadServerConfig } from "./instance-config-fns";
import { TInstanceConfigEnv, TMicrosoftTeamsCredentials, TRootKeyCipher } from "./instance-config-types";
import { IntegrationCredentialsHolder } from "./integration-credentials-holder";

export type TIntegrationCredentialsServiceDeps = {
  dataAccess: TInstanceConfigCoreDataAccess;
  cache: ServerConfigCache;
  credentials: IntegrationCredentialsHolder;
  kmsCoreDomain: TRootKeyCipher;
  env: TInstanceConfigEnv;
};

// The instance's Slack, Teams and GitHub app credentials, decrypted. Reads the shared cached row, so an update on
// another pod shows up within the cache TTL; decrypts again only when the row's updatedAt changed.
export class IntegrationCredentialsService {
  constructor(private readonly deps: TIntegrationCredentialsServiceDeps) {}

  async getIntegrationCredentials(): Promise<TIntegrationCredentialsProps> {
    const credentials = await this.current();
    return credentials.toJSON();
  }

  // The stored credentials, or WORKFLOW_SLACK_CLIENT_ID and WORKFLOW_SLACK_CLIENT_SECRET when none are stored.
  async getSlackCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const { slack } = (await this.current()).toJSON();
    const envCfg = this.deps.env.getConfig();
    return {
      clientId: slack.clientId || envCfg.WORKFLOW_SLACK_CLIENT_ID || "",
      clientSecret: slack.clientSecret || envCfg.WORKFLOW_SLACK_CLIENT_SECRET || ""
    };
  }

  async getMicrosoftTeamsCredentials(): Promise<TMicrosoftTeamsCredentials> {
    const credentials = await this.current();
    return { ...credentials.toJSON().microsoftTeams, updatedAt: credentials.updatedAt };
  }

  private async current(): Promise<IntegrationCredentials> {
    const config = await loadServerConfig(this.deps.cache, this.deps.dataAccess);
    const held = this.deps.credentials.get();
    if (held?.isCurrent(config.updatedAt)) return held;

    const credentials = decryptCredentials(config, this.deps.kmsCoreDomain);
    this.deps.credentials.set(credentials);
    return credentials;
  }
}
