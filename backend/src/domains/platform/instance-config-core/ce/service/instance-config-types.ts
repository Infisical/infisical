import { TInstanceConfigSettings } from "../model/instance-config";

// What callers read: the settings, never a ciphertext.
export type TServerConfigView = TInstanceConfigSettings;

// What the env holder (lib/config/env.ts) gives the domain. Passed in by domains.ts so this module never loads env.ts.
export type TInstanceConfigEnv = {
  getConfig: () => { WORKFLOW_SLACK_CLIENT_ID?: string; WORKFLOW_SLACK_CLIENT_SECRET?: string };
  // The env as the process started, before any override.
  getOriginalConfig: () => Readonly<Record<string, unknown>> | undefined;
  overridableGroups: Record<string, { name: string; fields: { key: string; description?: string }[] }>;
  overridableKeys: ReadonlySet<string>;
  // Parses the process env with these overrides on top, without applying them.
  parseWithOverrides: (
    overrides: Record<string, string>
  ) => { success: true } | { success: false; issues: { path: (string | number)[]; message: string }[] };
  // Rebuilds the env holder from the process env plus these overrides; keeps it unchanged when they do not parse.
  overrideEnvConfig: (overrides: Record<string, string>) => void;
};

type TSettings = Omit<
  TServerConfigView,
  "id" | "createdAt" | "updatedAt" | "defaultAuthOrgSlug" | "defaultAuthOrgAuthEnforced" | "defaultAuthOrgAuthMethod"
>;

// Plain values for the credential columns; every other field is a super_admin setting.
export type TInstanceConfigPatch = Partial<TSettings> & {
  slackClientId?: string;
  slackClientSecret?: string;
  microsoftTeamsAppId?: string;
  microsoftTeamsClientSecret?: string;
  microsoftTeamsBotId?: string;
  gitHubAppConnectionClientId?: string;
  gitHubAppConnectionClientSecret?: string;
  gitHubAppConnectionSlug?: string;
  gitHubAppConnectionId?: string;
  gitHubAppConnectionPrivateKey?: string;
  envOverrides?: Record<string, string>;
};

export type TEnvOverridesView = Record<
  string,
  { name: string; fields: { key: string; value: string; hasEnvEntry: boolean; description?: string }[] }
>;

// The instance's app credentials, decrypted. An unset value is "".
export type TIntegrationCredentials = {
  slack: { clientId: string; clientSecret: string };
  microsoftTeams: { appId: string; clientSecret: string; botId: string };
  gitHubAppConnection: { clientId: string; clientSecret: string; appSlug: string; appId: string; privateKey: string };
};

export type TMicrosoftTeamsCredentials = { appId: string; clientSecret: string; botId: string; updatedAt: Date };
