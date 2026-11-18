import { randomUUID } from "node:crypto";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

import { PAST, TGrantSeeder, TSeedActor, temporaryColumns } from "./grant-fixture";

export class KnexGrantSeeder implements TGrantSeeder {
  constructor(private readonly db: TDbClient) {}

  async role({ owner, slug, permissions = [] }: Parameters<TGrantSeeder["role"]>[0]) {
    const [row] = await this.db(TableName.Role)
      .insert({ ...owner, name: slug, slug, permissions: JSON.stringify(permissions) })
      .returning("*");
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
    const [membership] = await this.db(TableName.Membership)
      .insert({
        scope,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        scopeResourceType: resourceType,
        scopeResourceId: resourceId,
        actorUserId: "userId" in actor ? actor.userId : undefined,
        actorIdentityId: "identityId" in actor ? actor.identityId : undefined,
        actorGroupId: "groupId" in actor ? actor.groupId : undefined,
        isActive
      })
      .returning("*");
    const assignments = roles.length
      ? await this.db(TableName.MembershipRole)
          .insert(
            roles.map(({ role, customRoleId, temporaryAccessEndTime }) => ({
              membershipId: membership.id,
              role,
              customRoleId,
              ...temporaryColumns(temporaryAccessEndTime)
            }))
          )
          .returning("*")
      : [];
    return { ...membership, roles: assignments };
  }

  async privilege({ actor, orgId, projectId, permissions = [], folder }: Parameters<TGrantSeeder["privilege"]>[0]) {
    const [row] = await this.db(TableName.AdditionalPrivilege)
      .insert({
        name: `privilege-${randomUUID()}`,
        actorUserId: "userId" in actor ? actor.userId : undefined,
        actorIdentityId: "identityId" in actor ? actor.identityId : undefined,
        orgId,
        projectId,
        permissions: JSON.stringify(permissions),
        folderId: folder?.id,
        role: folder?.role
      })
      .returning("*");
    return row;
  }

  async group({ orgId }: { orgId: string }) {
    const id = randomUUID();
    const [row] = await this.db(TableName.Groups)
      .insert({ orgId, name: `group-${id}`, slug: `group-${id}` })
      .returning("*");
    return row;
  }

  async groupMember({ groupId, ...actor }: { groupId: string } & TSeedActor) {
    if ("userId" in actor) {
      await this.db(TableName.UserGroupMembership).insert({ groupId, userId: actor.userId });
    } else {
      await this.db(TableName.IdentityGroupMembership).insert({ groupId, identityId: actor.identityId });
    }
  }

  async attribute({ orgId, actor, key, value }: Parameters<TGrantSeeder["attribute"]>[0]) {
    const [row] = await this.db(TableName.IdentityMetadata)
      .insert({
        orgId,
        key,
        value,
        userId: "userId" in actor ? actor.userId : undefined,
        identityId: "identityId" in actor ? actor.identityId : undefined
      })
      .returning("*");
    return row;
  }

  async removeMembership(membershipId: string) {
    await this.db(TableName.Membership).where({ id: membershipId }).delete();
  }

  async deactivateMembership(membershipId: string) {
    await this.db(TableName.Membership).where({ id: membershipId }).update({ isActive: false });
  }

  async endRoleAssignment(membershipRoleId: string) {
    await this.db(TableName.MembershipRole).where({ id: membershipRoleId }).update({ temporaryAccessEndTime: PAST() });
  }
}
