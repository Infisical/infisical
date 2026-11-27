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

// Held directly or through one of the actor's groups.
export type TActorMembership = { actor: TGrantActor; membership: Membership };

export type TRoleOwner = { orgId: string } | { projectId: string };

// Read-only over every table Access Control owns. One store so a check doesn't pay extra DB round trips.
export type TGrantStore = {
  // Memberships (direct or via groups) with roles, org/project privileges (never folder grants), attributes and an
  // identity's name.
  // At a resource scope: active memberships only, no privileges.
  findActorGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants>;
  // Covers the project, its resources and its org. Changes on any membership, role assignment, custom role,
  // privilege or attribute change, when an identity is renamed, and when a temporary grant ends.
  findGrantsFingerprint(
    actor: TGrantActor,
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<string>;
  // All memberships (users, identities, groups) with roles, plus project-wide privileges and direct members'
  // attributes. Active or not.
  findProjectMemberGrants(
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<ProjectMemberGrants>;
  // The actor's own folder grants in a project, active or not.
  findFolderGrants(input: { actor: TGrantActor; projectId: string }, options?: TReadOptions): Promise<Privilege[]>;
  // Every user's and identity's folder grants, active or not.
  findProjectFolderGrants(input: { projectId: string }, options?: TReadOptions): Promise<Privilege[]>;
  // Direct or via groups, active or not.
  findResourceMembershipsForActor(
    input: { actor: TGrantActor; projectId: string; resourceType: string },
    options?: TReadOptions
  ): Promise<Membership[]>;
  // Fixed number of queries. A group's membership comes back once per requested actor in that group.
  findResourceMembershipsForActors(
    input: { actors: TGrantActor[]; projectId: string; resourceTypes: string[] },
    options?: TReadOptions
  ): Promise<TActorMembership[]>;
  // Slugs with no custom role are left out.
  findRolesBySlugs(input: { owner: TRoleOwner; slugs: string[] }, options?: TReadOptions): Promise<Role[]>;
  findGroupsByIds(ids: string[], options?: TReadOptions): Promise<TGroup[]>;
};

export type TActorGrantsCache = {
  getOrLoad(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<ActorGrants>;
  }): Promise<ActorGrants>;
  // Fingerprint of what getOrLoad serves now: the live marker's, otherwise a fresh one.
  readFingerprint(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
  }): Promise<string>;
};
