import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { ActorType } from "@app/lib/auth/actor-types";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { DatabaseError } from "@app/lib/errors";

import { ActorGrants } from "../model/actor-grants";
import { TIdentityAttributeProps } from "../model/identity-attribute";
import { TMembershipProps } from "../model/membership";
import { TPrivilegeProps } from "../model/privilege";
import { ProjectMemberGrants, TOwnedAttributeProps } from "../model/project-member-grants";
import { TRoleAssignmentProps } from "../model/role-assignment";

export type TGrantActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

export type TGrantScope =
  | { scope: AccessScope.Organization; orgId: string }
  | { scope: AccessScope.Project; orgId: string; projectId: string }
  | { scope: typeof RESOURCE_SCOPE; orgId: string; projectId: string; resourceType: string; resourceId: string };

export type TGrantDataAccess = {
  // The actor's memberships at the scope, directly or through its groups, with their roles; its privileges at the
  // org or project scope (never folder grants); and its attributes. A resource scope reads only active memberships
  // and has no privileges.
  findActorGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants>;
  // A hash of everything findActorGrants reads for the actor in one project, its resources and its org. It changes
  // when a membership, role assignment, custom role, privilege or attribute changes, or when a temporary grant ends.
  fingerprint(actor: TGrantActor, scope: { orgId: string; projectId: string }): Promise<string>;
  // Every membership in the project (users, identities and groups) with its roles, and the project-wide privileges
  // and the attributes of its direct user and identity members. Active or not; callers filter by time.
  findProjectMemberGrants(
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<ProjectMemberGrants>;
};

type TMembershipRoleRow = Record<string, unknown> & { membershipId: string; membershipRoleId: string };

// Reads memberships, membership_roles, roles, additional_privileges, groups, user_group_membership,
// identity_group_membership and identity_metadata, all owned by Access Control.
export class GrantDataAccess implements TGrantDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findActorGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants> {
    try {
      const knex = this.db.reader(options);
      const memberships = await GrantDataAccess.findMemberships(knex, actor, scope);
      if (!memberships.length) return ActorGrants.empty();
      if (scope.scope === RESOURCE_SCOPE) {
        return ActorGrants.restore({ memberships, privileges: [], attributes: [] });
      }
      const [privileges, attributes] = await Promise.all([
        GrantDataAccess.findPrivileges(knex, actor, scope),
        GrantDataAccess.findAttributes(knex, actor, scope.orgId)
      ]);
      return ActorGrants.restore({ memberships, privileges, attributes });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find actor grants" });
    }
  }

  async fingerprint(actor: TGrantActor, scope: { orgId: string; projectId: string }): Promise<string> {
    try {
      const knex = this.db.reader();
      const membershipRows = await knex(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scope.orgId)
        .where((qb) => {
          void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization).orWhere((inner) => {
            void inner
              .whereIn(`${TableName.Membership}.scope`, [AccessScope.Project, RESOURCE_SCOPE])
              .where(`${TableName.Membership}.scopeProjectId`, scope.projectId);
          });
        })
        .where((qb) => {
          void GrantDataAccess.whereActorOrItsGroups(knex, qb, actor);
        })
        .select(
          knex.ref("id").withSchema(TableName.Membership).as("mId"),
          // isActive and status gate access; updatedAt moves on every login, so it is left out.
          knex.ref("isActive").withSchema(TableName.Membership).as("mActive"),
          knex.ref("status").withSchema(TableName.Membership).as("mStatus"),
          knex.ref("id").withSchema(TableName.MembershipRole).as("rId"),
          knex.ref("updatedAt").withSchema(TableName.MembershipRole).as("rUp"),
          knex.ref("updatedAt").withSchema(TableName.Role).as("crUp"),
          knex.raw(
            `CASE WHEN "${TableName.MembershipRole}"."isTemporary" AND NOW() >= "${TableName.MembershipRole}"."temporaryAccessEndTime" THEN true ELSE false END AS "rExp"`
          )
        )
        .orderBy([{ column: `${TableName.Membership}.id` }, { column: `${TableName.MembershipRole}.id` }]);

      const privilegeRows = await knex(TableName.AdditionalPrivilege)
        .where(GrantDataAccess.privilegeActorColumn(actor), actor.id)
        .where(`${TableName.AdditionalPrivilege}.projectId`, scope.projectId)
        .whereNull(`${TableName.AdditionalPrivilege}.folderId`)
        .select(
          "id",
          "updatedAt",
          knex.raw(`CASE WHEN "isTemporary" AND NOW() >= "temporaryAccessEndTime" THEN true ELSE false END AS "pExp"`)
        )
        .orderBy("id");

      const attributeRows = await GrantDataAccess.attributeQuery(knex, actor, scope.orgId)
        .select("id", "updatedAt")
        .orderBy("id");

      return generateCacheKeyFromData({ membershipRows, privilegeRows, attributeRows });
    } catch (error) {
      throw new DatabaseError({ error, name: "Fingerprint actor grants" });
    }
  }

  async findProjectMemberGrants(
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<ProjectMemberGrants> {
    try {
      const knex = this.db.reader(options);
      const rows: TMembershipRoleRow[] = await GrantDataAccess.selectMembershipRoles(
        knex,
        knex(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
          .where(`${TableName.Membership}.scopeOrgId`, scope.orgId)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, scope.projectId)
      );
      const memberships = GrantDataAccess.nestRoles(rows);
      const userIds = memberships.flatMap((membership) => (membership.actorUserId ? [membership.actorUserId] : []));
      const identityIds = memberships.flatMap((membership) =>
        membership.actorIdentityId ? [membership.actorIdentityId] : []
      );
      const [privileges, attributes] = await Promise.all([
        knex(TableName.AdditionalPrivilege)
          .where(`${TableName.AdditionalPrivilege}.projectId`, scope.projectId)
          .whereNull(`${TableName.AdditionalPrivilege}.folderId`)
          .select("*")
          .orderBy("id") as Promise<TPrivilegeProps[]>,
        knex(TableName.IdentityMetadata)
          .where((qb) => {
            void qb
              .where((users) => {
                void users.whereIn("userId", userIds).where("orgId", scope.orgId);
              })
              .orWhereIn("identityId", identityIds);
          })
          .select("id", "key", "value", "userId", "identityId")
          .orderBy("id") as Promise<TOwnedAttributeProps[]>
      ]);
      return ProjectMemberGrants.restore({ memberships, privileges, attributes });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project member grants" });
    }
  }

  private static whereActorOrItsGroups(knex: Knex, qb: Knex.QueryBuilder, actor: TGrantActor) {
    const groupSubquery: Knex.QueryBuilder =
      actor.type === ActorType.USER
        ? knex(TableName.UserGroupMembership).where("userId", actor.id).select("groupId")
        : knex(TableName.IdentityGroupMembership).where("identityId", actor.id).select("groupId");
    const directColumn =
      actor.type === ActorType.USER ? `${TableName.Membership}.actorUserId` : `${TableName.Membership}.actorIdentityId`;
    return qb.where(directColumn, actor.id).orWhereIn(`${TableName.Membership}.actorGroupId`, groupSubquery);
  }

  private static privilegeActorColumn(actor: TGrantActor) {
    return actor.type === ActorType.USER
      ? `${TableName.AdditionalPrivilege}.actorUserId`
      : `${TableName.AdditionalPrivilege}.actorIdentityId`;
  }

  private static async findMemberships(
    knex: Knex,
    actor: TGrantActor,
    scope: TGrantScope
  ): Promise<TMembershipProps[]> {
    const query = knex(TableName.Membership)
      .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
      .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
      .where(`${TableName.Membership}.scopeOrgId`, scope.orgId)
      .where(`${TableName.Membership}.scope`, scope.scope)
      .where((qb) => {
        void GrantDataAccess.whereActorOrItsGroups(knex, qb, actor);
      });

    if (scope.scope === AccessScope.Project) {
      void query.where(`${TableName.Membership}.scopeProjectId`, scope.projectId);
    } else if (scope.scope === RESOURCE_SCOPE) {
      void query
        .where(`${TableName.Membership}.scopeProjectId`, scope.projectId)
        .where(`${TableName.Membership}.scopeResourceType`, scope.resourceType)
        .where(`${TableName.Membership}.scopeResourceId`, scope.resourceId)
        .where(`${TableName.Membership}.isActive`, true);
    }

    const rows = await GrantDataAccess.selectMembershipRoles(knex, query);

    return GrantDataAccess.nestRoles(rows);
  }

  private static selectMembershipRoles(knex: Knex, query: Knex.QueryBuilder): Promise<TMembershipRoleRow[]> {
    return query
      .select(knex.ref("*").withSchema(TableName.Membership))
      .select(
        knex.ref("id").withSchema(TableName.Membership).as("membershipId"),
        knex.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
        knex.ref("role").withSchema(TableName.MembershipRole).as("roleSlug"),
        knex.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleCustomRoleId"),
        knex.ref("isTemporary").withSchema(TableName.MembershipRole).as("roleIsTemporary"),
        knex.ref("temporaryMode").withSchema(TableName.MembershipRole).as("roleTemporaryMode"),
        knex.ref("temporaryRange").withSchema(TableName.MembershipRole).as("roleTemporaryRange"),
        knex.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole).as("roleTemporaryAccessStartTime"),
        knex.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole).as("roleTemporaryAccessEndTime"),
        knex.ref("createdAt").withSchema(TableName.MembershipRole).as("roleCreatedAt"),
        knex.ref("updatedAt").withSchema(TableName.MembershipRole).as("roleUpdatedAt"),
        knex.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
        knex.ref("name").withSchema(TableName.Role).as("customRoleName"),
        knex.ref("permissions").withSchema(TableName.Role).as("customRolePermissions")
      )
      .orderBy([{ column: `${TableName.Membership}.id` }, { column: `${TableName.MembershipRole}.id` }]);
  }

  private static nestRoles(rows: TMembershipRoleRow[]): TMembershipProps[] {
    const byMembership = new Map<string, TMembershipProps>();
    for (const row of rows) {
      const {
        membershipRoleId,
        roleSlug,
        roleCustomRoleId,
        roleIsTemporary,
        roleTemporaryMode,
        roleTemporaryRange,
        roleTemporaryAccessStartTime,
        roleTemporaryAccessEndTime,
        roleCreatedAt,
        roleUpdatedAt,
        customRoleSlug,
        customRoleName,
        customRolePermissions,
        membershipId,
        ...membershipColumns
      } = row;
      let membership = byMembership.get(membershipId);
      if (!membership) {
        membership = { ...(membershipColumns as Omit<TMembershipProps, "roles">), id: membershipId, roles: [] };
        byMembership.set(membershipId, membership);
      }
      const role: TRoleAssignmentProps = {
        id: membershipRoleId,
        role: roleSlug as string,
        customRoleId: roleCustomRoleId as string | null,
        isTemporary: Boolean(roleIsTemporary),
        temporaryMode: roleTemporaryMode as string | null,
        temporaryRange: roleTemporaryRange as string | null,
        temporaryAccessStartTime: roleTemporaryAccessStartTime as Date | null,
        temporaryAccessEndTime: roleTemporaryAccessEndTime as Date | null,
        createdAt: roleCreatedAt as Date,
        updatedAt: roleUpdatedAt as Date,
        customRoleSlug: customRoleSlug as string | null,
        customRoleName: customRoleName as string | null,
        customRolePermissions
      };
      membership.roles.push(role);
    }
    return [...byMembership.values()];
  }

  private static async findPrivileges(
    knex: Knex,
    actor: TGrantActor,
    scope: Exclude<TGrantScope, { scope: typeof RESOURCE_SCOPE }>
  ): Promise<TPrivilegeProps[]> {
    const query = knex(TableName.AdditionalPrivilege)
      .where(GrantDataAccess.privilegeActorColumn(actor), actor.id)
      .whereNull(`${TableName.AdditionalPrivilege}.folderId`);
    if (scope.scope === AccessScope.Organization) {
      void query.where(`${TableName.AdditionalPrivilege}.orgId`, scope.orgId);
    } else {
      void query.where(`${TableName.AdditionalPrivilege}.projectId`, scope.projectId);
    }
    return query.select("*").orderBy("id");
  }

  private static attributeQuery(knex: Knex, actor: TGrantActor, orgId: string) {
    // A user's attributes are per org; an identity belongs to one org, so its attributes are its own.
    return actor.type === ActorType.USER
      ? knex(TableName.IdentityMetadata).where({ userId: actor.id, orgId })
      : knex(TableName.IdentityMetadata).where({ identityId: actor.id });
  }

  private static async findAttributes(
    knex: Knex,
    actor: TGrantActor,
    orgId: string
  ): Promise<TIdentityAttributeProps[]> {
    return GrantDataAccess.attributeQuery(knex, actor, orgId).select("id", "key", "value").orderBy("id");
  }
}
