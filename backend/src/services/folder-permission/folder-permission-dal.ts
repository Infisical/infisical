import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TAdditionalPrivileges } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";

import { ActorType } from "../auth/auth-type";

export type TFolderPermissionDALFactory = ReturnType<typeof folderPermissionDALFactory>;

// UNION (not UNION ALL): a single actor can be reached both directly and through several groups.
type TFindFolderAccessActorsDAL = {
  projectId: string;
  orgId: string;
  folderId: string;
  search?: string;
  limit: number;
  offset: number;
};

// Nullable columns come back from knex as `T | null | undefined` because the generated table types
// mark them optional, so every field here has to tolerate undefined and be normalized below.
type TMaybe<T> = T | null | undefined;

const $folderAccessSelect = (db: Knex) => [
  db.ref("id").withSchema(TableName.AdditionalPrivilege).as("folderAccessId"),
  db.ref("role").withSchema(TableName.AdditionalPrivilege).as("folderAccessRole"),
  db.ref("isTemporary").withSchema(TableName.AdditionalPrivilege).as("folderAccessIsTemporary"),
  db.ref("temporaryMode").withSchema(TableName.AdditionalPrivilege).as("folderAccessTemporaryMode"),
  db.ref("temporaryRange").withSchema(TableName.AdditionalPrivilege).as("folderAccessTemporaryRange"),
  db
    .ref("temporaryAccessStartTime")
    .withSchema(TableName.AdditionalPrivilege)
    .as("folderAccessTemporaryAccessStartTime"),
  db.ref("temporaryAccessEndTime").withSchema(TableName.AdditionalPrivilege).as("folderAccessTemporaryAccessEndTime"),
  db.ref("createdAt").withSchema(TableName.AdditionalPrivilege).as("folderAccessCreatedAt"),
  db.ref("updatedAt").withSchema(TableName.AdditionalPrivilege).as("folderAccessUpdatedAt")
];

type TFolderAccessRow = {
  folderAccessId: TMaybe<string>;
  folderAccessRole: TMaybe<string>;
  folderAccessIsTemporary: TMaybe<boolean>;
  folderAccessTemporaryMode: TMaybe<string>;
  folderAccessTemporaryRange: TMaybe<string>;
  folderAccessTemporaryAccessStartTime: TMaybe<Date>;
  folderAccessTemporaryAccessEndTime: TMaybe<Date>;
  folderAccessCreatedAt: TMaybe<Date>;
  folderAccessUpdatedAt: TMaybe<Date>;
};

type TFolderAccessGrantRow = Pick<
  TAdditionalPrivileges,
  | "id"
  | "role"
  | "isTemporary"
  | "temporaryMode"
  | "temporaryRange"
  | "temporaryAccessStartTime"
  | "temporaryAccessEndTime"
  | "createdAt"
  | "updatedAt"
>;

type TUserFolderAccessQueryRow = TFolderAccessRow & {
  userId: string;
  username: string;
  email: TMaybe<string>;
  firstName: TMaybe<string>;
  lastName: TMaybe<string>;
};

type TIdentityFolderAccessQueryRow = TFolderAccessRow & {
  identityId: string;
  name: string;
};

const $mapFolderAccess = (el: TFolderAccessRow): TFolderAccessGrantRow | null => {
  if (!el.folderAccessId || !el.folderAccessCreatedAt || !el.folderAccessUpdatedAt) return null;
  return {
    id: el.folderAccessId,
    role: el.folderAccessRole ?? null,
    isTemporary: Boolean(el.folderAccessIsTemporary),
    temporaryMode: el.folderAccessTemporaryMode ?? null,
    temporaryRange: el.folderAccessTemporaryRange ?? null,
    temporaryAccessStartTime: el.folderAccessTemporaryAccessStartTime ?? null,
    temporaryAccessEndTime: el.folderAccessTemporaryAccessEndTime ?? null,
    createdAt: el.folderAccessCreatedAt,
    updatedAt: el.folderAccessUpdatedAt
  };
};

