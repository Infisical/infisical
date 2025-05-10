import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TGroups } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

import { EFilterReturnedUsers } from "./group-types";

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
      if (offset) void query.limit(offset);
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
        .leftJoin(TableName.OrgRoles, `${TableName.Groups}.roleId`, `${TableName.OrgRoles}.id`)
        .select(selectAllTableCols(TableName.Groups))
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles));
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
        .replicaNode()(TableName.OrgMembership)
        .where(`${TableName.OrgMembership}.orgId`, orgId)
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.UserGroupMembership, (bd) => {
          bd.on(`${TableName.UserGroupMembership}.userId`, "=", `${TableName.Users}.id`).andOn(
            `${TableName.UserGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.OrgMembership),
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
        void query.andWhereRaw(`CONCAT_WS(' ', "firstName", "lastName", "username") ilike ?`, [`%${search}%`]);
      } else if (username) {
        void query.andWhere(`${TableName.Users}.username`, "ilike", `%${username}%`);
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

  const findGroupsByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Groups)
        .join(TableName.GroupProjectMembership, `${TableName.Groups}.id`, `${TableName.GroupProjectMembership}.groupId`)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.Groups));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find groups by project id" });
    }
  };

  return {
    findGroups,
    findByOrgId,
    findAllGroupPossibleMembers,
    findGroupsByProjectId,
    ...groupOrm
  };
};
