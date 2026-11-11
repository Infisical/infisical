import { DataAccessDb, ReadFrom } from "@app/domains/lib/data-access-db";
import type { TDomainEventEmitter } from "@app/domains/lib/event-emitter";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner, TTransactionRunner } from "@app/domains/lib/transaction-runner";

import { buildAccessControlDataAccess, TAccessControlDataAccess } from "./data-access/access-control-data-access";
import { TGrantActor, TGrantScope } from "./data-access/grant-data-access";
import { PermissionCache } from "./data-access/permission-cache";
import { ActorGrants } from "./model/actor-grants";
import { Group } from "./model/group";
import { Membership } from "./model/membership";
import { Privilege } from "./model/privilege";
import { ProjectMemberGrants } from "./model/project-member-grants";
import { Role } from "./model/role";
import { GrantService, TCachedPermissionInput } from "./service/grant-service";

export * from "./model/actor-grants";
export * from "./model/group";
export * from "./model/identity-attribute";
export * from "./model/membership";
export * from "./model/privilege";
export * from "./model/project-member-grants";
export * from "./model/role";
export * from "./model/role-assignment";
export type { TGrantActor, TGrantScope } from "./data-access/grant-data-access";
export * from "./service/ability-builder";
export * from "./service/permission";
export * from "./service/access-control-events";
export type { TCachedPermissionInput } from "./service/grant-service";
export { reviveActorGrants } from "./service/grant-service";
export * from "./service/permission-schemas";
export * from "./service/permission-types";
export * from "./service/rule-composition";
export * from "./service/rule-interpolation";
export * from "./service/rule-narrowing";
export * from "./service/unpacked-permission";

export type TAccessControlDomain = {
  // What the actor holds at the scope: memberships (direct and through groups) with their roles, privileges and
  // attributes. Plain data; the scope owner builds the permission from it with its own roles. Empty when the actor
  // has no membership there.
  fetchGrants: (input: { actor: TGrantActor; scope: TGrantScope; readFrom?: ReadFrom }) => Promise<ActorGrants>;
  // Caches a value the scope owner builds from an actor's grants in one project. The cached value is revalidated
  // against a fingerprint of those grants plus extraFingerprint, so a role, membership or privilege change shows
  // within seconds. The value must be JSON; pass revive to restore dates.
  withCache: <T>(input: TCachedPermissionInput<T>) => Promise<T>;
  // A named counter for cache inputs Access Control cannot see (a folder tree changing): bump it on change and fold
  // version({ name }) into extraFingerprint.
  invalidate: (input: { name: string }) => Promise<void>;
  version: (input: { name: string }) => Promise<number>;
  findMembershipsByIds: (input: { ids: string[]; readFrom?: ReadFrom }) => Promise<Membership[]>;
  // The actor's own folder grants in a project (privileges on one secret folder), active or not.
  findFolderGrants: (input: { actor: TGrantActor; projectId: string; readFrom?: ReadFrom }) => Promise<Privilege[]>;
  // Every folder grant in a project, of every user and identity, active or not.
  findProjectFolderGrants: (input: { projectId: string; readFrom?: ReadFrom }) => Promise<Privilege[]>;
  // Everyone's grants in a project: every membership with its roles, and its members' project-wide privileges and
  // attributes. For listings over all members; a single actor's check uses fetchGrants.
  findProjectMemberGrants: (input: {
    orgId: string;
    projectId: string;
    readFrom?: ReadFrom;
  }) => Promise<ProjectMemberGrants>;
  // The org's or project's custom roles with these slugs; slugs with no role are left out.
  findRolesBySlugs: (input: {
    owner: { orgId: string } | { projectId: string };
    slugs: string[];
    readFrom?: ReadFrom;
  }) => Promise<Role[]>;
  findGroupsByIds: (input: { ids: string[]; readFrom?: ReadFrom }) => Promise<Group[]>;
  // The actor's memberships on resources of one type in a project, directly or through its groups, active or not.
  findResourceMembershipsForActor: (input: {
    actor: TGrantActor;
    projectId: string;
    resourceType: string;
    readFrom?: ReadFrom;
  }) => Promise<Membership[]>;
};

export type TAccessControlDataAccessDeps = {
  transactionRunner: TTransactionRunner<TAccessControlDataAccess>;
  // Outside a transaction. Fetches read the replica unless they pass ReadFrom.Primary.
  dataAccess: TAccessControlDataAccess;
};

export type TAccessControlDeps = (
  | {
      db: DataAccessDb;
    }
  // Tests pass in-memory data access instead.
  | TAccessControlDataAccessDeps
) & {
  keyStore: TDomainKeyStore;
  // Its only dependency: removals write their events on the same transaction as the delete.
  eventEmitter: TDomainEventEmitter;
};

export const buildAccessControlDataAccessDeps = (db: DataAccessDb): TAccessControlDataAccessDeps => ({
  transactionRunner: new TransactionRunner(db, (trxDb) => buildAccessControlDataAccess(trxDb)),
  dataAccess: buildAccessControlDataAccess(db)
});

// Memberships at every scope, roles, privileges, groups and attributes, and the building blocks every scope owner
// builds its permission function on. A base domain: it depends on no other domain and does no permission checks;
// callers authorize before they call it.
export class AccessControlModule {
  readonly name = "access-control";

  readonly service: TAccessControlDomain;

  constructor(deps: TAccessControlDeps) {
    const { dataAccess } = "db" in deps ? buildAccessControlDataAccessDeps(deps.db) : deps;
    const grants = new GrantService({ dataAccess, cache: new PermissionCache(deps.keyStore) });

    this.service = {
      fetchGrants: ({ actor, scope, readFrom }) => grants.fetchGrants(actor, scope, { readFrom }),
      withCache: (input) => grants.withCache(input),
      invalidate: ({ name }) => grants.invalidate(name),
      version: ({ name }) => grants.version(name),
      findMembershipsByIds: ({ ids, readFrom }) => dataAccess.memberships.findByIds(ids, { readFrom }),
      findFolderGrants: ({ readFrom, ...input }) => dataAccess.privileges.findFolderGrants(input, { readFrom }),
      findProjectFolderGrants: ({ readFrom, ...input }) =>
        dataAccess.privileges.findProjectFolderGrants(input, { readFrom }),
      findProjectMemberGrants: ({ readFrom, ...scope }) =>
        dataAccess.grants.findProjectMemberGrants(scope, { readFrom }),
      findRolesBySlugs: ({ readFrom, ...input }) => dataAccess.roles.findBySlugs(input, { readFrom }),
      findGroupsByIds: ({ ids, readFrom }) => dataAccess.groups.findByIds(ids, { readFrom }),
      findResourceMembershipsForActor: ({ readFrom, ...input }) =>
        dataAccess.memberships.findResourceMembershipsForActor(input, { readFrom })
    };
  }
}
