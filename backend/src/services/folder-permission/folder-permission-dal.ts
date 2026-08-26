import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sqlNestRelationships } from "@app/lib/knex";

import { ActorType } from "../auth/auth-type";
import { TProjectMemberIdentity, TProjectMemberRoleRow, TProjectMemberUser } from "./folder-permission-types";

export type TFolderPermissionDALFactory = ReturnType<typeof folderPermissionDALFactory>;

type TFolderActorType = ActorType.USER | ActorType.IDENTITY;

type TProjectScope = { projectId: string; orgId: string };

type TProjectActor = { actorId: string; actorType: TFolderActorType };

type TMemberRoleQueryRow = {
  membershipRoleId: string | null;
  role: string | null;
  customRoleId: string | null;
  customRoleSlug: string | null;
  customRoleName: string | null;
  customRolePermissions: unknown;
  isTemporary: boolean | null;
  temporaryAccessEndTime: Date | null;
};

type TUserMemberQueryRow = TMemberRoleQueryRow & {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  directMembershipId: string | null;
};

type TIdentityMemberQueryRow = TMemberRoleQueryRow & {
  identityId: string;
  name: string;
  directMembershipId: string | null;
};

const $projectMemberships = (conn: Knex, { projectId, orgId }: TProjectScope) =>
  conn(TableName.Membership)
    .where(`${TableName.Membership}.scope`, AccessScope.Project)
    .where(`${TableName.Membership}.scopeProjectId`, projectId)
    .where(`${TableName.Membership}.scopeOrgId`, orgId);

const $userColumns = (conn: Knex) => [
  conn.ref("id").withSchema(TableName.Users).as("userId"),
  conn.ref("username").withSchema(TableName.Users).as("username"),
  conn.ref("email").withSchema(TableName.Users).as("email"),
  conn.ref("firstName").withSchema(TableName.Users).as("firstName"),
  conn.ref("lastName").withSchema(TableName.Users).as("lastName")
];

const $identityColumns = (conn: Knex) => [
  conn.ref("id").withSchema(TableName.Identity).as("identityId"),
  conn.ref("name").withSchema(TableName.Identity).as("name")
];

const $roleColumns = (conn: Knex) => [
  conn.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
  conn.ref("role").withSchema(TableName.MembershipRole).as("role"),
  conn.ref("customRoleId").withSchema(TableName.MembershipRole).as("customRoleId"),
  conn.ref("isTemporary").withSchema(TableName.MembershipRole).as("isTemporary"),
  conn.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole).as("temporaryAccessEndTime"),
  conn.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
  conn.ref("name").withSchema(TableName.Role).as("customRoleName"),
  conn.ref("permissions").withSchema(TableName.Role).as("customRolePermissions")
];

const $directMembershipId = (conn: Knex) => conn.ref("id").withSchema(TableName.Membership).as("directMembershipId");

// null::uuid keeps the union column typed like memberships.id in the direct branch
const $noDirectMembershipId = (conn: Knex) => conn.raw("null::uuid as ??", ["directMembershipId"]);

// sqlNestRelationships maps an actor from the first row it meets, so the direct membership row
// must sort ahead of the group rows for membershipId to be the actor's own membership.
const $memberRows = (direct: Knex.QueryBuilder, viaGroup: Knex.QueryBuilder) =>
  direct.unionAll([viaGroup], true).orderBy("directMembershipId", "asc", "last");

const $toMemberRole = (el: TMemberRoleQueryRow): TProjectMemberRoleRow => ({
  membershipRoleId: el.membershipRoleId as string,
  role: el.role ?? "",
  customRoleId: el.customRoleId,
  customRoleSlug: el.customRoleSlug,
  customRoleName: el.customRoleName,
  customRolePermissions: el.customRolePermissions ?? null,
  isTemporary: Boolean(el.isTemporary),
  temporaryAccessEndTime: el.temporaryAccessEndTime
});

const $userMembershipIds = (conn: Knex, scope: TProjectScope, userId: string) => {
  const direct: Knex.QueryBuilder = $projectMemberships(conn, scope)
    .where(`${TableName.Membership}.actorUserId`, userId)
    .select(`${TableName.Membership}.id`);

  const viaGroup = $projectMemberships(conn, scope)
    .join(
      TableName.UserGroupMembership,
      `${TableName.UserGroupMembership}.groupId`,
      `${TableName.Membership}.actorGroupId`
    )
    .whereNotNull(`${TableName.Membership}.actorGroupId`)
    .where(`${TableName.UserGroupMembership}.userId`, userId)
    .select(`${TableName.Membership}.id`);

  return direct.unionAll([viaGroup], true);
};

const $identityMembershipIds = (conn: Knex, scope: TProjectScope, identityId: string) => {
  const direct: Knex.QueryBuilder = $projectMemberships(conn, scope)
    .where(`${TableName.Membership}.actorIdentityId`, identityId)
    .select(`${TableName.Membership}.id`);

  const viaGroup = $projectMemberships(conn, scope)
    .join(
      TableName.IdentityGroupMembership,
      `${TableName.IdentityGroupMembership}.groupId`,
      `${TableName.Membership}.actorGroupId`
    )
    .whereNotNull(`${TableName.Membership}.actorGroupId`)
    .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
    .select(`${TableName.Membership}.id`);

  return direct.unionAll([viaGroup], true);
};

const $actorMembershipIds = (conn: Knex, scope: TProjectScope, { actorId, actorType }: TProjectActor) =>
  actorType === ActorType.USER
    ? $userMembershipIds(conn, scope, actorId)
    : $identityMembershipIds(conn, scope, actorId);

