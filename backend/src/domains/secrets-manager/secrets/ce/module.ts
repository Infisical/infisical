import { TDbClient } from "@app/db";
import { ProjectType } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TActorGrantsService, TGroupService } from "@app/domains/platform/access-control/ce/module";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TProjectPermissionService, TProjectsService } from "@app/domains/platform/projects/ce/module";

import { FolderGrantCache } from "./data-access/folder-grant-cache";
import { FolderLocationStore } from "./data-access/folder-location-store";
import { MemberNameStore } from "./data-access/member-name-store";
import { ServiceTokenStore } from "./data-access/service-token-store";
import { SecretsPermissionService, TSecretsPermissionService } from "./services/secrets-permission/service";

export * from "./models/folder-grant";
export * from "./models/folder-grants";
export * from "./models/folder-roles";
export * from "./models/secret-read-access";
export * from "./models/service-token";
export type {
  TDirectMemberPermission,
  TGroupMemberPermission,
  TMemberRoleSummary,
  TProjectMemberPermissions
} from "./services/secrets-permission/project-member-permissions";
export type { TSecretsPermissionTransaction } from "./services/secrets-permission/secrets-permission-transaction";
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
  // Seconds cached folder grants are served without checking their fingerprint; 0 checks on every read (tests).
  cacheMarkerTtlSeconds?: number;
};

// Secret Manager's permissions (project roles with folder grants over them, and service tokens) and its usage
// counter. It grows as Secret Manager moves into domains.
export class SecretsModule {
  readonly usageCounters: TUsageCounter[];

  readonly secretsPermissionService: TSecretsPermissionService;

  constructor({
    db,
    keyStore,
    projectPermissionService,
    actorGrantsService,
    groupService,
    projectsService,
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
    this.usageCounters = [
      {
        meter: Meter.SecretIdentities,
        count: (orgId) => projectsService.countProjectIdentities(ProjectType.SecretManager, orgId)
      }
    ];
  }
}
