import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { ActorType } from "@app/lib/auth/actor-types";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { DatabaseError } from "@app/lib/errors";

import { ActorGrants, TIdentityAttributeRecord } from "../models/actor-grants";
import { Membership, TMembershipRecord } from "../models/membership";
import { Privilege, TPrivilegeRecord } from "../models/privilege";
import { ProjectMemberGrants, TOwnedAttributeRecord } from "../models/project-member-grants";
import { Role } from "../models/role";
import { TRoleAssignmentRecord } from "../models/role-assignment";
import { TActorMembership, TGrantActor, TGrantScope, TGrantStore, TGroup, TRoleOwner } from "../services/dependencies";

type TMembershipRoleRow = Record<string, unknown> & { membershipId: string; membershipRoleId: string };

// See TGrantStore: one read-only store over Access Control's tables.
export class GrantStore implements TGrantStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findActorGrants(actor: TGrantActor, scope: TGrantScope, options?: TReadOptions): Promise<ActorGrants> {
    try {
      const knex = this.connection.reader(options);
      const memberships = await GrantStore.findMemberships(knex, actor, scope);
      if (!memberships.length) return ActorGrants.empty();
      if (scope.scope === RESOURCE_SCOPE) {
        return ActorGrants.restore({ memberships, privileges: [], attributes: [] });
      }
      const [privileges, attributes] = await Promise.all([
        GrantStore.findPrivileges(knex, actor, scope),
        GrantStore.findAttributes(knex, actor, scope.orgId)
      ]);
      return ActorGrants.restore({ memberships, privileges, attributes });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find actor grants" });
    }
  }

  async findGrantsFingerprint(
    actor: TGrantActor,
    scope: { orgId: string; projectId: string },
    options?: TReadOptions
  ): Promise<string> {
    try {
      const knex = this.connection.reader(options);
      const membershipRows = await knex(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .whereIn(
          `${TableName.Membership}.id`,
          GrantStore.actorMembershipIds(knex, actor, {
            orgId: scope.orgId,
            projectId: scope.projectId,
            scopes: [AccessScope.Project, RESOURCE_SCOPE, AccessScope.Organization]
          })
        )
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
        .where(GrantStore.privilegeActorColumn(actor), actor.id)
        .where(`${TableName.AdditionalPrivilege}.projectId`, scope.projectId)
        .whereNull(`${TableName.AdditionalPrivilege}.folderId`)
        .select(
          "id",
          "updatedAt",
          knex.raw(`CASE WHEN "isTemporary" AND NOW() >= "temporaryAccessEndTime" THEN true ELSE false END AS "pExp"`)
        )
        .orderBy("id");

      const attributeRows = await GrantStore.attributeQuery(knex, actor, scope.orgId)
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
      const knex = this.connection.reader(options);
      const rows: TMembershipRoleRow[] = await GrantStore.selectMembershipRoles(
        knex,
        knex(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
          .where(`${TableName.Membership}.scopeOrgId`, scope.orgId)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, scope.projectId)
      );
      const memberships = GrantStore.nestRoles(rows);
      const userIds = memberships.flatMap((membership) => (membership.actorUserId ? [membership.actorUserId] : []));
      const identityIds = memberships.flatMap((membership) =>
        membership.actorIdentityId ? [membership.actorIdentityId] : []
      );
      const [privileges, attributes] = await Promise.all([
        knex(TableName.AdditionalPrivilege)
          .where(`${TableName.AdditionalPrivilege}.projectId`, scope.projectId)
          .whereNull(`${TableName.AdditionalPrivilege}.folderId`)
          .select("*")
          .orderBy("id") as Promise<TPrivilegeRecord[]>,
        knex(TableName.IdentityMetadata)
          .where((qb) => {
            void qb
              .where((users) => {
                void users.whereIn("userId", userIds).where("orgId", scope.orgId);
              })
              .orWhereIn("identityId", identityIds);
          })
          .select("id", "key", "value", "userId", "identityId")
          .orderBy("id") as Promise<TOwnedAttributeRecord[]>
      ]);
      return ProjectMemberGrants.restore({ memberships, privileges, attributes });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project member grants" });
    }
  }

  async findFolderGrants(
    { actor, projectId }: { actor: TGrantActor; projectId: string },
    options?: TReadOptions
  ): Promise<Privilege[]> {
    try {
      const rows = await this.connection
        .reader(options)(TableName.AdditionalPrivilege)
        .where({ projectId })
        .where(actor.type === ActorType.USER ? { actorUserId: actor.id } : { actorIdentityId: actor.id })
        .whereNotNull("folderId")
        .select("*")
        .orderBy("id");
      return rows.map((row) => Privilege.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folder grants" });
    }
  }

  async findProjectFolderGrants({ projectId }: { projectId: string }, options?: TReadOptions): Promise<Privilege[]> {
    try {
      const rows = await this.connection
        .reader(options)(TableName.AdditionalPrivilege)
        .where({ projectId })
        .whereNotNull("folderId")
        .select("*")
        .orderBy("id");
      return rows.map((row) => Privilege.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project folder grants" });
    }
  }

  async findResourceMembershipsForActor(
    { actor, projectId, resourceType }: { actor: TGrantActor; projectId: string; resourceType: string },
    options?: TReadOptions
  ): Promise<Membership[]> {
    try {
      const knex = this.connection.reader(options);
      const memberships = await knex(TableName.Membership)
        .where({ scope: RESOURCE_SCOPE, scopeProjectId: projectId, scopeResourceType: resourceType })
        .where((qb) => {
          void GrantStore.whereActorOrItsGroups(knex, qb, actor);
        })
        .select("*")
        .orderBy("id");
      if (!memberships.length) return [];
      const roles = await GrantStore.findResourceMembershipRoles(
        knex,
        memberships.map((membership) => membership.id as string)
      );
      return memberships.map((membership) =>
        Membership.restore({ ...membership, roles: roles.filter((role) => role.membershipId === membership.id) })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for actor" });
    }
  }

  async findResourceMembershipsForActors(
    { actors, projectId, resourceTypes }: { actors: TGrantActor[]; projectId: string; resourceTypes: string[] },
    options?: TReadOptions
  ): Promise<TActorMembership[]> {
    const userIds = actors.filter((actor) => actor.type === ActorType.USER).map((actor) => actor.id);
    const identityIds = actors.filter((actor) => actor.type === ActorType.IDENTITY).map((actor) => actor.id);
    if (!resourceTypes.length || (!userIds.length && !identityIds.length)) return [];
    try {
      const knex = this.connection.reader(options);
      const [userGroups, identityGroups] = await Promise.all([
        userIds.length
          ? (knex(TableName.UserGroupMembership).whereIn("userId", userIds).select("groupId", "userId") as Promise<
              { groupId: string; userId: string }[]
            >)
          : Promise.resolve([]),
        identityIds.length
          ? (knex(TableName.IdentityGroupMembership)
              .whereIn("identityId", identityIds)
              .select("groupId", "identityId") as Promise<{ groupId: string; identityId: string }[]>)
          : Promise.resolve([])
      ]);
      const membersOfGroup = new Map<string, TGrantActor[]>();
      const addMember = (groupId: string, actor: TGrantActor) =>
        membersOfGroup.set(groupId, [...(membersOfGroup.get(groupId) ?? []), actor]);
      userGroups.forEach(({ groupId, userId }) => addMember(groupId, { type: ActorType.USER, id: userId }));
      identityGroups.forEach(({ groupId, identityId }) =>
        addMember(groupId, { type: ActorType.IDENTITY, id: identityId })
      );

      const memberships = await knex(TableName.Membership)
        .where({ scope: RESOURCE_SCOPE, scopeProjectId: projectId })
        .whereIn("scopeResourceType", resourceTypes)
        .where((qb) => {
          if (userIds.length) void qb.orWhereIn("actorUserId", userIds);
          if (identityIds.length) void qb.orWhereIn("actorIdentityId", identityIds);
          if (membersOfGroup.size) void qb.orWhereIn("actorGroupId", [...membersOfGroup.keys()]);
        })
        .select("*")
        .orderBy("id");
      if (!memberships.length) return [];
      const roles = await GrantStore.findResourceMembershipRoles(
        knex,
        memberships.map((membership) => membership.id as string)
      );

      return memberships.flatMap((row) => {
        const membership = Membership.restore({
          ...row,
          roles: roles.filter((role) => role.membershipId === row.id)
        });
        if (row.actorUserId) return [{ actor: { type: ActorType.USER, id: row.actorUserId }, membership }];
        if (row.actorIdentityId) return [{ actor: { type: ActorType.IDENTITY, id: row.actorIdentityId }, membership }];
        return (membersOfGroup.get(row.actorGroupId as string) ?? []).map((actor) => ({ actor, membership }));
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for actors" });
    }
  }

  async findRolesBySlugs(
    { owner, slugs }: { owner: TRoleOwner; slugs: string[] },
    options?: TReadOptions
  ): Promise<Role[]> {
    if (!slugs.length) return [];
    try {
      const rows = await this.connection
        .reader(options)(TableName.Role)
        .where(owner)
        .whereIn("slug", slugs)
        .select("*")
        .orderBy("slug");
      return rows.map((row) => Role.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find roles by slug" });
    }
  }

  async findGroupsByIds(ids: string[], options?: TReadOptions): Promise<TGroup[]> {
    if (!ids.length) return [];
    try {
      return await this.connection
        .reader(options)(TableName.Groups)
        .whereIn("id", ids)
        .select("id", "orgId", "name", "slug")
        .orderBy("id");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find groups" });
    }
  }

  // The ids of the actor's memberships in these scopes, direct or through its groups: one UNION ALL branch per scope and
  // kind, because "actor = ? OR group IN (...)" keeps Postgres off the partial indexes and scans every membership.
  private static actorMembershipIds(
    knex: Knex,
    actor: TGrantActor,
    { orgId, projectId, scopes }: { orgId: string; projectId?: string; scopes: (AccessScope | typeof RESOURCE_SCOPE)[] }
  ): Knex.QueryBuilder {
    const directColumn = actor.type === ActorType.USER ? "actorUserId" : "actorIdentityId";
    const groupTable =
      actor.type === ActorType.USER ? TableName.UserGroupMembership : TableName.IdentityGroupMembership;
    const groupActorColumn = actor.type === ActorType.USER ? "userId" : "identityId";
    const actorGroupIds = () =>
      knex(TableName.Groups)
        .join(groupTable, `${groupTable}.groupId`, `${TableName.Groups}.id`)
        .where(`${groupTable}.${groupActorColumn}`, actor.id)
        .select(knex.ref("id").withSchema(TableName.Groups));

    const branches = scopes.flatMap((scope) => {
      const inScope = () => {
        const qb = knex(TableName.Membership).select("id").where("scopeOrgId", orgId).where("scope", scope);
        return scope === AccessScope.Organization ? qb : qb.where("scopeProjectId", projectId as string);
      };
      // IS NOT NULL is implied by the IN, but Postgres only uses the partial group index when it is stated.
      return [
        inScope().where(directColumn, actor.id),
        inScope().whereNotNull("actorGroupId").whereIn("actorGroupId", actorGroupIds())
      ];
    });
    return branches[0].unionAll(branches.slice(1));
  }

  private static async findResourceMembershipRoles(
    knex: Knex,
    membershipIds: string[]
  ): Promise<(TRoleAssignmentRecord & { membershipId: string })[]> {
    return (await knex(TableName.MembershipRole)
      .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
      .whereIn(`${TableName.MembershipRole}.membershipId`, membershipIds)
      .select(knex.ref("*").withSchema(TableName.MembershipRole))
      .select(
        knex.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
        knex.ref("name").withSchema(TableName.Role).as("customRoleName"),
        knex.ref("permissions").withSchema(TableName.Role).as("customRolePermissions")
      )
      .orderBy(`${TableName.MembershipRole}.id`)) as unknown as (TRoleAssignmentRecord & { membershipId: string })[];
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
  ): Promise<TMembershipRecord[]> {
    const query = knex(TableName.Membership)
      .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
      .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`);

    if (scope.scope !== RESOURCE_SCOPE) {
      void query.whereIn(
        `${TableName.Membership}.id`,
        GrantStore.actorMembershipIds(knex, actor, {
          orgId: scope.orgId,
          projectId: scope.scope === AccessScope.Project ? scope.projectId : undefined,
          scopes: [scope.scope]
        })
      );
    } else {
      void query
        .where(`${TableName.Membership}.scopeOrgId`, scope.orgId)
        .where(`${TableName.Membership}.scope`, scope.scope)
        .where((qb) => {
          void GrantStore.whereActorOrItsGroups(knex, qb, actor);
        })
        .where(`${TableName.Membership}.scopeProjectId`, scope.projectId)
        .where(`${TableName.Membership}.scopeResourceType`, scope.resourceType)
        .where(`${TableName.Membership}.scopeResourceId`, scope.resourceId)
        .where(`${TableName.Membership}.isActive`, true);
    }

    const rows = await GrantStore.selectMembershipRoles(knex, query);

    return GrantStore.nestRoles(rows);
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

  private static nestRoles(rows: TMembershipRoleRow[]): TMembershipRecord[] {
    const byMembership = new Map<string, TMembershipRecord>();
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
        membership = { ...(membershipColumns as Omit<TMembershipRecord, "roles">), id: membershipId, roles: [] };
        byMembership.set(membershipId, membership);
      }
      const role: TRoleAssignmentRecord = {
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
  ): Promise<TPrivilegeRecord[]> {
    const query = knex(TableName.AdditionalPrivilege)
      .where(GrantStore.privilegeActorColumn(actor), actor.id)
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
  ): Promise<TIdentityAttributeRecord[]> {
    return GrantStore.attributeQuery(knex, actor, orgId).select("id", "key", "value").orderBy("id");
  }
}
