import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sqlNestRelationships } from "@app/lib/knex";

import { ActorType } from "../auth/auth-type";
import { TRosterIdentity, TRosterRoleRow, TRosterUser } from "./folder-permission-types";

export type TFolderPermissionDALFactory = ReturnType<typeof folderPermissionDALFactory>;

type TFolderActorType = ActorType.USER | ActorType.IDENTITY;

type TProjectScope = { projectId: string; orgId: string };

// Nullable columns come back from knex as `T | null | undefined` because the generated table types
// mark them optional, so every field here has to tolerate undefined and be normalized below.
type TMaybe<T> = T | null | undefined;

type TRosterRoleQueryRow = {
  membershipRoleId: TMaybe<string>;
  role: TMaybe<string>;
  customRoleId: TMaybe<string>;
  customRoleSlug: TMaybe<string>;
  customRoleName: TMaybe<string>;
  customRolePermissions: unknown;
  isTemporary: TMaybe<boolean>;
  temporaryAccessEndTime: TMaybe<Date>;
};

type TUserRosterQueryRow = TRosterRoleQueryRow & {
  userId: string;
  username: string;
  email: TMaybe<string>;
  firstName: TMaybe<string>;
  lastName: TMaybe<string>;
  membershipId: TMaybe<string>;
};

type TIdentityRosterQueryRow = TRosterRoleQueryRow & {
  identityId: string;
  name: string;
  membershipId: TMaybe<string>;
};

const ROSTER_ROLE_COLUMNS = [
  "membershipRoleId",
  "role",
  "customRoleId",
  "isTemporary",
  "temporaryAccessEndTime",
  "customRoleSlug",
  "customRoleName",
  "customRolePermissions"
] as const;

const $actorColumns = (actorType: TFolderActorType) => {
  const isIdentity = actorType === ActorType.IDENTITY;
  return {
    membershipActorColumn: isIdentity ? "actorIdentityId" : "actorUserId",
    groupTable: isIdentity ? TableName.IdentityGroupMembership : TableName.UserGroupMembership,
    groupActorColumn: isIdentity ? "identityId" : "userId"
  };
};

const $projectScoped = (projectId: string, orgId: string) => (qb: Knex.QueryBuilder) => {
  void qb
    .where(`${TableName.Membership}.scope`, AccessScope.Project)
    .where(`${TableName.Membership}.scopeProjectId`, projectId)
    .where(`${TableName.Membership}.scopeOrgId`, orgId);
};

// Built-in admin role only: a custom role slugged "admin" stores role='custom' and is a regular
// grantee. Mirrors isActiveRole (permission-fns.ts) so an expired temporary admin does not count.
const $activeAdminRole = (qb: Knex.QueryBuilder) => {
  void qb
    .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
    .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
    .where((bd) => {
      void bd
        .where(`${TableName.MembershipRole}.isTemporary`, false)
        .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", new Date());
    });
};

// Subquery of actor ids holding an active project admin role, directly or through a group. Folder
// grants replace base permissions at the granted path, so for an admin they could only remove
// privileges; admins are therefore neither listed as candidates nor accepted as grant targets.
const $projectAdminActorIds = (
  conn: Knex,
  { projectId, orgId, actorType, actorId }: TProjectScope & { actorType: TFolderActorType; actorId?: string }
) => {
  const { membershipActorColumn, groupTable, groupActorColumn } = $actorColumns(actorType);

  const direct = conn(TableName.Membership)
    .modify($projectScoped(projectId, orgId))
    .whereNotNull(`${TableName.Membership}.${membershipActorColumn}`)
    .modify($activeAdminRole)
    .modify((qb) => {
      if (actorId) void qb.where(`${TableName.Membership}.${membershipActorColumn}`, actorId);
    })
    .select(`${TableName.Membership}.${membershipActorColumn} as actorId`);

  const viaGroup = conn(groupTable)
    .join(TableName.Membership, `${groupTable}.groupId`, `${TableName.Membership}.actorGroupId`)
    .modify($projectScoped(projectId, orgId))
    .whereNotNull(`${TableName.Membership}.actorGroupId`)
    .modify($activeAdminRole)
    .modify((qb) => {
      if (actorId) void qb.where(`${groupTable}.${groupActorColumn}`, actorId);
    })
    .select(`${groupTable}.${groupActorColumn} as actorId`);

  return direct.union([viaGroup]);
};

