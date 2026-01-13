import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  OrganizationsSchema,
  OrgMembershipRole,
  OrgMembershipStatus,
  TableName,
  TMemberships,
  TMembershipsInsert,
  TMembershipsUpdate,
  TOrganizations,
  TOrganizationsInsert,
  TUserEncryptionKeys
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  selectAllTableCols,
  sqlNestRelationships,
  TFindFilter,
  TFindOpt,
  withTransaction
} from "@app/lib/knex";
import { generateKnexQueryFromScim } from "@app/lib/knex/scim";

import { ActorType } from "../auth/auth-type";
import { OrgAuthMethod } from "./org-types";

export type TOrgDALFactory = ReturnType<typeof orgDALFactory>;

export const orgDALFactory = (db: TDbClient) => {
  const orgOrm = ormify(db, TableName.Organization);

  const findOrganizationsByFilter = async ({
    limit,
    offset,
    searchTerm,
    sortBy
  }: {
    limit: number;
    offset: number;
    searchTerm: string;
    sortBy?: keyof TOrganizations;
  }) => {
    try {
      // Build the subquery for limited organization IDs
      const orgSubquery = db.replicaNode().select("id").from(TableName.Organization);

      if (searchTerm) {
        void orgSubquery.where((qb) => {
          void qb.whereILike(`${TableName.Organization}.name`, `%${searchTerm}%`);
        });
      }

      const countQuery = orgSubquery.clone();

      if (sortBy) {
        void orgSubquery.orderBy(sortBy);
      }
      void orgSubquery.limit(limit).offset(offset);

      const buildBaseQuery = (orgIdSubquery: Knex.QueryBuilder) => {
        return db
          .replicaNode()(TableName.Organization)
          .whereNull(`${TableName.Organization}.rootOrgId`)
          .whereIn(`${TableName.Organization}.id`, orgIdSubquery)
          .leftJoin(TableName.Project, `${TableName.Organization}.id`, `${TableName.Project}.orgId`)
          .leftJoin(TableName.Membership, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .whereNotNull(`${TableName.Membership}.actorUserId`)
          .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .leftJoin(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
          .where((qb) => {
            void qb.where(`${TableName.Users}.isGhost`, false).orWhereNull(`${TableName.Users}.id`);
          });
      };

      const [docs, totalResult] = await Promise.all([
        buildBaseQuery(orgSubquery)
          .select(selectAllTableCols(TableName.Organization))
          .select(db.ref("name").withSchema(TableName.Project).as("projectName"))
          .select(db.ref("id").withSchema(TableName.Project).as("projectId"))
          .select(db.ref("slug").withSchema(TableName.Project).as("projectSlug"))
          .select(db.ref("createdAt").withSchema(TableName.Project).as("projectCreatedAt"))
          .select(db.ref("email").withSchema(TableName.Users).as("userEmail"))
          .select(db.ref("username").withSchema(TableName.Users).as("username"))
          .select(db.ref("firstName").withSchema(TableName.Users).as("firstName"))
          .select(db.ref("lastName").withSchema(TableName.Users).as("lastName"))
          .select(db.ref("id").withSchema(TableName.Users).as("userId"))
          .select(db.ref("id").withSchema(TableName.Membership).as("orgMembershipId"))
          .select(db.ref("status").withSchema(TableName.Membership).as("orgMembershipStatus"))
          .select(db.ref("role").withSchema(TableName.MembershipRole).as("orgMembershipRole"))
          .select(db.ref("customRoleId").withSchema(TableName.MembershipRole).as("orgMembershipRoleId"))
          .select(db.ref("name").withSchema(TableName.Role).as("orgMembershipRoleName")),
        buildBaseQuery(countQuery).countDistinct(`${TableName.Organization}.id`, { as: "count" }).first()
      ]);

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => OrganizationsSchema.parse(data),
        childrenMapper: [
          {
            key: "projectId",
            label: "projects" as const,
            mapper: ({ projectId, projectName, projectSlug, projectCreatedAt }) => ({
              id: projectId,
              name: projectName,
              slug: projectSlug,
              createdAt: projectCreatedAt
            })
          },
          {
            key: "userId",
            label: "members" as const,
            mapper: ({
              userId,
              userEmail,
              username,
              firstName,
              lastName,
              orgMembershipId,
              orgMembershipRole,
              orgMembershipRoleName,
              orgMembershipRoleId,
              orgMembershipStatus
            }) => ({
              user: {
                id: userId,
                email: userEmail,
                username,
                firstName,
                lastName
              },
              status: orgMembershipStatus,
              membershipId: orgMembershipId,
              role: orgMembershipRoleName || orgMembershipRole, // custom role name or pre-defined role name
              roleId: orgMembershipRoleId
            })
          }
        ]
      });

      const total = Number(totalResult?.count || 0);

      return {
        organizations: formattedDocs,
        total
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find organizations by filter" });
    }
  };

  const listSubOrganizations = async (dto: {
    actorId: string;
    actorType: ActorType;
    orgId: string;
    isAccessible?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    try {
      // TODO(sub-org:group): check this when implement group support
      const query = db
        .replicaNode()(TableName.Organization)
        .where(`${TableName.Organization}.rootOrgId`, dto.orgId)
        .select(selectAllTableCols(TableName.Organization));

      if (dto.isAccessible) {
        void query
          .leftJoin(`${TableName.Membership}`, `${TableName.Membership}.scopeOrgId`, `${TableName.Organization}.id`)
          .where((qb) => {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
            if (dto.actorType === ActorType.IDENTITY) {
              void qb.andWhere(`${TableName.Membership}.actorIdentityId`, dto.actorId);
            } else {
              void qb.andWhere(`${TableName.Membership}.actorUserId`, dto.actorId);
            }
          });
      }
      if (dto.limit) void query.limit(dto.limit);
      if (dto.offset) void query.offset(dto.offset);

      const orgs = await query;
      return orgs;
    } catch (error) {
      throw new DatabaseError({ error, name: "List sub organization" });
    }
  };

  const findOrgById = async (orgId: string) => {
    try {
      const org = (await db
        .replicaNode()(TableName.Organization)
        .where({ [`${TableName.Organization}.id` as "id"]: orgId })
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .leftJoin(TableName.SamlConfig, (qb) => {
          qb.on(`${TableName.SamlConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.SamlConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .leftJoin(TableName.OidcConfig, (qb) => {
          qb.on(`${TableName.OidcConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.OidcConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .select(selectAllTableCols(TableName.Organization))
        .select(
          db.raw(`
            CASE
              WHEN ${TableName.SamlConfig}."orgId" IS NOT NULL THEN '${OrgAuthMethod.SAML}'
              WHEN ${TableName.OidcConfig}."orgId" IS NOT NULL THEN '${OrgAuthMethod.OIDC}'
              ELSE ''
            END as "orgAuthMethod"
        `)
        )
        .first()) as TOrganizations & { orgAuthMethod?: string };

      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by id" });
    }
  };

  const findOrgBySlug = async (orgSlug: string) => {
    try {
      const org = (await db
        .replicaNode()(TableName.Organization)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .where({ [`${TableName.Organization}.slug` as "slug"]: orgSlug })
        .leftJoin(TableName.SamlConfig, (qb) => {
          qb.on(`${TableName.SamlConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.SamlConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .leftJoin(TableName.OidcConfig, (qb) => {
          qb.on(`${TableName.OidcConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.OidcConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .select(selectAllTableCols(TableName.Organization))
        .select(
          db.raw(`
            CASE
              WHEN ${TableName.SamlConfig}."orgId" IS NOT NULL THEN '${OrgAuthMethod.SAML}'
              WHEN ${TableName.OidcConfig}."orgId" IS NOT NULL THEN '${OrgAuthMethod.OIDC}'
              ELSE ''
            END as "orgAuthMethod"
        `)
        )
        .first()) as TOrganizations & { orgAuthMethod?: string };

      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by slug" });
    }
  };

  // special query
  const findAllOrgsByUserId = async (
    userId: string
  ): Promise<(TOrganizations & { orgAuthMethod: string; userRole: string; userStatus: string })[]> => {
    try {
      const org = (await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.actorUserId`, userId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .join(TableName.Organization, `${TableName.Membership}.scopeOrgId`, `${TableName.Organization}.id`)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .leftJoin(TableName.SamlConfig, (qb) => {
          qb.on(`${TableName.SamlConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.SamlConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .leftJoin(TableName.OidcConfig, (qb) => {
          qb.on(`${TableName.OidcConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.OidcConfig}.isActive`,
            "=",
            db.raw("true")
          );
        })
        .select(selectAllTableCols(TableName.Organization))
        .select(db.ref("role").withSchema(TableName.MembershipRole).as("userRole"))
        .select(db.ref("status").withSchema(TableName.Membership).as("userStatus"))
        .select(db.ref("createdAt").withSchema(TableName.Membership).as("userJoinedAt"))
        .select(
          db.raw(`
            CASE
              WHEN ${TableName.SamlConfig}."orgId" IS NOT NULL THEN 'saml'
              WHEN ${TableName.OidcConfig}."orgId" IS NOT NULL THEN 'oidc'
              ELSE ''
            END as "orgAuthMethod"
        `)
        )) as (TOrganizations & { orgAuthMethod: string; userRole: string; userStatus: string })[];

      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org by user id" });
    }
  };

  const findOrgByProjectId = async (projectId: string): Promise<TOrganizations> => {
    try {
      const [org] = await db
        .replicaNode()(TableName.Project)
        .where({ [`${TableName.Project}.id` as "id"]: projectId })
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .select(selectAllTableCols(TableName.Organization));

      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by project id" });
    }
  };

  // special query
  const findAllOrgMembers = async (orgId: string) => {
    try {
      const members = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("inviteEmail").withSchema(TableName.Membership),
          db.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          db.ref("status").withSchema(TableName.Membership),
          db.ref("isActive").withSchema(TableName.Membership),
          db.ref("lastLoginAuthMethod").withSchema(TableName.Membership),
          db.ref("lastLoginTime").withSchema(TableName.Membership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("superAdmin").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        )
        .where({ isGhost: false }) // MAKE SURE USER IS NOT A GHOST USER
        .orderBy("firstName")
        .orderBy("lastName");

      return members.map(
        ({ email, isEmailVerified, username, firstName, lastName, userId, publicKey, superAdmin, ...data }) => ({
          ...data,
          user: { email, isEmailVerified, username, firstName, lastName, id: userId, publicKey, superAdmin }
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org members" });
    }
  };

  // TODO(sub-org): updated this logic later
  const countAllOrgMembers = async (orgId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.status`, OrgMembershipStatus.Accepted)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .count("*")
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where({ isGhost: false, [`${TableName.Membership}.isActive` as "isActive"]: true })
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all org members" });
    }
  };

  const findOrgMembersByUsername = async (orgId: string, usernames: string[], tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const members = await conn(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          conn.ref("id").withSchema(TableName.Membership),
          conn.ref("inviteEmail").withSchema(TableName.Membership),
          conn.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          conn.ref("status").withSchema(TableName.Membership),
          conn.ref("username").withSchema(TableName.Users),
          conn.ref("email").withSchema(TableName.Users),
          conn.ref("firstName").withSchema(TableName.Users),
          conn.ref("lastName").withSchema(TableName.Users),
          conn.ref("id").withSchema(TableName.Users).as("userId"),
          conn.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        )
        .where({ isGhost: false })
        .whereIn("username", usernames);
      return members.map(({ email, firstName, lastName, userId, publicKey, ...data }) => ({
        ...data,
        user: { email, firstName, lastName, id: userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org members" });
    }
  };

  const findOrgMembersByRole = async (orgId: string, role: OrgMembershipRole, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const members = await conn(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .where(`${TableName.MembershipRole}.role`, role)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          conn.ref("id").withSchema(TableName.Membership),
          conn.ref("inviteEmail").withSchema(TableName.Membership),
          conn.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          conn.ref("role").withSchema(TableName.MembershipRole),
          conn.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          conn.ref("status").withSchema(TableName.Membership),
          conn.ref("username").withSchema(TableName.Users),
          conn.ref("email").withSchema(TableName.Users),
          conn.ref("firstName").withSchema(TableName.Users),
          conn.ref("lastName").withSchema(TableName.Users),
          conn.ref("id").withSchema(TableName.Users).as("userId"),
          conn.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        )
        .where({ isGhost: false });

      return members.map(({ username, email, firstName, lastName, userId, publicKey, ...data }) => ({
        ...data,
        user: { username, email, firstName, lastName, id: userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org members by role" });
    }
  };

  const create = async (dto: TOrganizationsInsert, tx?: Knex) => {
    try {
      const [organization] = await (tx || db)(TableName.Organization).insert(dto).returning("*");
      return organization;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create organization" });
    }
  };

  const deleteById = async (orgId: string, tx?: Knex) => {
    try {
      const [org] = await (tx || db)(TableName.Organization).where({ id: orgId }).delete().returning("*");
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update organization" });
    }
  };

  const updateById = async (orgId: string, data: Partial<TOrganizations>, tx?: Knex) => {
    try {
      const [org] = await (tx || db)(TableName.Organization)
        .where({ id: orgId })
        .update({ ...data })
        .returning("*");
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update organization" });
    }
  };

  // MEMBERSHIP OPERATIONS
  // --------------------

  const createMembership = async (data: TMembershipsInsert, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.Membership).insert(data).returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create org membership" });
    }
  };

  const bulkCreateMemberships = async (data: TMembershipsInsert[], tx?: Knex) => {
    try {
      const memberships = await (tx || db)(TableName.Membership).insert(data).returning("*");
      return memberships;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create org memberships" });
    }
  };

  const updateMembershipById = async (id: string, data: TMembershipsUpdate, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.Membership).where({ id }).update(data).returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update org membership" });
    }
  };

  const updateMembership = async (filter: Partial<TMemberships>, data: TMembershipsUpdate, tx?: Knex) => {
    try {
      const membership = await (tx || db)(TableName.Membership).where(filter).update(data).returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update org memberships" });
    }
  };

  const deleteMembershipById = async (id: string, orgId: string, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.Membership)
        .where({ id, scopeOrgId: orgId, scope: AccessScope.Organization })
        .delete()
        .returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete org membership" });
    }
  };

  const deleteMembershipsById = async (ids: string[], orgId: string, tx?: Knex) => {
    try {
      const memberships = await (tx || db)(TableName.Membership)
        .where({
          scopeOrgId: orgId,
          scope: AccessScope.Organization
        })
        .whereIn("id", ids)
        .delete()
        .returning("*");
      return memberships;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete org memberships" });
    }
  };

  const findMembership = async (
    filter: TFindFilter<TMemberships>,
    { offset, limit, sort, tx }: TFindOpt<TMemberships> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Membership)
        // eslint-disable-next-line
        .where(buildFindFilter(filter))
        .where("scope", AccessScope.Organization)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
        .leftJoin(TableName.UserAliases, function joinUserAlias() {
          this.on(`${TableName.UserAliases}.userId`, "=", `${TableName.Membership}.actorUserId`)
            .andOn(`${TableName.UserAliases}.orgId`, "=", `${TableName.Membership}.scopeOrgId`)
            .andOn(`${TableName.UserAliases}.aliasType`, "=", (tx || db).raw("?", ["saml"]));
        })
        .select(
          selectAllTableCols(TableName.Membership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("scimEnabled").withSchema(TableName.Organization),
          db.ref("externalId").withSchema(TableName.UserAliases)
        )
        .where({ isGhost: false });

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }
      const res = await query;
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const findMembershipWithScimFilter = async (
    orgId: string,
    scimFilter: string | undefined,
    { offset, limit, sort, tx }: TFindOpt<TMemberships> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Membership)
        // eslint-disable-next-line
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where((qb) => {
          if (scimFilter) {
            void generateKnexQueryFromScim(qb, scimFilter, (attrPath) => {
              switch (attrPath) {
                case "active":
                  return `${TableName.Membership}.isActive`;
                case "userName":
                  return `${TableName.UserAliases}.externalId`;
                case "name.givenName":
                  return `${TableName.Users}.firstName`;
                case "name.familyName":
                  return `${TableName.Users}.lastName`;
                case "email.value":
                  return `${TableName.Users}.email`;
                default:
                  return null;
              }
            });
          }
        })
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .leftJoin(TableName.UserAliases, function joinUserAlias() {
          this.on(`${TableName.UserAliases}.userId`, "=", `${TableName.Membership}.actorUserId`)
            .andOn(`${TableName.UserAliases}.orgId`, "=", `${TableName.Membership}.scopeOrgId`)
            .andOn(`${TableName.UserAliases}.aliasType`, "=", (tx || db).raw("?", ["saml"]));
        })
        .select(
          selectAllTableCols(TableName.Membership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("scimEnabled").withSchema(TableName.Organization),
          db.ref("defaultMembershipRole").withSchema(TableName.Organization),
          db.ref("externalId").withSchema(TableName.UserAliases)
        )
        .where({ isGhost: false });

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }
      const res = await query;
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const findIdentityOrganization = async (
    identityId: string
  ): Promise<{ id: string; name: string; slug: string; role: string }> => {
    try {
      const org = await db
        .replicaNode()(TableName.Membership)
        .where({ actorIdentityId: identityId })
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .join(TableName.Organization, `${TableName.Membership}.scopeOrgId`, `${TableName.Organization}.id`)
        .select(db.ref("id").withSchema(TableName.Organization).as("id"))
        .select(db.ref("name").withSchema(TableName.Organization).as("name"))
        .select(db.ref("slug").withSchema(TableName.Organization).as("slug"))
        .select(db.ref("role").withSchema(TableName.MembershipRole).as("role"));

      return org?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity organization" });
    }
  };

  const findRootOrgDetails = async (orgId: string, tx?: Knex): Promise<TOrganizations | undefined> => {
    try {
      const org = await (tx ?? db.replicaNode())(TableName.Organization)
        .select(selectAllTableCols(TableName.Organization))
        .where(
          "id",
          db(TableName.Organization)
            .select(db.raw(`CASE WHEN "rootOrgId" IS NULL THEN id ELSE "rootOrgId" END`))
            .where("id", orgId)
        )
        .first();

      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRootOrgDetails" });
    }
  };

  return withTransaction(db, {
    ...orgOrm,
    findOrgByProjectId,
    findAllOrgMembers,
    countAllOrgMembers,
    listSubOrganizations,
    findOrgById,
    findOrgBySlug,
    findAllOrgsByUserId,
    findOrganizationsByFilter,
    findOrgMembersByUsername,
    findOrgMembersByRole,
    create,
    updateById,
    deleteById,
    findMembership,
    findMembershipWithScimFilter,
    createMembership,
    bulkCreateMemberships,
    updateMembershipById,
    deleteMembershipById,
    deleteMembershipsById,
    updateMembership,
    findIdentityOrganization,
    findRootOrgDetails
  });
};
