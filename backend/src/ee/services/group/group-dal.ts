import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TGroups } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import {
  EFilterReturnedIdentities,
  EFilterReturnedProjects,
  EFilterReturnedUsers,
  EGroupProjectsOrderBy
} from "./group-types";

export type TGroupDALFactory = ReturnType<typeof groupDALFactory>;

export const groupDALFactory = (db: TDbClient) => {
  const groupOrm = ormify(db, TableName.Groups);

  const findGroups = async (filter: TFindFilter<TGroups>, { offset, limit, sort, tx }: TFindOpt<TGroups> = {}) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Groups)
        // eslint-disable-next-line
        .where(buildFindFilter(filter))
        .select(selectAllTableCols(TableName.Groups));

      if (limit) void query.limit(limit);
      if (offset && offset > 0) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const res = await query;
      return res;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "Find groups" });
    }
  };

  const findByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Groups)
        .where(`${TableName.Groups}.orgId`, orgId)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .join(TableName.Membership, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(selectAllTableCols(TableName.Groups))
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.Role))
        .select(db.ref("name").as("crName").withSchema(TableName.Role))
        .select(db.ref("role").withSchema(TableName.MembershipRole))
        .select(db.ref("customRoleId").as("roleId").withSchema(TableName.MembershipRole))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.Role))
        .select(db.ref("description").as("crDescription").withSchema(TableName.Role))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.Role));

      return docs.map(({ crId, crDescription, crSlug, crPermission, crName, ...el }) => ({
        ...el,
        customRole: el.roleId
          ? {
              id: crId,
              name: crName,
              slug: crSlug,
              permissions: crPermission,
              description: crDescription
            }
          : undefined
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  // special query
  const findAllGroupPossibleMembers = async ({
    orgId,
    groupId,
    offset = 0,
    limit,
    username, // depreciated in favor of search
    search,
    filter
  }: {
    orgId: string;
    groupId: string;
    offset?: number;
    limit?: number;
    username?: string;
    search?: string;
    filter?: EFilterReturnedUsers;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .leftJoin(TableName.UserGroupMembership, (bd) => {
          bd.on(`${TableName.UserGroupMembership}.userId`, "=", `${TableName.Users}.id`).andOn(
            `${TableName.UserGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("groupId").withSchema(TableName.UserGroupMembership),
          db.ref("createdAt").withSchema(TableName.UserGroupMembership).as("joinedGroupAt"),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.raw(`count(*) OVER() as total_count`)
        )
        .where({ isGhost: false })
        .offset(offset)
        .orderBy("firstName", "asc");

      if (limit) {
        void query.limit(limit);
      }

      if (search) {
        void query.andWhereRaw(`CONCAT_WS(' ', "firstName", "lastName", lower("username")) ilike ?`, [`%${search}%`]);
      } else if (username) {
        void query.andWhereRaw(`lower("${TableName.Users}"."username") ilike ?`, `%${username}%`);
      }

      switch (filter) {
        case EFilterReturnedUsers.EXISTING_MEMBERS:
          void query.andWhere(`${TableName.UserGroupMembership}.createdAt`, "is not", null);
          break;
        case EFilterReturnedUsers.NON_MEMBERS:
          void query.andWhere(`${TableName.UserGroupMembership}.createdAt`, "is", null);
          break;
        default:
          break;
      }

      const members = await query;

      return {
        members: members.map(
          ({
            email,
            username: memberUsername,
            firstName,
            lastName,
            userId,
            groupId: memberGroupId,
            joinedGroupAt
          }) => ({
            id: userId,
            email,
            username: memberUsername,
            firstName,
            lastName,
            isPartOfGroup: !!memberGroupId,
            joinedGroupAt
          })
        ),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(members?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all user group members" });
    }
  };

  const findAllGroupPossibleIdentities = async ({
    orgId,
    groupId,
    offset = 0,
    limit,
    search,
    filter
  }: {
    orgId: string;
    groupId: string;
    offset?: number;
    limit?: number;
    search?: string;
    filter?: EFilterReturnedIdentities;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .join(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.IdentityGroupMembership, (bd) => {
          bd.on(`${TableName.IdentityGroupMembership}.identityId`, "=", `${TableName.Identity}.id`).andOn(
            `${TableName.IdentityGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("createdAt").withSchema(TableName.IdentityGroupMembership).as("joinedGroupAt"),
          db.ref("name").withSchema(TableName.Identity),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.raw(`count(*) OVER() as total_count`)
        )
        .offset(offset)
        .orderBy("name", "asc");

      if (limit) {
        void query.limit(limit);
      }

      if (search) {
        void query.andWhereRaw(`LOWER("${TableName.Identity}"."name") ilike ?`, `%${search}%`);
      }

      switch (filter) {
        case EFilterReturnedIdentities.ASSIGNED_IDENTITIES:
          void query.andWhere(`${TableName.IdentityGroupMembership}.createdAt`, "is not", null);
          break;
        case EFilterReturnedIdentities.NON_ASSIGNED_IDENTITIES:
          void query.andWhere(`${TableName.IdentityGroupMembership}.createdAt`, "is", null);
          break;
        default:
          break;
      }

      const identities = await query;

      return {
        identities: identities.map(({ name, identityId, joinedGroupAt }) => ({
          id: identityId,
          name,
          isPartOfGroup: !!groupId,
          joinedGroupAt
        })),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(identities?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all group identities" });
    }
  };

  const findAllGroupProjects = async ({
    orgId,
    groupId,
    offset,
    limit,
    search,
    filter,
    orderBy,
    orderDirection
  }: {
    orgId: string;
    groupId: string;
    offset?: number;
    limit?: number;
    search?: string;
    filter?: EFilterReturnedProjects;
    orderBy?: EGroupProjectsOrderBy;
    orderDirection?: OrderByDirection;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.Project)
        .where(`${TableName.Project}.orgId`, orgId)
        .leftJoin(TableName.Membership, (bd) => {
          bd.on(`${TableName.Project}.id`, "=", `${TableName.Membership}.scopeProjectId`)
            .andOn(`${TableName.Membership}.actorGroupId`, "=", db.raw("?", [groupId]))
            .andOn(`${TableName.Membership}.scope`, "=", db.raw("?", [AccessScope.Project]));
        })
        .select(
          db.ref("id").withSchema(TableName.Project),
          db.ref("name").withSchema(TableName.Project),
          db.ref("slug").withSchema(TableName.Project),
          db.ref("description").withSchema(TableName.Project),
          db.ref("type").withSchema(TableName.Project),
          db.ref("createdAt").withSchema(TableName.Membership).as("joinedGroupAt"),
          db.raw(`count(*) OVER() as "totalCount"`)
        )
        .offset(offset ?? 0);

      if (orderBy) {
        void query.orderByRaw(
          `LOWER(${TableName.Project}.??) ${orderDirection === OrderByDirection.ASC ? "asc" : "desc"}`,
          [orderBy]
        );
      }

      if (limit) {
        void query.limit(limit);
      }

      if (search) {
        void query.andWhereRaw(
          `CONCAT_WS(' ', "${TableName.Project}"."name", "${TableName.Project}"."slug", "${TableName.Project}"."description") ilike ?`,
          [`%${search}%`]
        );
      }

      switch (filter) {
        case EFilterReturnedProjects.ASSIGNED_PROJECTS:
          void query.whereNotNull(`${TableName.Membership}.id`);
          break;
        case EFilterReturnedProjects.UNASSIGNED_PROJECTS:
          void query.whereNull(`${TableName.Membership}.id`);
          break;
        default:
          break;
      }

      const projects = await query;

      return {
        projects: projects.map(({ joinedGroupAt, ...project }) => ({
          ...project,
          joinedGroupAt
        })),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(projects?.[0]?.totalCount ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all group projects" });
    }
  };

  const findGroupsByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Groups)
        .join(TableName.Membership, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .select(selectAllTableCols(TableName.Groups));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find groups by project id" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Groups)
        .join(TableName.Membership, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .where(`${TableName.Groups}.id`, id)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .select(
          selectAllTableCols(TableName.Groups),
          db.ref("slug").as("customRoleSlug").withSchema(TableName.Role),
          db.ref("customRoleId").as("roleId").withSchema(TableName.MembershipRole),
          db.ref("role").withSchema(TableName.MembershipRole)
        )
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  const findOne = async (filter: Partial<TGroups>, tx?: Knex): Promise<TGroups | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Groups)
        .join(TableName.Membership, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where((queryBuilder) => {
          Object.entries(filter).forEach(([key, value]) => {
            void queryBuilder.where(`${TableName.Groups}.${key}`, value);
          });
        })
        .select(
          selectAllTableCols(TableName.Groups),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").as("roleId").withSchema(TableName.MembershipRole)
        )
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  return {
    ...groupOrm,
    findGroups,
    findByOrgId,
    findAllGroupPossibleMembers,
    findAllGroupPossibleIdentities,
    findAllGroupProjects,
    findGroupsByProjectId,
    findById,
    findOne
  };
};
