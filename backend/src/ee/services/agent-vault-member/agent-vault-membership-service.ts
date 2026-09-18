import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  ActionProjectType,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceType,
  TMemberships
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { AgentVaultIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { assertWillRetainProjectAdmin } from "@app/services/membership/membership-fns";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultMemberType } from "../agent-vault/agent-vault-enums";
import { TAgentVaultMemberDALFactory } from "./agent-vault-member-dal";

type TAgentVaultMembershipServiceFactoryDep = {
  agentVaultMemberDAL: Pick<TAgentVaultMemberDALFactory, "findProductMembers">;
  membershipDAL: Pick<TMembershipDALFactory, "insertMany" | "find" | "transaction" | "delete">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "insertMany" | "delete">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findActiveEffectiveOrgMemberActorIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emitForProject">;
};

export type TAgentVaultMembershipServiceFactory = ReturnType<typeof agentVaultMembershipServiceFactory>;

export type TListAgentVaultProductMembersDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TListAgentVaultMembersDTO = {
  projectId: string;
  actorType?: AgentVaultMemberType;
  search?: string;
  limit: number;
  offset: number;
  ctx: TAgentVaultActorContext;
};

export type TAgentVaultActorRef = { type: AgentVaultMemberType; id: string };

type TAgentVaultNamedActor = TAgentVaultActorRef & { identifier: string };

export type TAgentVaultMemberIds = {
  userIds: string[];
  groupIds: string[];
  machineIdentityIds: string[];
};

export type TAddAgentVaultProductMembersDTO = TAgentVaultMemberIds & {
  projectId: string;
  emails: string[];
  role: ProjectMembershipRole.Admin | ProjectMembershipRole.Member;
  ctx: TAgentVaultActorContext;
};

export type TUpdateAgentVaultProductMemberDTO = {
  projectId: string;
  actor: TAgentVaultActorRef;
  role: string;
  ctx: TAgentVaultActorContext;
};

export type TRevokeAgentVaultProductMembersDTO = TAgentVaultMemberIds & {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

// actorName is for the audit body; the response schemas do not select it.
type TAgentVaultWrittenMember = {
  id: string;
  role: string;
  createdAt: Date;
  actor: TAgentVaultActorRef;
  actorName?: string;
};

type TAgentVaultMemberWriteResult = Promise<{
  members: TAgentVaultWrittenMember[];
  skipped: TAgentVaultNamedActor[];
}>;

const VALID_PRODUCT_ROLES: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member];

const ALL_ACTOR_TYPES = [AgentVaultMemberType.User, AgentVaultMemberType.Group, AgentVaultMemberType.MachineIdentity];

const ACTOR_COLUMN: Record<AgentVaultMemberType, "actorUserId" | "actorIdentityId" | "actorGroupId"> = {
  [AgentVaultMemberType.User]: "actorUserId",
  [AgentVaultMemberType.MachineIdentity]: "actorIdentityId",
  [AgentVaultMemberType.Group]: "actorGroupId"
};

const ACTOR_LABEL: Record<AgentVaultMemberType, string> = {
  [AgentVaultMemberType.User]: "User",
  [AgentVaultMemberType.MachineIdentity]: "Machine identity",
  [AgentVaultMemberType.Group]: "Group"
};

const actorToIds = (actor: TAgentVaultActorRef): TAgentVaultMemberIds => ({
  userIds: actor.type === AgentVaultMemberType.User ? [actor.id] : [],
  groupIds: actor.type === AgentVaultMemberType.Group ? [actor.id] : [],
  machineIdentityIds: actor.type === AgentVaultMemberType.MachineIdentity ? [actor.id] : []
});

const isSelf = (actor: TAgentVaultActorRef, ctx: TAgentVaultActorContext) =>
  (actor.type === AgentVaultMemberType.User && ctx.actor === ActorType.USER && actor.id === ctx.actorId) ||
  (actor.type === AgentVaultMemberType.MachineIdentity && ctx.actor === ActorType.IDENTITY && actor.id === ctx.actorId);

