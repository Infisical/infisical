import { TDbClient } from "@app/db";
import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { TActorGrantsService, TRoleService } from "@app/domains/platform/access-control/ce/module";

import { ActorOrgCache } from "./data-access/actor-org-cache";
import { BillableActorStore } from "./data-access/billable-actor-store";
import { OrganizationStore } from "./data-access/organization-store";
import { ActorContextService, TActorContextService } from "./services/actor-context/service";
import { TOrganizationsStores } from "./services/dependencies";
import { OrgPermissionService, TOrgPermissionService } from "./services/org-permission/service";
import { OrganizationsService, TOrganizationsService } from "./services/organizations/service";
import { SsoSessionService, TSsoSessionService } from "./services/sso-session/service";

export * from "./models/organization";
export * from "./models/org-permission";
export * from "./models/permissions/org-permission-set";
export * from "./models/org-roles";
export * from "./models/sso-policy";
export type { TActorContextService, TRequestActorContext } from "./services/actor-context/service";
export type {
  TGetOrgPermissionInput,
  TOrgPermissionService,
  TOrgRolePermission
} from "./services/org-permission/service";
export type { TSsoSessionService } from "./services/sso-session/service";
export type { TIdentityOwnership, TOrganization } from "./services/dependencies";
export type { TOrganizationsTransaction } from "./services/organizations/organizations-transaction";
export type { TOrganizationsService } from "./services/organizations/service";

export type TOrganizationsDeps = {
  db: TDbClient;
  actorGrantsService: TActorGrantsService;
  roleService: TRoleService;
  // Tests pass 0 so an org change shows up on the next request.
  actorOrgCacheTtlSeconds?: number;
};

export class OrganizationsModule {
  readonly organizationsService: TOrganizationsService;

  readonly orgPermissionService: TOrgPermissionService;

  readonly ssoSessionService: TSsoSessionService;

  readonly actorContextService: TActorContextService;

  constructor({ db, actorGrantsService, roleService, actorOrgCacheTtlSeconds }: TOrganizationsDeps) {
    const connection = poolStoreConnection(db);
    const organizationStore = new OrganizationStore(connection);
    this.orgPermissionService = new OrgPermissionService(actorGrantsService, roleService, new ActorContextMemo());
    this.ssoSessionService = new SsoSessionService(this.orgPermissionService);
    this.actorContextService = new ActorContextService(
      organizationStore,
      this.ssoSessionService,
      new ActorOrgCache(actorOrgCacheTtlSeconds)
    );
    this.organizationsService = new OrganizationsService(
      organizationStore,
      new BillableActorStore(connection),
      new TransactionRunner<TOrganizationsStores>(db, (trx, locks) => ({
        organizationStore: new OrganizationStore(singleStoreConnection(trx)),
        billableActorStore: new BillableActorStore(singleStoreConnection(trx)),
        locks
      }))
    );
  }
}
