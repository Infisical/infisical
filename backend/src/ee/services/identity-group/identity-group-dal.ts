import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityGroups } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

import { EFilterReturnedIdentities } from "./identity-group-types";

export type TIdentityGroupDALFactory = ReturnType<typeof identityGroupDALFactory>;

export const identityGroupDALFactory = (db: TDbClient) => {
  const identityGroupOrm = ormify(db, TableName.IdentityGroups);

  const findIdentityGroups = async (
    filter: TFindFilter<TIdentityGroups>,
    { offset, limit, sort, tx }: TFindOpt<TIdentityGroups> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.IdentityGroups)
        // eslint-disable-next-line
        .where(buildFindFilter(filter))
        .select(selectAllTableCols(TableName.IdentityGroups));

      if (limit) void query.limit(limit);
      if (offset) void query.limit(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const res = await query;
      return res;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "Find identity groups" });
    }
  };

  const findByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityGroups)
        .where(`${TableName.IdentityGroups}.orgId`, orgId)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityGroups}.roleId`, `${TableName.OrgRoles}.id`)
        .select(selectAllTableCols(TableName.IdentityGroups))
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

  // special query to find all possible identity members for a group
  const findAllIdentityGroupPossibleMembers = async ({
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
        .replicaNode()(TableName.IdentityOrgMembership)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.IdentityGroupMembership, (bd) => {
          bd.on(`${TableName.IdentityGroupMembership}.identityId`, "=", `${TableName.Identity}.id`).andOn(
            `${TableName.IdentityGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.IdentityOrgMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("createdAt").withSchema(TableName.IdentityGroupMembership).as("joinedGroupAt"),
          db.ref("name").withSchema(TableName.Identity),
          db.ref("authMethod").withSchema(TableName.Identity),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.raw(`count(*) OVER() as total_count`)
        )
        .offset(offset)
        .orderBy("name", "asc");

      if (limit) {
        void query.limit(limit);
      }

      if (search) {
        void query.andWhereRaw(`lower("${TableName.Identity}"."name") ilike ?`, [`%${search.toLowerCase()}%`]);
      }

      switch (filter) {
        case EFilterReturnedIdentities.EXISTING_MEMBERS:
          void query.andWhere(`${TableName.IdentityGroupMembership}.createdAt`, "is not", null);
          break;
        case EFilterReturnedIdentities.NON_MEMBERS:
          void query.andWhere(`${TableName.IdentityGroupMembership}.createdAt`, "is", null);
          break;
        default:
          break;
      }

      const members = await query;

      return {
        members: members.map(({ name, authMethod, identityId, groupId: memberGroupId, joinedGroupAt }) => ({
          id: identityId,
          name,
          authMethod,
          isPartOfGroup: !!memberGroupId,
          joinedGroupAt
        })),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(members?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all identity group members" });
    }
  };

  const findIdentityGroupsByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityGroups)
        .join(
          TableName.IdentityGroupProjectMembership,
          `${TableName.IdentityGroups}.id`,
          `${TableName.IdentityGroupProjectMembership}.groupId`
        )
        .where(`${TableName.IdentityGroupProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.IdentityGroups));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity groups by project id" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.IdentityGroups)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityGroups}.roleId`, `${TableName.OrgRoles}.id`)
        .where(`${TableName.IdentityGroups}.id`, id)
        .select(
          selectAllTableCols(TableName.IdentityGroups),
          db.ref("slug").as("customRoleSlug").withSchema(TableName.OrgRoles)
        )
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  return {
    ...identityGroupOrm,
    findIdentityGroups,
    findByOrgId,
    findAllIdentityGroupPossibleMembers,
    findIdentityGroupsByProjectId,
    findById
  };
};
