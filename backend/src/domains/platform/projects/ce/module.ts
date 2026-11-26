import { TDbClient } from "@app/db";
import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { TActorGrantsService, TGroupService, TRoleService } from "@app/domains/platform/access-control/ce/module";
import type { TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";

import { ProjectCache } from "./data-access/project-cache";
import { ProjectIdentityStore } from "./data-access/project-identity-store";
import { ProjectStore } from "./data-access/project-store";
import { TProjectRoles } from "./models/standard-project-roles";
import { TProjectAccessListener, TProjectsStores } from "./services/dependencies";
import { ProjectPermissionService, TProjectPermissionService } from "./services/project-permission/service";
import {
  ProjectResourcePermissionService,
  TProjectResourcePermissionService
} from "./services/project-resource-permission/service";
import { ProjectsService, TProjectsService } from "./services/projects/service";

export * from "./models/project";
export * from "./models/project-access";
export * from "./models/permissions/project-oauth-scopes";
export * from "./models/project-permission";
export * from "./models/permissions/project-permission-set";
export * from "./models/project-resource-permission";
export * from "./models/permissions/project-roles";
export * from "./models/standard-project-roles";
export type {
  TGetProjectPermissionInput,
  TProjectPermissionAuditSource,
  TProjectPermissionService,
  TProjectRolePermission
} from "./services/project-permission/service";
export type {
  TGetResourcePermissionInput,
  TProjectResourcePermissionService,
  TResourceRef
} from "./services/project-resource-permission/service";
export type { TProjectsTransaction } from "./services/projects/projects-transaction";
export type { TProjectsService } from "./services/projects/service";
export type { TProjectAccessListener } from "./services/dependencies";

export type TProjectsDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  actorGrantsService: TActorGrantsService;
  roleService: TRoleService;
  groupService: TGroupService;
  orgPermissionService: TOrgPermissionService;
  // Only for products whose roles differ from the standard ones.
  projectRoles: TProjectRoles[];
  // Seconds a cached project is served unchecked. 0 checks on every read (tests).
  cacheMarkerTtlSeconds?: number;
  onProjectAccess?: TProjectAccessListener;
};

export class ProjectsModule {
  readonly projectsService: TProjectsService;

  readonly projectPermissionService: TProjectPermissionService;

  readonly projectResourcePermissionService: TProjectResourcePermissionService;

  constructor({
    db,
    keyStore,
    actorGrantsService,
    roleService,
    groupService,
    orgPermissionService,
    projectRoles,
    cacheMarkerTtlSeconds,
    onProjectAccess
  }: TProjectsDeps) {
    const connection = poolStoreConnection(db);
    const projectStore = new ProjectStore(connection);
    this.projectPermissionService = new ProjectPermissionService(
      projectStore,
      new ProjectCache(keyStore, cacheMarkerTtlSeconds),
      actorGrantsService,
      roleService,
      groupService,
      projectRoles,
      new ActorContextMemo(),
      onProjectAccess
    );
    this.projectResourcePermissionService = new ProjectResourcePermissionService(
      this.projectPermissionService,
      orgPermissionService,
      actorGrantsService
    );
    this.projectsService = new ProjectsService(
      projectStore,
      new ProjectIdentityStore(connection),
      new TransactionRunner<TProjectsStores>(db, (trx, locks) => ({
        projectStore: new ProjectStore(singleStoreConnection(trx)),
        projectIdentityStore: new ProjectIdentityStore(singleStoreConnection(trx)),
        locks
      }))
    );
  }
}
