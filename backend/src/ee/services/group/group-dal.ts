import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TGroups } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import {
  FilterMemberType,
  FilterReturnedMachineIdentities,
  FilterReturnedProjects,
  FilterReturnedUsers,
  GroupMembersOrderBy,
  GroupProjectsOrderBy
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
      // Return groups that have a membership in this org (native groups: group.orgId = orgId, or inherited: linked from root)
      const docs = await (tx || db.replicaNode())(TableName.Groups)
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

  const listAvailableGroups = async (orgId: string, rootOrgId: string) => {
    try {
      if (orgId === rootOrgId) {
        return [];
      }
      const groupsLinkedToOrg = db
        .replicaNode()(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .select("actorGroupId");

      const docs = await db
        .replicaNode()(TableName.Groups)
        .join(TableName.Membership, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, rootOrgId)
        .whereNotIn(`${TableName.Groups}.id`, groupsLinkedToOrg)
        .select(db.ref("id").withSchema(TableName.Groups))
        .select(db.ref("name").withSchema(TableName.Groups))
        .select(db.ref("slug").withSchema(TableName.Groups));

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "ListAvailableGroups" });
    }
  };

  // special query
  const findAllGroupPossibleUsers = async ({
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
    filter?: FilterReturnedUsers;
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
        case FilterReturnedUsers.EXISTING_MEMBERS:
          void query.whereNotNull(`${TableName.UserGroupMembership}.createdAt`);
          break;
        case FilterReturnedUsers.NON_MEMBERS:
          void query.whereNull(`${TableName.UserGroupMembership}.createdAt`);
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
            isPartOfGroup: Boolean(memberGroupId),
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

  const findAllGroupPossibleMachineIdentities = async ({
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
    filter?: FilterReturnedMachineIdentities;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .whereNull(`${TableName.Identity}.projectId`)
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
        case FilterReturnedMachineIdentities.ASSIGNED_MACHINE_IDENTITIES:
          void query.whereNotNull(`${TableName.IdentityGroupMembership}.createdAt`);
          break;
        case FilterReturnedMachineIdentities.NON_ASSIGNED_MACHINE_IDENTITIES:
          void query.whereNull(`${TableName.IdentityGroupMembership}.createdAt`);
          break;
        default:
          break;
      }

      const machineIdentities = await query;

      return {
        machineIdentities: machineIdentities.map(({ name, identityId, joinedGroupAt, groupId: identityGroupId }) => ({
          id: identityId,
          name,
          isPartOfGroup: Boolean(identityGroupId),
          joinedGroupAt
        })),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(machineIdentities?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all group identities" });
    }
  };

  const findAllGroupPossibleMembers = async ({
    orgId,
    groupId,
    offset = 0,
    limit,
    search,
    orderBy = GroupMembersOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    memberTypeFilter
  }: {
    orgId: string;
    groupId: string;
    offset?: number;
    limit?: number;
    search?: string;
    orderBy?: GroupMembersOrderBy;
    orderDirection?: OrderByDirection;
    memberTypeFilter?: FilterMemberType[];
  }) => {
    try {
      const includeUsers =
        !memberTypeFilter || memberTypeFilter.length === 0 || memberTypeFilter.includes(FilterMemberType.USERS);
      const includeMachineIdentities =
        !memberTypeFilter ||
        memberTypeFilter.length === 0 ||
        memberTypeFilter.includes(FilterMemberType.MACHINE_IDENTITIES);

      const query = db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.UserGroupMembership, (bd) => {
          bd.on(`${TableName.UserGroupMembership}.userId`, "=", `${TableName.Users}.id`).andOn(
            `${TableName.UserGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .leftJoin(TableName.IdentityGroupMembership, (bd) => {
          bd.on(`${TableName.IdentityGroupMembership}.identityId`, "=", `${TableName.Identity}.id`).andOn(
            `${TableName.IdentityGroupMembership}.groupId`,
            "=",
            db.raw("?", [groupId])
          );
        })
        .where((qb) => {
          void qb
            .where((innerQb) => {
              void innerQb
                .whereNotNull(`${TableName.Membership}.actorUserId`)
                .whereNotNull(`${TableName.UserGroupMembership}.createdAt`)
                .where(`${TableName.Users}.isGhost`, false);
            })
            .orWhere((innerQb) => {
              void innerQb
                .whereNotNull(`${TableName.Membership}.actorIdentityId`)
                .whereNotNull(`${TableName.IdentityGroupMembership}.createdAt`)
                .whereNull(`${TableName.Identity}.projectId`);
            });
        })
        .select(
          db.raw(
            `CASE WHEN "${TableName.Membership}"."actorUserId" IS NOT NULL THEN "${TableName.UserGroupMembership}"."createdAt" ELSE "${TableName.IdentityGroupMembership}"."createdAt" END as "joinedGroupAt"`
          ),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.raw(`"${TableName.Users}"."id"::text as "userId"`),
          db.raw(`"${TableName.Identity}"."id"::text as "identityId"`),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.raw(
            `CASE WHEN "${TableName.Membership}"."actorUserId" IS NOT NULL THEN 'user' ELSE 'machineIdentity' END as "member_type"`
          ),
          db.raw(`count(*) OVER() as total_count`)
        );

      void query.andWhere((qb) => {
        if (includeUsers) {
          void qb.whereNotNull(`${TableName.Membership}.actorUserId`);
        }

        if (includeMachineIdentities) {
          void qb[includeUsers ? "orWhere" : "where"]((innerQb) => {
            void innerQb.whereNotNull(`${TableName.Membership}.actorIdentityId`);
          });
        }

        if (!includeUsers && !includeMachineIdentities) {
          void qb.whereRaw("FALSE");
        }
      });

      if (search) {
        void query.andWhere((qb) => {
          void qb
            .whereRaw(
              `CONCAT_WS(' ', "${TableName.Users}"."firstName", "${TableName.Users}"."lastName", lower("${TableName.Users}"."username")) ilike ?`,
              [`%${search}%`]
            )
            .orWhereRaw(`LOWER("${TableName.Identity}"."name") ilike ?`, [`%${search}%`]);
        });
      }

      if (orderBy === GroupMembersOrderBy.Name) {
        const orderDirectionClause = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

        // This order by clause is used to sort the members by name.
        // It first checks if the full name (first name and last name) is not empty, then the username, then the email, then the identity name. If all of these are empty, it returns null.
        void query.orderByRaw(
          `LOWER(COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "${TableName.Users}"."firstName", "${TableName.Users}"."lastName")), ''), "${TableName.Users}"."username", "${TableName.Users}"."email", "${TableName.Identity}"."name")) ${orderDirectionClause}`
        );
      }

      if (offset) {
        void query.offset(offset);
      }
      if (limit) {
        void query.limit(limit);
      }

      const results = (await query) as unknown as {
        email: string;
        username: string;
        firstName: string;
        lastName: string;
        userId: string;
        identityId: string;
        identityName: string;
        member_type: "user" | "machineIdentity";
        joinedGroupAt: Date;
        total_count: string;
      }[];

      const members = results.map(
        ({ email, username, firstName, lastName, userId, identityId, identityName, member_type, joinedGroupAt }) => {
          if (member_type === "user") {
            return {
              id: userId,
              joinedGroupAt,
              type: "user" as const,
              user: {
                id: userId,
                email,
                username,
                firstName,
                lastName
              }
            };
          }
          return {
            id: identityId,
            joinedGroupAt,
            type: "machineIdentity" as const,
            machineIdentity: {
              id: identityId,
              name: identityName
            }
          };
        }
      );

      return {
        members,
        totalCount: Number(results?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all group possible members" });
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
    filter?: FilterReturnedProjects;
    orderBy?: GroupProjectsOrderBy;
    orderDirection?: OrderByDirection;
  }) => {
    try {
      // Include projects in the group's org and in any child sub-orgs (so root-org groups show inherited sub-org projects)
      const projectOrgIdsSubquery = db
        .replicaNode()(TableName.Organization)
        .where(`${TableName.Organization}.rootOrgId`, orgId)
        .select(db.ref("id").withSchema(TableName.Organization));
      const query = db
        .replicaNode()(TableName.Project)
        .andWhere((qb) => {
          void qb
            .where(`${TableName.Project}.orgId`, orgId)
            .orWhereIn(`${TableName.Project}.orgId`, projectOrgIdsSubquery);
        })
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
        case FilterReturnedProjects.ASSIGNED_PROJECTS:
          void query.whereNotNull(`${TableName.Membership}.id`);
          break;
        case FilterReturnedProjects.UNASSIGNED_PROJECTS:
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

  /**
   * Returns the groups that reference the given group via sourceGroupId (self-referential FK).
   * Used to block delete when this group is the source of linked/copied groups; error message can list them.
   */
  const getGroupsReferencingGroup = async (groupId: string, tx?: Knex): Promise<{ id: string; name: string }[]> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Groups)
        .whereRaw('"sourceGroupId" = ?', [groupId])
        .select("id", "name");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get groups referencing group" });
    }
  };

  return {
    ...groupOrm,
    findGroups,
    findByOrgId,
    listAvailableGroups,
    findAllGroupPossibleUsers,
    findAllGroupPossibleMachineIdentities,
    findAllGroupPossibleMembers,
    findAllGroupProjects,
    findGroupsByProjectId,
    findById,
    findOne,
    getGroupsReferencingGroup
  };
};