const $projectScoped = (projectId: string, orgId: string) => (qb: Knex.QueryBuilder) => {
  void qb
    .where(`${TableName.Membership}.scope`, AccessScope.Project)
    .where(`${TableName.Membership}.scopeProjectId`, projectId)
    .where(`${TableName.Membership}.scopeOrgId`, orgId);
};

export const folderPermissionDALFactory = (db: TDbClient) => {
  // Bound to the user/identity id, not Membership.actor*Id, which is NULL on a group membership row.
  // permission-dal.ts documents the same bug: the column-to-column form silently dropped privileges
  // for every actor whose only project access came through a group.
  const $joinFolderGrant = (actorTable: TableName.Users | TableName.Identity, folderId: string) => {
    const privilegeActorColumn = actorTable === TableName.Users ? "actorUserId" : "actorIdentityId";

    return (qb: Knex.QueryBuilder) => {
      void qb.leftJoin(TableName.AdditionalPrivilege, (bd) => {
        void bd
          .on(`${TableName.AdditionalPrivilege}.${privilegeActorColumn}`, `${actorTable}.id`)
          .andOn(`${TableName.AdditionalPrivilege}.folderId`, "=", db.raw("?", [folderId]));
      });
    };
  };

  const $userSelect = () => [
    db.ref("id").withSchema(TableName.Users).as("userId"),
    db.ref("username").withSchema(TableName.Users).as("username"),
    db.ref("email").withSchema(TableName.Users).as("email"),
    db.ref("firstName").withSchema(TableName.Users).as("firstName"),
    db.ref("lastName").withSchema(TableName.Users).as("lastName"),
    ...$folderAccessSelect(db)
  ];

  const $searchUsers = (search?: string) => (qb: Knex.QueryBuilder) => {
    if (!search) return;
    const term = `%${sanitizeSqlLikeString(search)}%`;
    // grouped so the ORs cannot escape the project scope predicates
    void qb.where((bd) => {
      void bd
        .whereILike(`${TableName.Users}.username`, term)
        .orWhereILike(`${TableName.Users}.email`, term)
        .orWhereILike(`${TableName.Users}.firstName`, term)
        .orWhereILike(`${TableName.Users}.lastName`, term);
    });
  };

  const $identitySelect = () => [
    db.ref("id").withSchema(TableName.Identity).as("identityId"),
    db.ref("name").withSchema(TableName.Identity).as("name"),
    ...$folderAccessSelect(db)
  ];

  const $searchIdentities = (search?: string) => (qb: Knex.QueryBuilder) => {
    if (!search) return;
    void qb.whereILike(`${TableName.Identity}.name`, `%${sanitizeSqlLikeString(search)}%`);
  };

  const $toUserRow = (el: TUserFolderAccessQueryRow) => ({
    userId: el.userId,
    username: el.username,
    email: el.email ?? null,
    firstName: el.firstName ?? null,
    lastName: el.lastName ?? null,
    folderAccess: $mapFolderAccess(el)
  });

  const $toIdentityRow = (el: TIdentityFolderAccessQueryRow) => ({
    identityId: el.identityId,
    name: el.name,
    folderAccess: $mapFolderAccess(el)
  });

  const $usersUnion = (
    conn: Knex,
    { projectId, orgId, folderId, search }: Omit<TFindFolderAccessActorsDAL, "limit" | "offset">
  ) => {
    const direct = conn(TableName.Membership)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
      .modify($projectScoped(projectId, orgId))
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .where(`${TableName.Users}.isGhost`, false)
      .modify($joinFolderGrant(TableName.Users, folderId))
      .modify($searchUsers(search))
      .select($userSelect());

    // isPending is deliberately not filtered: permission-dal.getPermission grants access on group
    // membership alone and the flag is no longer cleared when a user is accepted, so filtering it
    // would hide real access. membership_unique_group_project is partial on `actorGroupId IS NOT
    // NULL`, so without that predicate the planner has no usable index and seq-scans memberships.
    const viaGroup = conn(TableName.UserGroupMembership)
      .join(TableName.Membership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Membership}.actorGroupId`)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.UserGroupMembership}.userId`)
      .modify($projectScoped(projectId, orgId))
      .whereNotNull(`${TableName.Membership}.actorGroupId`)
      .where(`${TableName.Users}.isGhost`, false)
      .modify($joinFolderGrant(TableName.Users, folderId))
      .modify($searchUsers(search))
      .select($userSelect());

    return direct.union([viaGroup], true);
  };

  const $identitiesUnion = (
    conn: Knex,
    { projectId, orgId, folderId, search }: Omit<TFindFolderAccessActorsDAL, "limit" | "offset">
  ) => {
    const direct = conn(TableName.Membership)
      .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
      .modify($projectScoped(projectId, orgId))
      .whereNotNull(`${TableName.Membership}.actorIdentityId`)
      .modify($joinFolderGrant(TableName.Identity, folderId))
      .modify($searchIdentities(search))
      .select($identitySelect());

    const viaGroup = conn(TableName.IdentityGroupMembership)
      .join(
        TableName.Membership,
        `${TableName.IdentityGroupMembership}.groupId`,
        `${TableName.Membership}.actorGroupId`
      )
      .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityGroupMembership}.identityId`)
      .modify($projectScoped(projectId, orgId))
      .whereNotNull(`${TableName.Membership}.actorGroupId`)
      .modify($joinFolderGrant(TableName.Identity, folderId))
      .modify($searchIdentities(search))
      .select($identitySelect());

    return direct.union([viaGroup], true);
  };

  const findUsersWithFolderAccess = async (
    { projectId, orgId, folderId, search, limit, offset }: TFindFolderAccessActorsDAL,
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const selector = { projectId, orgId, folderId, search };

      const [docs, countRow] = (await Promise.all([
        conn
          .from($usersUnion(conn, selector).as("folder_access_users"))
          .orderByRaw("lower(coalesce(??, ''))", ["username"])
          .orderBy("userId")
          .limit(limit)
          .offset(offset),
        conn.from($usersUnion(conn, selector).as("folder_access_users")).count("* as count").first()
      ])) as [TUserFolderAccessQueryRow[], { count?: string | number } | undefined];

      return {
        users: docs.map($toUserRow),
        totalCount: Number(countRow?.count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindUsersWithFolderAccess" });
    }
  };

  const findIdentitiesWithFolderAccess = async (
    { projectId, orgId, folderId, search, limit, offset }: TFindFolderAccessActorsDAL,
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const selector = { projectId, orgId, folderId, search };

      const [docs, countRow] = (await Promise.all([
        conn
          .from($identitiesUnion(conn, selector).as("folder_access_identities"))
          .orderByRaw("lower(coalesce(??, ''))", ["name"])
          .orderBy("identityId")
          .limit(limit)
          .offset(offset),
        conn.from($identitiesUnion(conn, selector).as("folder_access_identities")).count("* as count").first()
      ])) as [TIdentityFolderAccessQueryRow[], { count?: string | number } | undefined];

      return {
        identities: docs.map($toIdentityRow),
        totalCount: Number(countRow?.count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindIdentitiesWithFolderAccess" });
    }
  };

  // Access can be inherited from a group, so this is two lookups rather than one membership read.
  // The direct check runs first because it is the common case and short-circuits.
  const hasProjectAccess = async (
    {
      projectId,
      orgId,
      actorId,
      actorType
    }: { projectId: string; orgId: string; actorId: string; actorType: ActorType.USER | ActorType.IDENTITY },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const isIdentity = actorType === ActorType.IDENTITY;
      const groupTable = isIdentity ? TableName.IdentityGroupMembership : TableName.UserGroupMembership;
      const groupActorColumn = isIdentity ? "identityId" : "userId";

      const direct = (await conn(TableName.Membership)
        .modify($projectScoped(projectId, orgId))
        .where(`${TableName.Membership}.${isIdentity ? "actorIdentityId" : "actorUserId"}`, actorId)
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

  return {
    findUsersWithFolderAccess,
    findIdentitiesWithFolderAccess,
    hasProjectAccess
  };
};