export const folderPermissionDALFactory = (db: TDbClient) => {
  const findProjectUsersWithRoles = async (scope: TProjectScope, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();

      const direct = $projectMemberships(conn, scope)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .leftJoin(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Users}.isGhost`, false)
        .select([...$userColumns(conn), $directMembershipId(conn), ...$roleColumns(conn)]);

      // isPending is deliberately not filtered: permission-dal.getPermission grants access on group
      // membership alone and the flag is no longer cleared when a user is accepted.
      const viaGroup = $projectMemberships(conn, scope)
        .join(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.UserGroupMembership}.userId`)
        .leftJoin(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .where(`${TableName.Users}.isGhost`, false)
        .select([...$userColumns(conn), $noDirectMembershipId(conn), ...$roleColumns(conn)]);

      const rows = (await $memberRows(direct, viaGroup)) as TUserMemberQueryRow[];

      return sqlNestRelationships({
        data: rows,
        key: "userId",
        parentMapper: (el): { actor: TProjectMemberUser } => ({
          actor: {
            userId: el.userId,
            username: el.username,
            email: el.email,
            firstName: el.firstName,
            lastName: el.lastName,
            membershipId: el.directMembershipId
          }
        }),
        childrenMapper: [{ key: "membershipRoleId", label: "roles" as const, mapper: $toMemberRole }]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectUsersWithRoles" });
    }
  };

  const findProjectIdentitiesWithRoles = async (scope: TProjectScope, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();

      const direct = $projectMemberships(conn, scope)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .leftJoin(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .select([...$identityColumns(conn), $directMembershipId(conn), ...$roleColumns(conn)]);

      const viaGroup = $projectMemberships(conn, scope)
        .join(
          TableName.IdentityGroupMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityGroupMembership}.identityId`)
        .leftJoin(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .select([...$identityColumns(conn), $noDirectMembershipId(conn), ...$roleColumns(conn)]);

      const rows = (await $memberRows(direct, viaGroup)) as TIdentityMemberQueryRow[];

      return sqlNestRelationships({
        data: rows,
        key: "identityId",
        parentMapper: (el): { actor: TProjectMemberIdentity } => ({
          actor: { identityId: el.identityId, name: el.name, membershipId: el.directMembershipId }
        }),
        childrenMapper: [{ key: "membershipRoleId", label: "roles" as const, mapper: $toMemberRole }]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectIdentitiesWithRoles" });
    }
  };

  // Memberships are tracked by createdAt, not updatedAt: every login bumps Membership.updatedAt
  // (lastLoginTime), which would bust the cached folder access on any member's sign-in.
  const getFolderAccessFingerprint = async (
    { projectId, orgId, actorType }: TProjectScope & { actorType: TFolderActorType },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const scope = { projectId, orgId };
      const countAndMax = (column: string) => conn.raw(`concat(count(*), ':', max(??))`, [column]);

      const memberships = $projectMemberships(conn, scope).select(countAndMax(`${TableName.Membership}.createdAt`));

      const membershipRoles = $projectMemberships(conn, scope)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .select(countAndMax(`${TableName.MembershipRole}.updatedAt`));

      const roles = conn(TableName.Role)
        .where(`${TableName.Role}.projectId`, projectId)
        .select(conn.raw(`coalesce(max(??)::text, '')`, [`${TableName.Role}.updatedAt`]));

      const userGroupMemberships = $projectMemberships(conn, scope)
        .join(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .select(countAndMax(`${TableName.UserGroupMembership}.createdAt`));

      const identityGroupMemberships = $projectMemberships(conn, scope)
        .join(
          TableName.IdentityGroupMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .select(countAndMax(`${TableName.IdentityGroupMembership}.createdAt`));

      const groupMemberships = actorType === ActorType.USER ? userGroupMemberships : identityGroupMemberships;

      const row = await conn
        .select(
          memberships.as("memberships"),
          membershipRoles.as("membershipRoles"),
          roles.as("roles"),
          groupMemberships.as("groupMemberships")
        )
        .first<{ memberships: string; membershipRoles: string; roles: string; groupMemberships: string }>();

      return [row?.memberships, row?.membershipRoles, row?.roles, row?.groupMemberships].join("|");
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderAccessFingerprint" });
    }
  };

  const hasProjectAccess = async (
    { projectId, orgId, actorId, actorType }: TProjectScope & TProjectActor,
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const row = await conn
        .from($actorMembershipIds(conn, { projectId, orgId }, { actorId, actorType }).as("actor_memberships"))
        .first<{ id: string } | undefined>("id");
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderPermissionHasProjectAccess" });
    }
  };

  // Built-in admin role only: a custom role slugged "admin" stores role='custom' and is a regular
  // grantee. Mirrors isActiveRole (permission-fns.ts) so an expired temporary admin does not count.
  // Folder grants replace base permissions at the granted path, so for an admin they could only
  // remove privileges; admins are therefore never accepted as grant targets.
  const isProjectAdmin = async ({ projectId, orgId, actorId, actorType }: TProjectScope & TProjectActor, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const row = await conn(TableName.MembershipRole)
        .whereIn(
          `${TableName.MembershipRole}.membershipId`,
          $actorMembershipIds(conn, { projectId, orgId }, { actorId, actorType })
        )
        .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
        .where((qb) => {
          void qb
            .where(`${TableName.MembershipRole}.isTemporary`, false)
            .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", new Date());
        })
        .first<{ id: string } | undefined>(`${TableName.MembershipRole}.id`);
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderPermissionIsProjectAdmin" });
    }
  };

  return {
    findProjectUsersWithRoles,
    findProjectIdentitiesWithRoles,
    getFolderAccessFingerprint,
    hasProjectAccess,
    isProjectAdmin
  };
};
