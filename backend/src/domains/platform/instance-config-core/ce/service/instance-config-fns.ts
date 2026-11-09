import { TSuperAdminUpdate } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { ServerConfigCache } from "../data-access/server-config-cache";
import { InstanceConfig } from "../model/instance-config";
import { InstanceConfigChange } from "../model/instance-config-change";
import { IntegrationCredentials } from "../model/integration-credentials";
import { TInstanceConfigEnv, TInstanceConfigPatch, TRootKeyCipher } from "./instance-config-types";

// The shared cached row, read from the database (replica) on a miss.
export const loadServerConfig = (cache: ServerConfigCache, dataAccess: TInstanceConfigCoreDataAccess) =>
  cache.get(async () => {
    const config = await dataAccess.instanceConfig.findById();
    if (!config) throw new NotFoundError({ message: "Admin config not found" });
    return config;
  });

export const decryptCredentials = (config: InstanceConfig, kms: TRootKeyCipher): IntegrationCredentials => {
  const decrypt = kms.decryptWithRootKey();
  const read = (column: Parameters<InstanceConfig["encrypted"]>[0]) => {
    const cipherText = config.encrypted(column);
    return cipherText ? decrypt(cipherText).toString() : "";
  };
  return IntegrationCredentials.restore(
    {
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
    },
    config.updatedAt
  );
};

export const decryptEnvOverrides = (config: InstanceConfig, kms: TRootKeyCipher): Record<string, string> => {
  const cipherText = config.encrypted("encryptedEnvOverrides");
  if (!cipherText) return {};
  return JSON.parse(kms.decryptWithRootKey()(cipherText).toString()) as Record<string, string>;
};

// Refuses overrides the env schema rejects. Keys that cannot be overridden are ignored, as they are when applied.
export const validateEnvOverrides = (env: TInstanceConfigEnv, overrides: Record<string, string>) => {
  const allowed = Object.fromEntries(Object.entries(overrides).filter(([key]) => env.overridableKeys.has(key)));
  const parsed = env.parseWithOverrides(allowed);
  if (!parsed.success) {
    throw new BadRequestError({
      message: parsed.issues.map((issue) => `Key: "${issue.path.join(".")}", Error: ${issue.message}`).join("\n")
    });
  }
};

// Slack and Teams credentials are encrypted only when given a value; GitHub app credentials and env overrides
// whenever present, so they can be cleared.
export const buildConfigChange = (
  patch: TInstanceConfigPatch,
  env: TInstanceConfigEnv,
  kms: TRootKeyCipher
): InstanceConfigChange => {
  const {
    slackClientId,
    slackClientSecret,
    microsoftTeamsAppId,
    microsoftTeamsClientSecret,
    microsoftTeamsBotId,
    gitHubAppConnectionClientId,
    gitHubAppConnectionClientSecret,
    gitHubAppConnectionSlug,
    gitHubAppConnectionId,
    gitHubAppConnectionPrivateKey,
    envOverrides,
    ...settings
  } = patch;

  if (envOverrides !== undefined) validateEnvOverrides(env, envOverrides);

  const encrypt = kms.encryptWithRootKey();
  const ifSet = (value?: string) => (value ? encrypt(Buffer.from(value)) : undefined);
  const ifGiven = (value?: string) => (value !== undefined ? encrypt(Buffer.from(value)) : undefined);

  const columns: TSuperAdminUpdate = {
    ...settings,
    encryptedSlackClientId: ifSet(slackClientId),
    encryptedSlackClientSecret: ifSet(slackClientSecret),
    encryptedMicrosoftTeamsAppId: ifSet(microsoftTeamsAppId),
    encryptedMicrosoftTeamsClientSecret: ifSet(microsoftTeamsClientSecret),
    encryptedMicrosoftTeamsBotId: ifSet(microsoftTeamsBotId),
    encryptedGitHubAppConnectionClientId: ifGiven(gitHubAppConnectionClientId),
    encryptedGitHubAppConnectionClientSecret: ifGiven(gitHubAppConnectionClientSecret),
    encryptedGitHubAppConnectionSlug: ifGiven(gitHubAppConnectionSlug),
    encryptedGitHubAppConnectionId: ifGiven(gitHubAppConnectionId),
    encryptedGitHubAppConnectionPrivateKey: ifGiven(gitHubAppConnectionPrivateKey),
    encryptedEnvOverrides: envOverrides !== undefined ? encrypt(Buffer.from(JSON.stringify(envOverrides))) : undefined
  };
  return InstanceConfigChange.create(columns);
};
