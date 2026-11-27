import { TDbClient } from "@app/db";
import { ProjectType } from "@app/db/schemas";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { TActorGrantsService, TGroupService } from "@app/domains/platform/access-control/ce/module";
import { TProductUsageCounters } from "@app/domains/platform/license/ce/module";
import { TProjectPermissionService, TProjectsService } from "@app/domains/platform/projects/ce/module";
import type {
  TChatDeliveryService,
  TWorkflowIntegrationService
} from "@app/domains/platform/workflow-integrations/ce/module";

import { FolderGrantCache } from "./data-access/folder-grant-cache";
import { FolderLocationStore } from "./data-access/folder-location-store";
import { MemberNameStore } from "./data-access/member-name-store";
import { MicrosoftTeamsProjectChatConfigStore } from "./data-access/microsoft-teams-project-chat-config-store";
import { ServiceTokenStore } from "./data-access/service-token-store";
import { SlackProjectChatConfigStore } from "./data-access/slack-project-chat-config-store";
import { SecretsChatNotificationService, TSecretsChatNotificationService } from "./services/chat-notification/service";
import { TSecretsStores } from "./services/dependencies";
import { ProjectChatConfigService, TProjectChatConfigService } from "./services/project-chat-config/service";
import { SecretsPermissionService, TSecretsPermissionService } from "./services/secrets-permission/service";

export * from "./models/folder-grant";
export * from "./models/folder-grants";
export { SecretsChatEvent, SecretsChatNotificationType } from "./models/secrets-chat-event";
export { MicrosoftTeamsProjectChatConfig } from "./models/microsoft-teams-project-chat-config";
export type { TMicrosoftTeamsChannels } from "./models/microsoft-teams-project-chat-config";
export { SlackProjectChatConfig } from "./models/slack-project-chat-config";
export * from "./models/permissions/folder-roles";
export * from "./models/secret-read-access";
export * from "./models/service-token";
export type {
  TDirectMemberPermission,
  TGroupMemberPermission,
  TMemberRoleSummary,
  TProjectMemberPermissions
} from "./services/secrets-permission/project-member-permissions";
export type { TSecretsPermissionTransaction } from "./services/secrets-permission/secrets-permission-transaction";
export type { TSecretsChatNotification } from "./services/chat-notification/notification";
export type { TSecretsChatNotificationService } from "./services/chat-notification/service";
export type {
  TProjectChatConfig,
  TProjectChatConfigService,
  TUpdateProjectChatConfigInput
} from "./services/project-chat-config/service";
export { microsoftTeamsChannelsSchema, slackChannelsSchema } from "./services/project-chat-config/channel-schemas";
export type {
  TFolderGrantTargetInput,
  TSecretsPermission,
  TSecretsPermissionService
} from "./services/secrets-permission/service";

export type TSecretsDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  projectPermissionService: TProjectPermissionService;
  actorGrantsService: TActorGrantsService;
  groupService: TGroupService;
  projectsService: TProjectsService;
  workflowIntegrationService: TWorkflowIntegrationService;
  chatDeliveryService: TChatDeliveryService;
  siteUrl: string | undefined;
  // Seconds cached folder grants skip the fingerprint check. 0 checks every read (used by tests).
  cacheMarkerTtlSeconds?: number;
};

// Secret Manager permissions (project roles plus folder grants, service tokens), its usage counter and the chat
// channels a project's Secret Manager events go to.
export class SecretsModule {
  readonly usageCounters: Pick<TProductUsageCounters, "secret_identities">;

  readonly secretsPermissionService: TSecretsPermissionService;

  readonly projectChatConfigService: TProjectChatConfigService;

  readonly secretsChatNotificationService: TSecretsChatNotificationService;

  constructor({
    db,
    keyStore,
    projectPermissionService,
    actorGrantsService,
    groupService,
    projectsService,
    workflowIntegrationService,
    chatDeliveryService,
    siteUrl,
    cacheMarkerTtlSeconds
  }: TSecretsDeps) {
    const connection = poolStoreConnection(db);
    this.secretsPermissionService = new SecretsPermissionService(
      projectPermissionService,
      actorGrantsService,
      groupService,
      projectsService,
      new ServiceTokenStore(connection),
      new FolderLocationStore(connection),
      new MemberNameStore(connection),
      new FolderGrantCache(keyStore, cacheMarkerTtlSeconds)
    );
    const transactionRunner = new TransactionRunner<TSecretsStores>(db, (trx, locks) => ({
      slackProjectChatConfigStore: new SlackProjectChatConfigStore(singleStoreConnection(trx)),
      microsoftTeamsProjectChatConfigStore: new MicrosoftTeamsProjectChatConfigStore(singleStoreConnection(trx)),
      locks
    }));
    const slackProjectChatConfigStore = new SlackProjectChatConfigStore(connection);
    const microsoftTeamsProjectChatConfigStore = new MicrosoftTeamsProjectChatConfigStore(connection);
    this.projectChatConfigService = new ProjectChatConfigService(
      transactionRunner,
      slackProjectChatConfigStore,
      microsoftTeamsProjectChatConfigStore,
      projectPermissionService,
      projectsService,
      workflowIntegrationService
    );
    this.secretsChatNotificationService = new SecretsChatNotificationService(
      slackProjectChatConfigStore,
      microsoftTeamsProjectChatConfigStore,
      projectsService,
      chatDeliveryService,
      siteUrl
    );
    this.usageCounters = {
      secret_identities: (orgId) => projectsService.countProjectIdentities(ProjectType.SecretManager, orgId)
    };
  }
}
