import { randomUUID } from "node:crypto";

import {
  TAdditionalPrivileges,
  TGroups,
  TIdentityMetadata,
  TMembershipRoles,
  TMemberships,
  TRoles
} from "@app/db/schemas";

import { PAST, TGrantSeeder, TSeedActor, temporaryColumns } from "./grant-fixture";
import { InMemoryGrantStore } from "./in-memory-grant-store";

export class InMemoryGrantSeeder implements TGrantSeeder {
  constructor(private readonly store: InMemoryGrantStore) {}

  async role({ owner, slug, permissions = [] }: Parameters<TGrantSeeder["role"]>[0]) {
    const now = new Date();
    const row: TRoles = {
      id: randomUUID(),
      name: slug,
      slug,
      permissions,
      orgId: "orgId" in owner ? owner.orgId : null,
      projectId: "projectId" in owner ? owner.projectId : null,
      createdAt: now,
      updatedAt: now
    };
    this.store.rows.roles.set(row.id, row);
    return row;
  }

  async membership({
    scope,
    orgId,
    projectId,
    resourceType,
    resourceId,
    actor,
    isActive = true,
    roles = [{ role: "member" }]
  }: Parameters<TGrantSeeder["membership"]>[0]) {
    const now = new Date();
    const membership: TMemberships = {
      id: randomUUID(),
      scope,
      scopeOrgId: orgId,
      scopeProjectId: projectId ?? null,
      scopeResourceType: resourceType ?? null,
      scopeResourceId: resourceId ?? null,
      actorUserId: "userId" in actor ? actor.userId : null,
      actorIdentityId: "identityId" in actor ? actor.identityId : null,
      actorGroupId: "groupId" in actor ? actor.groupId : null,
      isActive,
      createdAt: now,
      updatedAt: now
    };
    this.store.rows.memberships.set(membership.id, membership);
    const assignments = roles.map(({ role, customRoleId, temporaryAccessEndTime }): TMembershipRoles => {
      const assignment: TMembershipRoles = {
        id: randomUUID(),
        membershipId: membership.id,
        role,
        customRoleId: customRoleId ?? null,
        temporaryMode: null,
        temporaryRange: null,
        temporaryAccessStartTime: null,
        temporaryAccessEndTime: null,
        createdAt: now,
        updatedAt: now,
        ...temporaryColumns(temporaryAccessEndTime)
      };
      this.store.rows.membershipRoles.set(assignment.id, assignment);
      return assignment;
    });
    return { ...membership, roles: assignments };
  }

  async privilege({ actor, orgId, projectId, permissions = [], folder }: Parameters<TGrantSeeder["privilege"]>[0]) {
    const now = new Date();
    const row: TAdditionalPrivileges = {
      id: randomUUID(),
      name: `privilege-${randomUUID()}`,
      isTemporary: false,
      permissions,
      actorUserId: "userId" in actor ? actor.userId : null,
      actorIdentityId: "identityId" in actor ? actor.identityId : null,
      orgId: orgId ?? null,
      projectId: projectId ?? null,
      folderId: folder?.id ?? null,
      role: folder?.role ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.store.rows.privileges.set(row.id, row);
    return row;
  }

  async group({ orgId }: { orgId: string }) {
    const id = randomUUID();
    const now = new Date();
    const row: TGroups = { id, orgId, name: `group-${id}`, slug: `group-${id}`, createdAt: now, updatedAt: now };
    this.store.rows.groups.set(id, row);
    return row;
  }

  async groupMember({ groupId, ...actor }: { groupId: string } & TSeedActor) {
    const now = new Date();
    const id = randomUUID();
    if ("userId" in actor) {
      this.store.rows.userGroupMembers.set(id, {
        id,
        groupId,
        userId: actor.userId,
        isPending: false,
        createdAt: now,
        updatedAt: now
      });
    } else {
      this.store.rows.identityGroupMembers.set(id, {
        id,
        groupId,
        identityId: actor.identityId,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  async attribute({ orgId, actor, key, value }: Parameters<TGrantSeeder["attribute"]>[0]) {
    const now = new Date();
    const row: TIdentityMetadata = {
      id: randomUUID(),
      orgId,
      key,
      value,
      userId: "userId" in actor ? actor.userId : null,
      identityId: "identityId" in actor ? actor.identityId : null,
      createdAt: now,
      updatedAt: now
    };
    this.store.rows.attributes.set(row.id, row);
    return row;
  }

  async removeMembership(membershipId: string) {
    this.store.rows.memberships.delete(membershipId);
    for (const [id, assignment] of this.store.rows.membershipRoles) {
      if (assignment.membershipId === membershipId) this.store.rows.membershipRoles.delete(id);
    }
  }

  async deactivateMembership(membershipId: string) {
    const membership = this.store.rows.memberships.get(membershipId);
    if (membership) this.store.rows.memberships.set(membershipId, { ...membership, isActive: false });
  }

  async endRoleAssignment(membershipRoleId: string) {
    const assignment = this.store.rows.membershipRoles.get(membershipRoleId);
    if (assignment)
      this.store.rows.membershipRoles.set(membershipRoleId, { ...assignment, temporaryAccessEndTime: PAST() });
  }
}
