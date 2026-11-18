import { AccessScope, RESOURCE_SCOPE, TGroups } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { ActorType } from "@app/lib/auth/actor-types";

import { ActorGrants } from "../models/actor-grants";
import { Membership } from "../models/membership";
import { Privilege } from "../models/privilege";
import { ProjectMemberGrants } from "../models/project-member-grants";
import { Role } from "../models/role";

export type TGrantActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

export type TGrantScope =
  | { scope: AccessScope.Organization; orgId: string }
  | { scope: AccessScope.Project; orgId: string; projectId: string }
  | { scope: typeof RESOURCE_SCOPE; orgId: string; projectId: string; resourceType: string; resourceId: string };

export type TGroup = Pick<TGroups, "id" | "orgId" | "name" | "slug">;

export type TRoleOwner = { orgId: string } | { projectId: string };

// Read-only over every table Access Control owns (memberships, membership_roles, roles, additional_privileges,
// groups, user_group_membership, identity_group_membership, identity_metadata), as one store so a check costs the
// round trips it always has. The writes, and a store per entity, come when the membership writes move here.
export type TGrantStore = {
  // The actor's memberships at the scope, directly or through its groups, with their roles; its privileges at the org
  // or project scope (never folder grants); and its attributes. A resource scope reads only active memberships and
  // has no privileges.
  findActorGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants>;
  // A hash of everything findActorGrants reads for the actor in one project, its resources and its org. It changes
  // when a membership, role assignment, custom role, privilege or attribute changes, or when a temporary grant ends.
  findGrantsFingerprint(
    actor: TGrantActor,
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<string>;
  // Every membership in the project (users, identities and groups) with its roles, and the project-wide privileges
  // and the attributes of its direct user and identity members. Active or not.
  findProjectMemberGrants(
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<ProjectMemberGrants>;
  // The actor's own folder grants in a project, active or not.
  findFolderGrants(input: { actor: TGrantActor; projectId: string }, options?: TReadOptions): Promise<Privilege[]>;
  // Every folder grant in a project, of every user and identity, active or not.
  findProjectFolderGrants(input: { projectId: string }, options?: TReadOptions): Promise<Privilege[]>;
  // The actor's memberships on resources of one type in a project, directly or through its groups, active or not.
  findResourceMembershipsForActor(
    input: { actor: TGrantActor; projectId: string; resourceType: string },
    options?: TReadOptions
  ): Promise<Membership[]>;
  // The org's or project's custom roles with these slugs; slugs with no role are left out.
  findRolesBySlugs(input: { owner: TRoleOwner; slugs: string[] }, options?: TReadOptions): Promise<Role[]>;
  findGroupsByIds(ids: string[], options?: TReadOptions): Promise<TGroup[]>;
};

export type TActorGrantsCache = {
  // The actor's grants in a project, served from the cache while their fingerprint is unchanged, otherwise loaded.
  getOrLoad(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<ActorGrants>;
  }): Promise<ActorGrants>;
  // The fingerprint of the grants getOrLoad serves now: the live marker's, otherwise a fresh one.
  readFingerprint(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
  }): Promise<string>;
};
