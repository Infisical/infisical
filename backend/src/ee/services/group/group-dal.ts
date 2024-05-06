import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TGroups } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

export type TGroupDALFactory = ReturnType<typeof groupDALFactory>;

export const groupDALFactory = (db: TDbClient, userGroupMembershipDAL: TUserGroupMembershipDALFactory) => {
  const groupOrm = ormify(db, TableName.Groups);
  const groupMembershipOrm = ormify(db, TableName.GroupProjectMembership);
  const accessApprovalRequestOrm = ormify(db, TableName.AccessApprovalRequest);
  const secretApprovalRequestOrm = ormify(db, TableName.SecretApprovalRequest);

  const deleteMany = async (filterQuery: TFindFilter<TGroups>, tx?: Knex) => {
    const transaction = tx || (await db.transaction());

    // Find all memberships
    const groups = await groupOrm.find(filterQuery, { tx: transaction });

    for await (const group of groups) {
      // Find all the group memberships of the groups (a group membership is which projects the group is a part of)
      const groupProjectMemberships = await groupMembershipOrm.find(
        { groupId: group.id },
        {
          tx: transaction
        }
      );

      // For each of those group memberships, we need to find all the members of the group that don't have a regular membership in the project
      for await (const groupMembership of groupProjectMemberships) {
        const members = await userGroupMembershipDAL.findGroupMembersNotInProject(
          group.id,
          groupMembership.projectId,
          transaction
        );

        // We then delete all the access approval requests and secret approval requests associated with these members
        await accessApprovalRequestOrm.delete(
          {
            groupMembershipId: groupMembership.id,
            $in: {
              requestedByUserId: members.map(({ user }) => user.id)
            }
          },
          transaction
        );

        const policies = await (tx || db)(TableName.SecretApprovalPolicy)
          .join(TableName.Environment, `${TableName.SecretApprovalPolicy}.envId`, `${TableName.Environment}.id`)
          .where(`${TableName.Environment}.projectId`, groupMembership.projectId)
          .select(selectAllTableCols(TableName.SecretApprovalPolicy));

        await secretApprovalRequestOrm.delete(
          {
            $in: {
              policyId: policies.map(({ id }) => id),
              committerUserId: members.map(({ user }) => user.id)
            }
          },
          transaction
        );
      }
    }

    await groupOrm.delete(
      {
        $in: {
          id: groups.map((group) => group.id)
        }
      },
      transaction
    );

    return groups;
  };

  const findGroups = async (filter: TFindFilter<TGroups>, { offset, limit, sort, tx }: TFindOpt<TGroups> = {}) => {
    try {
      const query = (tx || db)(TableName.Groups)
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
      const docs = await (tx || db)(TableName.Groups)
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
  const findAllGroupMembers = async ({
    orgId,
    groupId,
    offset = 0,
    limit,
    username
  }: {
    orgId: string;
    groupId: string;
    offset?: number;
    limit?: number;
    username?: string;
  }) => {
    try {
      let query = db(TableName.OrgMembership)
        .where(`${TableName.OrgMembership}.orgId`, orgId)
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.UserGroupMembership, function () {
          this.on(`${TableName.UserGroupMembership}.userId`, "=", `${TableName.Users}.id`).andOn(
            `${TableName.UserGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.OrgMembership),
          db.ref("groupId").withSchema(TableName.UserGroupMembership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId")
        )
        .where({ isGhost: false })
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      if (username) {
        query = query.andWhere(`${TableName.Users}.username`, "ilike", `%${username}%`);
      }

      const members = await query;

      return members.map(
        ({ email, username: memberUsername, firstName, lastName, userId, groupId: memberGroupId }) => ({
          id: userId,
          email,
          username: memberUsername,
          firstName,
          lastName,
          isPartOfGroup: !!memberGroupId
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org members" });
    }
  };

  return {
    ...groupOrm,
    findGroups,
    findByOrgId,
    findAllGroupMembers,
    delete: deleteMany
  };
};
