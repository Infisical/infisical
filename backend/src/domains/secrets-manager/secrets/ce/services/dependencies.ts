import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks, TTransaction } from "@app/domains/lib/transactions";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";

import { FolderGrant } from "../models/folder-grant";
import { MicrosoftTeamsProjectChatConfig } from "../models/microsoft-teams-project-chat-config";
import { ServiceToken } from "../models/service-token";
import { SlackProjectChatConfig } from "../models/slack-project-chat-config";

// secretPath is the full path from the environment root ("/").
export type TFolderLocation = { environmentSlug: string; secretPath: string };

export type TFolderLocationStore = {
  // Same order as asked. Null if the folder is gone, in another project, or its environment is being deleted.
  findLocations(projectId: string, folderIds: string[], options?: TReadOptions): Promise<(TFolderLocation | null)[]>;
};

export type TServiceTokenStore = {
  findById(serviceTokenId: string, options?: TReadOptions): Promise<ServiceToken | null>;
};

export type TMemberNames = { users: Map<string, string>; identities: Map<string, string> };

export type TMemberNameStore = {
  // Skips ghost users (stand-ins for deleted accounts).
  findNames(input: { userIds: string[]; identityIds: string[] }, options?: TReadOptions): Promise<TMemberNames>;
};

export type TFolderGrantCache = {
  // Includes inactive grants. Served from cache while the fingerprint is unchanged.
  getOrLoad(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<FolderGrant[]>;
  }): Promise<FolderGrant[]>;
  // Fingerprint getOrLoad would serve without rechecking. Null if it would recheck (never loaded, expired, or the
  // actor needs no folder grants).
  findLiveFingerprint(input: { actor: TGrantActor; projectId: string }): Promise<string | null>;
  // Moves whenever a folder grant or the project's folder tree changes. 0 if it never moved.
  getFolderVersion(projectId: string): Promise<number>;
  // Pass `tx` so the bump commits with the change.
  bumpFolderVersions(input: { projectIds: string[]; tx?: TTransaction }): Promise<void>;
};

// Owns project_slack_configs.
export type TSlackProjectChatConfigStore = {
  findByProjectId(projectId: string, options?: TReadOptions): Promise<SlackProjectChatConfig | null>;
  // Inserts the project's config, or replaces the settings of the one it already has (which keeps its id). Returns
  // the row as stored.
  upsert(config: SlackProjectChatConfig): Promise<SlackProjectChatConfig>;
  // Null when the project has no config for that integration.
  deleteByProjectAndIntegration(projectId: string, integrationId: string): Promise<SlackProjectChatConfig | null>;
};

// Owns project_microsoft_teams_configs.
export type TMicrosoftTeamsProjectChatConfigStore = {
  findByProjectId(projectId: string, options?: TReadOptions): Promise<MicrosoftTeamsProjectChatConfig | null>;
  upsert(config: MicrosoftTeamsProjectChatConfig): Promise<MicrosoftTeamsProjectChatConfig>;
  deleteByProjectAndIntegration(
    projectId: string,
    integrationId: string
  ): Promise<MicrosoftTeamsProjectChatConfig | null>;
};

export type TSecretsStores = {
  slackProjectChatConfigStore: TSlackProjectChatConfigStore;
  microsoftTeamsProjectChatConfigStore: TMicrosoftTeamsProjectChatConfigStore;
  locks: TStoreLocks;
};