export const agentVaultMembershipServiceFactory = ({
  agentVaultMemberDAL,
  membershipDAL,
  identityDAL,
  membershipRoleDAL,
  groupDAL,
  projectAccessRequestDAL,
  userDAL,
  userAliasDAL,
  orgDAL,
  permissionService,
  usageMeteringService
}: TAgentVaultMembershipServiceFactoryDep) => {
  const getActorPermission = (projectId: string, ctx: TAgentVaultActorContext) =>
    permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });

  const checkProductAdmin = async (projectId: string, ctx: TAgentVaultActorContext) => {
    const { hasRole } = await getActorPermission(projectId, ctx);
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only Agent Vault admins can perform this action" });
    }
  };

  type TProjectPermission = Awaited<ReturnType<typeof getActorPermission>>["permission"];

  const canReadActorType = (permission: TProjectPermission, type: AgentVaultMemberType) => {
    if (type === AgentVaultMemberType.User) {
      return permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
    }
    if (type === AgentVaultMemberType.Group) {
      return permission.can(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
    }
    return permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);
  };

  const assertCanReadActorType = (permission: TProjectPermission, type: AgentVaultMemberType) => {
    const forbidden = ForbiddenError.from(permission);
    if (type === AgentVaultMemberType.User) {
      forbidden.throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
      return;
    }
    if (type === AgentVaultMemberType.Group) {
      forbidden.throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
      return;
    }
    forbidden.throwUnlessCan(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);
  };

  const listProductMembers = async ({
    projectId,
    actorType,
    search,
    limit,
    offset,
    ctx
  }: TListAgentVaultMembersDTO) => {
    const { permission } = await getActorPermission(projectId, ctx);

    const asked = actorType ? [actorType] : ALL_ACTOR_TYPES;
    const readable = asked.filter((type) => canReadActorType(permission, type));
    if (!readable.length) assertCanReadActorType(permission, asked[0]);

    return agentVaultMemberDAL.findProductMembers({
      projectId,
      orgId: ctx.actorOrgId,
      actorTypes: readable,
      search,
      limit,
      offset
    });
  };

  const assertValidRole = (role: string) => {
    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }
  };

  const actorKey = (actor: TAgentVaultActorRef) => `${actor.type}:${actor.id}`;

  const named = (actors: { type: AgentVaultMemberType; id: string }[], type: AgentVaultMemberType) =>
    actors.filter((actor) => actor.type === type).map((actor) => actor.id);

  const resolveNamedActors = async (
    { userIds, groupIds, machineIdentityIds, emails }: TAgentVaultMemberIds & { emails?: string[] },
    orgId: string
  ) => {
    const byKey = new Map<string, TAgentVaultNamedActor>();
    const add = (type: AgentVaultMemberType, id: string, identifier: string) => {
      const key = `${type}:${id}`;
      if (!byKey.has(key)) byKey.set(key, { type, id, identifier });
    };

    userIds.forEach((id) => add(AgentVaultMemberType.User, id, id));
    groupIds.forEach((id) => add(AgentVaultMemberType.Group, id, id));
    machineIdentityIds.forEach((id) => add(AgentVaultMemberType.MachineIdentity, id, id));

    if (emails?.length) {
      const usersByEmail = await userDAL.find({ $in: { username: emails } });
      const userByEmail = new Map(usersByEmail.map((user) => [user.username, user]));

      // The invite this accompanies resolves IdP identifiers through SSO aliases, so this half has to as well.
      const unmatched = emails.filter((email) => !userByEmail.has(email));
      if (unmatched.length) {
        const org = await orgDAL.findById(orgId);
        const { resolved, ambiguousIdentifiers } = await resolveUsersBySsoExternalId({
          identifiers: unmatched,
          orgId,
          rootOrgId: org?.rootOrgId,
          userAliasDAL,
          userDAL
        });

        if (ambiguousIdentifiers.length) {
          throw new BadRequestError({
            message: `Identifier(s) ${ambiguousIdentifiers
              .map((el) => `'${el}'`)
              .join(
                ", "
              )} match more than one SSO account in this organization. Use the user's email address instead, or contact support to resolve the duplicate.`
          });
        }

        resolved.forEach((user, identifier) => userByEmail.set(identifier, user));
      }

      const unresolved = emails.filter((email) => !userByEmail.has(email));
      if (unresolved.length) {
        throw new BadRequestError({
          message: `Cannot add ${unresolved
            .map((el) => `'${el}'`)
            .join(", ")} to Agent Vault because they are not a member of this organization. Invite them first.`
        });
      }

      emails.forEach((email) => add(AgentVaultMemberType.User, userByEmail.get(email)!.id, email));
    }

    return [...byKey.values()];
  };

  const resolveActorNames = async (actors: TAgentVaultNamedActor[]) => {
    const [users, groups, identities] = await Promise.all([
      named(actors, AgentVaultMemberType.User).length
        ? userDAL.find({ $in: { id: named(actors, AgentVaultMemberType.User) } })
        : [],
      named(actors, AgentVaultMemberType.Group).length
        ? groupDAL.find({ $in: { id: named(actors, AgentVaultMemberType.Group) } })
        : [],
      named(actors, AgentVaultMemberType.MachineIdentity).length
        ? identityDAL.find({ $in: { id: named(actors, AgentVaultMemberType.MachineIdentity) } })
        : []
    ]);

    const nameByKey = new Map<string, string>();
    users.forEach((user) => nameByKey.set(`${AgentVaultMemberType.User}:${user.id}`, user.username));
    groups.forEach((group) => nameByKey.set(`${AgentVaultMemberType.Group}:${group.id}`, group.name));
    identities.forEach((identity) =>
      nameByKey.set(`${AgentVaultMemberType.MachineIdentity}:${identity.id}`, identity.name)
    );
    return nameByKey;
  };

  // resolveSession refuses an actor with no active org membership, so one added without it could never mint.
  const assertActorsAreAddable = async (actors: TAgentVaultNamedActor[], orgId: string, projectId: string) => {
    const groupIds = named(actors, AgentVaultMemberType.Group);
    const machineIdentityIds = named(actors, AgentVaultMemberType.MachineIdentity);
    const userIds = named(actors, AgentVaultMemberType.User);

    const [groups, identities, userMemberIds, identityMemberIds] = await Promise.all([
      groupIds.length ? groupDAL.find({ $in: { id: groupIds }, orgId }) : [],
      machineIdentityIds.length ? identityDAL.find({ $in: { id: machineIdentityIds }, orgId }) : [],
      orgDAL.findActiveEffectiveOrgMemberActorIds({ actorType: ActorType.USER, actorIds: userIds, orgId }),
      orgDAL.findActiveEffectiveOrgMemberActorIds({
        actorType: ActorType.IDENTITY,
        actorIds: machineIdentityIds,
        orgId
      })
    ]);

    const foundGroups = new Set(groups.map((group) => group.id));
    const missingGroups = groupIds.filter((id) => !foundGroups.has(id));
    if (missingGroups.length) {
      throw new NotFoundError({ message: `Group(s) ${missingGroups.map((el) => `'${el}'`).join(", ")} not found` });
    }

    const identityById = new Map(identities.map((identity) => [identity.id, identity]));
    const missingIdentities = machineIdentityIds.filter((id) => !identityById.has(id));
    if (missingIdentities.length) {
      throw new NotFoundError({
        message: `Machine identity(s) ${missingIdentities.map((el) => `'${el}'`).join(", ")} not found`
      });
    }

    // An identity created inside another product still carries an org-scope NoAccess membership, so the
    // org check below passes for it. Only Agent Vault's own identities and unscoped org ones belong here.
    const foreign = machineIdentityIds.filter((id) => {
      const projectOfIdentity = identityById.get(id)?.projectId;
      return projectOfIdentity && projectOfIdentity !== projectId;
    });
    if (foreign.length) {
      throw new BadRequestError({
        message: `Machine identity(s) ${foreign
          .map((el) => `'${el}'`)
          .join(", ")} belong to another project and cannot be given access to Agent Vault`
      });
    }

    // Status is not required: an org invite that has not been accepted still gets project access
    // everywhere else on the platform, and resolveSession refuses the actor until it is. isActive is the
    // real gate, so a deactivated member is still refused.
    const outsiders = actors.filter((actor) => {
      if (actor.type === AgentVaultMemberType.User) return !userMemberIds.has(actor.id);
      if (actor.type === AgentVaultMemberType.MachineIdentity) return !identityMemberIds.has(actor.id);
      return false;
    });
    if (outsiders.length) {
      throw new BadRequestError({
        message: `Cannot add ${outsiders
          .map((actor) => `'${actor.identifier}'`)
          .join(
            ", "
          )} to Agent Vault because they are not an active member of this organization. Invite them to the organization first.`
      });
    }
  };

  const findMembershipsForActors = async (projectId: string, actors: TAgentVaultActorRef[], tx?: Knex) => {
    const byActor = new Map<string, TMemberships>();

    await Promise.all(
      ALL_ACTOR_TYPES.map(async (type) => {
        const ids = named(actors, type);
        if (!ids.length) return;
        const rows = await membershipDAL.find(
          {
            scope: AccessScope.Project,
            scopeProjectId: projectId,
            $in: { [ACTOR_COLUMN[type]]: ids }
          },
          { tx }
        );
        rows.forEach((row) => {
          const id = row[ACTOR_COLUMN[type]];
          if (id) byActor.set(`${type}:${id}`, row);
        });
      })
    );

    return byActor;
  };

  const addProductMembers = async ({
    projectId,
    role,
    ctx,
    emails,
    ...ids
  }: TAddAgentVaultProductMembersDTO): TAgentVaultMemberWriteResult => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    const actors = await resolveNamedActors({ ...ids, emails }, ctx.actorOrgId);
    await assertActorsAreAddable(actors, ctx.actorOrgId, projectId);

    const nameByKey = await resolveActorNames(actors);

    const written = await membershipDAL.transaction(async (tx) => {
      const existing = await findMembershipsForActors(projectId, actors, tx);
      const skipped = actors.filter((actor) => existing.has(actorKey(actor)));
      const toCreate = actors.filter((actor) => !existing.has(actorKey(actor)));
      if (!toCreate.length) return { created: [], skipped };

      const memberships = await membershipDAL.insertMany(
        toCreate.map((actor) => ({
          scope: AccessScope.Project,
          scopeOrgId: ctx.actorOrgId,
          scopeProjectId: projectId,
          [ACTOR_COLUMN[actor.type]]: actor.id,
          isActive: true
        })),
        tx
      );

      await membershipRoleDAL.insertMany(
        memberships.map((membership) => ({ membershipId: membership.id, role })),
        tx
      );

      const addedUserIds = named(toCreate, AgentVaultMemberType.User);
      if (addedUserIds.length) {
        await projectAccessRequestDAL.delete({ projectId, $in: { requesterUserId: addedUserIds } }, tx);
      }

      const membershipByActor = new Map(
        memberships.map((membership) => {
          const type = ALL_ACTOR_TYPES.find((el) => membership[ACTOR_COLUMN[el]])!;
          return [`${type}:${membership[ACTOR_COLUMN[type]]!}`, membership];
        })
      );

      return {
        created: toCreate.map((actor) => {
          const membership = membershipByActor.get(actorKey(actor))!;
          return {
            id: membership.id,
            role,
            createdAt: membership.createdAt,
            actor: { type: actor.type, id: actor.id },
            actorName: nameByKey.get(actorKey(actor))
          };
        }),
        skipped
      };
    });

    if (written.created.length) usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    return { members: written.created, skipped: written.skipped };
  };

  const updateProductMemberRole = async ({ projectId, actor, role, ctx }: TUpdateAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    if (isSelf(actor, ctx)) throw new ForbiddenRequestError({ message: "You cannot change your own role" });

    const [namedActor] = await resolveNamedActors({ ...actorToIds(actor), emails: [] }, ctx.actorOrgId);
    // The add paths check this; promoting did not, so a deactivated member could still be made an admin.
    await assertActorsAreAddable([namedActor], ctx.actorOrgId, projectId);

    const nameByKey = await resolveActorNames([namedActor]);

    return membershipDAL.transaction(async (tx) => {
      const memberships = await findMembershipsForActors(projectId, [actor], tx);
      const membership = memberships.get(actorKey(actor));
      if (!membership) {
        throw new NotFoundError({ message: `${ACTOR_LABEL[actor.type]} does not have access to Agent Vault` });
      }

      if (role !== ProjectMembershipRole.Admin) {
        await assertWillRetainProjectAdmin({
          scopeProjectId: projectId,
          excludeMembershipIds: [membership.id],
          productLabel: "Agent Vault",
          tx
        });
      }

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      return {
        member: {
          id: membership.id,
          role: membershipRole.role,
          createdAt: membership.createdAt,
          actor,
          actorName: nameByKey.get(actorKey(actor))
        }
      };
    });
  };

  const revokeProductMembers = async ({
    projectId,
    ctx,
    ...ids
  }: TRevokeAgentVaultProductMembersDTO): TAgentVaultMemberWriteResult => {
    await checkProductAdmin(projectId, ctx);

    const actors = await resolveNamedActors({ ...ids, emails: [] }, ctx.actorOrgId);

    // Naming yourself is a mistake, not a no-op: skipping it would let an admin believe they had left.
    if (actors.some((actor) => isSelf(actor, ctx))) {
      throw new ForbiddenRequestError({ message: "You cannot remove your own access" });
    }

    // An identity scoped to this project exists only to be an Agent Vault member. Detaching it would leave
    // a live identity no screen can reach: this tab lists by membership, and the org list hides scoped ones.
    const machineIdentityIds = named(actors, AgentVaultMemberType.MachineIdentity);
    if (machineIdentityIds.length) {
      const owned = (await identityDAL.find({ $in: { id: machineIdentityIds }, projectId })).map((el) => el.id);
      if (owned.length) {
        throw new BadRequestError({
          message: `Machine identity(s) ${owned
            .map((el) => `'${el}'`)
            .join(", ")} are managed by Agent Vault. Delete the identity instead of removing its access`
        });
      }
    }

    const nameByKey = await resolveActorNames(actors);

    const written = await membershipDAL.transaction(async (tx) => {
      const existing = await findMembershipsForActors(projectId, actors, tx);
      const skipped = actors.filter((actor) => !existing.has(actorKey(actor)));
      const held = actors.filter((actor) => existing.has(actorKey(actor)));
      if (!held.length) return { removed: [], skipped };

      const membershipIds = held.map((actor) => existing.get(actorKey(actor))!.id);

      // One check for the whole batch: per actor, two admins each pass on the other still standing.
      await assertWillRetainProjectAdmin({
        scopeProjectId: projectId,
        excludeMembershipIds: membershipIds,
        productLabel: "Agent Vault",
        tx
      });

      await Promise.all(
        ALL_ACTOR_TYPES.map(async (type) => {
          const typeIds = named(held, type);
          if (!typeIds.length) return;
          await membershipDAL.delete(
            {
              scope: RESOURCE_SCOPE,
              scopeProjectId: projectId,
              scopeResourceType: ResourceType.AgentVaultAccessBundle,
              $in: { [ACTOR_COLUMN[type]]: typeIds }
            },
            tx
          );
        })
      );

      // membership_roles cascades on the membership FK, so the roles go with these rows.
      await membershipDAL.delete({ $in: { id: membershipIds } }, tx);

      return {
        removed: held.map((actor) => {
          const membership = existing.get(actorKey(actor))!;
          return {
            id: membership.id,
            role: "",
            createdAt: membership.createdAt,
            actor: { type: actor.type, id: actor.id },
            actorName: nameByKey.get(actorKey(actor))
          };
        }),
        skipped
      };
    });

    if (written.removed.length) usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    return { members: written.removed, skipped: written.skipped };
  };
  return {
    listProductMembers,
    addProductMembers,
    updateProductMemberRole,
    revokeProductMembers
  };
};
