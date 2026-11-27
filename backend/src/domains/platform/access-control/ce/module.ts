import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { ActorGrantsCache } from "./data-access/actor-grants-cache";
import { GrantStore } from "./data-access/grant-store";
import { ActorGrantsService, TActorGrantsService } from "./services/actor-grants/service";
import { GroupService, TGroupService } from "./services/groups/service";
import { RoleService, TRoleService } from "./services/roles/service";

export * from "./models/actor-grants";
export * from "./models/actor-permission";
export * from "./models/grant";
export * from "./models/membership";
export * from "./models/permission";
export * from "./models/privilege";
export * from "./models/project-member-grants";
export * from "./models/role";
export * from "./models/role-assignment";
export * from "./models/rule-identity";
export * from "./models/rule-set";
export * from "./models/temporary-access";
export type { TActorGrantsService, TActorGrantsTransaction } from "./services/actor-grants/service";
export type { TActorMembership, TGrantActor, TGrantScope, TGroup, TRoleOwner } from "./services/dependencies";
export type { TGroupService } from "./services/groups/service";
export type { TResolvedRole, TResolveRolesInput, TRoleService } from "./services/roles/service";

export type TAccessControlDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  // Seconds to serve cached grants without checking the fingerprint. 0 checks every read (tests).
  cacheMarkerTtlSeconds?: number;
};

// Who holds what (memberships, roles, privileges, groups, attributes). Base domain: depends on no other domain,
// doesn't know what roles mean (scope owners do) and does no permission checks.
export class AccessControlModule {
  readonly actorGrantsService: TActorGrantsService;

  readonly roleService: TRoleService;

  readonly groupService: TGroupService;

  constructor({ db, keyStore, cacheMarkerTtlSeconds }: TAccessControlDeps) {
    const grantStore = new GrantStore(poolStoreConnection(db));
    this.actorGrantsService = new ActorGrantsService(
      grantStore,
      new ActorGrantsCache(keyStore, cacheMarkerTtlSeconds),
      new TransactionRunner(db, (trx) => ({ grantStore: new GrantStore(singleStoreConnection(trx)) }))
    );
    this.roleService = new RoleService(grantStore);
    this.groupService = new GroupService(grantStore);
  }
}