const $rosterRoleSelect = (conn: Knex, actorIdColumn: string) => [
  conn.ref(actorIdColumn).as("actorId"),
  conn.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
  conn.ref("role").withSchema(TableName.MembershipRole).as("role"),
  conn.ref("customRoleId").withSchema(TableName.MembershipRole).as("customRoleId"),
  conn.ref("isTemporary").withSchema(TableName.MembershipRole).as("isTemporary"),
  conn.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole).as("temporaryAccessEndTime"),
  conn.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
  conn.ref("name").withSchema(TableName.Role).as("customRoleName"),
  conn.ref("permissions").withSchema(TableName.Role).as("customRolePermissions")
];

// Every membership_roles row an actor holds in the project, whether the membership is their own or
// one of their groups', keyed by the actor id so it can be joined onto the actor roster.
const $rosterRolesUnion = (conn: Knex, { projectId, orgId }: TProjectScope, actorType: TFolderActorType) => {
  const { membershipActorColumn, groupTable, groupActorColumn } = $actorColumns(actorType);
  const $withRoles = (qb: Knex.QueryBuilder) => {
    void qb
      .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
      .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`);
  };

  const direct = conn(TableName.Membership)
    .modify($projectScoped(projectId, orgId))
    .whereNotNull(`${TableName.Membership}.${membershipActorColumn}`)
    .modify($withRoles)
    .select($rosterRoleSelect(conn, `${TableName.Membership}.${membershipActorColumn}`));

  const viaGroup = conn(groupTable)
    .join(TableName.Membership, `${groupTable}.groupId`, `${TableName.Membership}.actorGroupId`)
    .modify($projectScoped(projectId, orgId))
    .whereNotNull(`${TableName.Membership}.actorGroupId`)
    .modify($withRoles)
    .select($rosterRoleSelect(conn, `${groupTable}.${groupActorColumn}`));

  return direct.unionAll([viaGroup], true);
};

const $toRosterRole = (el: TRosterRoleQueryRow): TRosterRoleRow => ({
  membershipRoleId: el.membershipRoleId as string,
  role: el.role ?? "",
  customRoleId: el.customRoleId ?? null,
  customRoleSlug: el.customRoleSlug ?? null,
  customRoleName: el.customRoleName ?? null,
  customRolePermissions: el.customRolePermissions ?? null,
  isTemporary: Boolean(el.isTemporary),
  temporaryAccessEndTime: el.temporaryAccessEndTime ?? null
});

export const folderPermissionDALFactory = (db: TDbClient) => {
  // The direct-membership id is resolved with the same correlated subquery in both union branches
  // so an actor reachable directly and through a group still dedupes; NULL for group-only actors,
  // whose membership rows have actor*Id = NULL.
  const $directMembershipId = (
    { projectId, orgId }: TProjectScope,
    actorType: TFolderActorType,
    actorTable: TableName.Users | TableName.Identity
  ) =>
    db(TableName.Membership)
      .modify($projectScoped(projectId, orgId))
      .where(`${TableName.Membership}.${$actorColumns(actorType).membershipActorColumn}`, db.ref(`${actorTable}.id`))
      .select(`${TableName.Membership}.id`)
      .limit(1)
      .as("membershipId");

  const $userSelect = (scope: TProjectScope) => [
    db.ref("id").withSchema(TableName.Users).as("userId"),
    db.ref("username").withSchema(TableName.Users).as("username"),
    db.ref("email").withSchema(TableName.Users).as("email"),
    db.ref("firstName").withSchema(TableName.Users).as("firstName"),
    db.ref("lastName").withSchema(TableName.Users).as("lastName"),
    $directMembershipId(scope, ActorType.USER, TableName.Users)
  ];

  const $identitySelect = (scope: TProjectScope) => [
    db.ref("id").withSchema(TableName.Identity).as("identityId"),
    db.ref("name").withSchema(TableName.Identity).as("name"),
    $directMembershipId(scope, ActorType.IDENTITY, TableName.Identity)
  ];

  // UNION (not UNION ALL): a single actor can be reached both directly and through several groups.
  const $usersUnion = (conn: Knex, scope: TProjectScope) => {
    const direct = conn(TableName.Membership)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
      .modify($projectScoped(scope.projectId, scope.orgId))
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .where(`${TableName.Users}.isGhost`, false)
      .select($userSelect(scope));

    // isPending is deliberately not filtered: permission-dal.getPermission grants access on group
    // membership alone and the flag is no longer cleared when a user is accepted, so filtering it
    // would hide real access. membership_unique_group_project is partial on `actorGroupId IS NOT
    // NULL`, so without that predicate the planner has no usable index and seq-scans memberships.
    const viaGroup = conn(TableName.UserGroupMembership)
      .join(TableName.Membership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Membership}.actorGroupId`)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.UserGroupMembership}.userId`)
      .modify($projectScoped(scope.projectId, scope.orgId))
      .whereNotNull(`${TableName.Membership}.actorGroupId`)
      .where(`${TableName.Users}.isGhost`, false)
      .select($userSelect(scope));

    return direct.union([viaGroup], true);
  };

  const $identitiesUnion = (conn: Knex, scope: TProjectScope) => {
    const direct = conn(TableName.Membership)
      .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
      .modify($projectScoped(scope.projectId, scope.orgId))
      .whereNotNull(`${TableName.Membership}.actorIdentityId`)
      .select($identitySelect(scope));

    const viaGroup = conn(TableName.IdentityGroupMembership)
      .join(
        TableName.Membership,
        `${TableName.IdentityGroupMembership}.groupId`,
        `${TableName.Membership}.actorGroupId`
      )
      .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityGroupMembership}.identityId`)
      .modify($projectScoped(scope.projectId, scope.orgId))
      .whereNotNull(`${TableName.Membership}.actorGroupId`)
      .select($identitySelect(scope));

    return direct.union([viaGroup], true);
  };

  const $selectRoster = (
    conn: Knex,
    actors: Knex.QueryBuilder,
    actorIdColumn: string,
    scope: TProjectScope,
    actorType: TFolderActorType
  ) =>
    conn
      .from(actors.as("roster"))
      .leftJoin(
        $rosterRolesUnion(conn, scope, actorType).as("roster_roles"),
        "roster_roles.actorId",
        `roster.${actorIdColumn}`
      )
      .select("roster.*", ...ROSTER_ROLE_COLUMNS.map((column) => `roster_roles.${column}`));

  const findProjectUserRoster = async (scope: TProjectScope, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const docs = (await $selectRoster(
        conn,
        $usersUnion(conn, scope),
        "userId",
        scope,
        ActorType.USER
      )) as TUserRosterQueryRow[];

      return sqlNestRelationships({
        data: docs,
        key: "userId",
        parentMapper: (el) => ({
          actor: {
            userId: el.userId,
            username: el.username,
            email: el.email ?? null,
            firstName: el.firstName ?? null,
            lastName: el.lastName ?? null,
            membershipId: el.membershipId ?? null
          } as TRosterUser
        }),
        childrenMapper: [{ key: "membershipRoleId", label: "roles" as const, mapper: $toRosterRole }]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectUserRoster" });
    }
  };

  const findProjectIdentityRoster = async (scope: TProjectScope, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const docs = (await $selectRoster(
        conn,
        $identitiesUnion(conn, scope),
        "identityId",
        scope,
        ActorType.IDENTITY
      )) as TIdentityRosterQueryRow[];

      return sqlNestRelationships({
        data: docs,
        key: "identityId",
        parentMapper: (el) => ({
          actor: { identityId: el.identityId, name: el.name, membershipId: el.membershipId ?? null } as TRosterIdentity
        }),
        childrenMapper: [{ key: "membershipRoleId", label: "roles" as const, mapper: $toRosterRole }]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectIdentityRoster" });
    }
  };

  // Memberships are tracked by createdAt, not updatedAt: every login bumps Membership.updatedAt
  // (lastLoginTime), which would bust the roster on any member's sign-in.
  const getFolderAccessRosterFingerprint = async (
    { projectId, orgId, actorType }: TProjectScope & { actorType: TFolderActorType },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const { groupTable } = $actorColumns(actorType);
      const countAndMax = (column: string) => conn.raw(`count(*) || ':' || coalesce(max(??)::text, '')`, [column]);

      const row = await conn
        .select(
          conn(TableName.Membership)
            .modify($projectScoped(projectId, orgId))
            .select(countAndMax(`${TableName.Membership}.createdAt`))
            .as("memberships"),
          conn(TableName.MembershipRole)
            .join(TableName.Membership, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
            .modify($projectScoped(projectId, orgId))
            .select(countAndMax(`${TableName.MembershipRole}.updatedAt`))
            .as("membershipRoles"),
          conn(TableName.Role)
            .where(`${TableName.Role}.projectId`, projectId)
            .select(conn.raw(`coalesce(max(??)::text, '')`, [`${TableName.Role}.updatedAt`]))
            .as("roles"),
          conn(groupTable)
            .join(TableName.Membership, `${groupTable}.groupId`, `${TableName.Membership}.actorGroupId`)
            .modify($projectScoped(projectId, orgId))
            .whereNotNull(`${TableName.Membership}.actorGroupId`)
            .select(countAndMax(`${groupTable}.createdAt`))
            .as("groupMemberships")
        )
        .first<{ memberships: string; membershipRoles: string; roles: string; groupMemberships: string }>();

      return [row?.memberships, row?.membershipRoles, row?.roles, row?.groupMemberships].join("|");
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderAccessRosterFingerprint" });
    }
  };

  // Access can be inherited from a group, so this is two lookups rather than one membership read.
  // The direct check runs first because it is the common case and short-circuits.
  const hasProjectAccess = async (
    { projectId, orgId, actorId, actorType }: TProjectScope & { actorId: string; actorType: TFolderActorType },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const { membershipActorColumn, groupTable, groupActorColumn } = $actorColumns(actorType);

      const direct = (await conn(TableName.Membership)
        .modify($projectScoped(projectId, orgId))
        .where(`${TableName.Membership}.${membershipActorColumn}`, actorId)
        .first(`${TableName.Membership}.id`)) as unknown as { id: string } | undefined;
      if (direct) return true;

      const viaGroup = (await conn(groupTable)
        .join(TableName.Membership, `${groupTable}.groupId`, `${TableName.Membership}.actorGroupId`)
        .modify($projectScoped(projectId, orgId))
        .where(`${groupTable}.${groupActorColumn}`, actorId)
        .first(`${TableName.Membership}.id`)) as unknown as { id: string } | undefined;

      return Boolean(viaGroup);
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderPermissionHasProjectAccess" });
    }
  };

  const isProjectAdmin = async (
    { projectId, orgId, actorId, actorType }: TProjectScope & { actorId: string; actorType: TFolderActorType },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const row = await conn
        .from($projectAdminActorIds(conn, { projectId, orgId, actorType, actorId }).as("project_admin_actors"))
        .first<{ actorId: string } | undefined>();
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "FolderPermissionIsProjectAdmin" });
    }
  };

  return {
    findProjectUserRoster,
    findProjectIdentityRoster,
    getFolderAccessRosterFingerprint,
    hasProjectAccess,
    isProjectAdmin
  };
};
