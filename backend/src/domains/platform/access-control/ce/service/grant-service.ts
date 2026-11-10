import { TReadOptions } from "@app/domains/lib/data-access-db";

import { TAccessControlDataAccess } from "../data-access/access-control-data-access";
import { TGrantActor, TGrantScope } from "../data-access/grant-data-access";
import { TPermissionCache } from "../data-access/permission-cache";
import { ActorGrants, TActorGrantsProps } from "../model/actor-grants";

export type TGrantServiceDeps = {
  dataAccess: TAccessControlDataAccess;
  cache: TPermissionCache;
};

export type TCachedPermissionInput<T> = {
  // Names the cached value; include everything the value depends on beyond the actor's grants in the project.
  key: string;
  actor: TGrantActor;
  scope: { orgId: string; projectId: string };
  // Further inputs the value depends on, folded into the fingerprint (a project's deletion state, a version).
  extraFingerprint?: () => Promise<string>;
  compute: () => Promise<T>;
  revive?: (cached: T) => T;
};

// Reads what an actor holds, and caches what a scope owner builds from it.
export class GrantService {
  constructor(private readonly deps: TGrantServiceDeps) {}

  fetchGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants> {
    return this.deps.dataAccess.grants.findActorGrants(actor, scope, options);
  }

  withCache<T>({ key, actor, scope, extraFingerprint, compute, revive }: TCachedPermissionInput<T>): Promise<T> {
    return this.deps.cache.getOrCompute({
      key: `${scope.projectId}:${actor.type}:${actor.id}:${key}`,
      fingerprint: async () => {
        const grants = await this.deps.dataAccess.grants.fingerprint(actor, scope);
        const extra = extraFingerprint ? await extraFingerprint() : "";
        return `${grants}:${extra}`;
      },
      compute,
      revive
    });
  }

  invalidate(name: string): Promise<void> {
    return this.deps.cache.bumpVersion(name);
  }

  version(name: string): Promise<number> {
    return this.deps.cache.getVersion(name);
  }
}

// Grants cross the cache as JSON; dates come back as strings.
export const reviveActorGrants = (props: TActorGrantsProps): ActorGrants => {
  const date = (value: Date | string | null | undefined) => (value ? new Date(value) : value);
  return ActorGrants.restore({
    memberships: props.memberships.map((membership) => ({
      ...membership,
      createdAt: date(membership.createdAt) as Date,
      updatedAt: date(membership.updatedAt) as Date,
      lastInvitedAt: date(membership.lastInvitedAt) as Date | null,
      lastLoginTime: date(membership.lastLoginTime) as Date | null,
      roles: membership.roles.map((role) => ({
        ...role,
        createdAt: date(role.createdAt) as Date,
        updatedAt: date(role.updatedAt) as Date,
        temporaryAccessStartTime: date(role.temporaryAccessStartTime) as Date | null,
        temporaryAccessEndTime: date(role.temporaryAccessEndTime) as Date | null
      }))
    })),
    privileges: props.privileges.map((privilege) => ({
      ...privilege,
      createdAt: date(privilege.createdAt) as Date,
      updatedAt: date(privilege.updatedAt) as Date,
      temporaryAccessStartTime: date(privilege.temporaryAccessStartTime) as Date | null,
      temporaryAccessEndTime: date(privilege.temporaryAccessEndTime) as Date | null
    })),
    attributes: props.attributes
  });
};
