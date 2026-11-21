import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ActionProjectType, ProjectMembershipRole, ProjectType, TMemberships } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { assertRoleSetBoundary, isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { lockMembershipsById, TMembershipDALFactory } from "@app/services/membership/membership-dal";
import {
  assertAgentVaultAdminOnlyChange,
  assertWillRetainProjectAdmin,
  lockProjectRoleChanges,
  roleNeedsPrivilegeBoundary
} from "@app/services/membership/membership-fns";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { lockAndAssertActiveOrgAccess } from "@app/services/org/org-access-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import {
  clearPersonalValuesAfterLeaving,
  TClearPersonalValuesDeps
} from "../agent-vault-personal-value/agent-vault-personal-value-fns";
import { resolveAgentVaultActorNames, TAgentVaultActorName } from "../agent-vault/agent-vault-actor-name-fns";
import {
  AGENT_VAULT_ACTOR_COLUMN,
  AgentVaultMemberType,
  TAgentVaultActorColumn
} from "../agent-vault/agent-vault-enums";
import { readableIdentityIdsOf } from "../agent-vault/agent-vault-permission";
import { TAgentVaultMemberDALFactory } from "./agent-vault-member-dal";
import {
  AGENT_VAULT_ROLE_ASSIGNMENT,
  assertAgentVaultKeptRolesWithinLimit,
  findAgentVaultMemberRole,
  isAgentVaultSelf,
  resolveAgentVaultMemberRoles,
  TAgentVaultResolvedRole
} from "./agent-vault-member-role-fns";

type TAgentVaultMembershipServiceFactoryDep = {
  agentVaultMemberDAL: Pick<
    TAgentVaultMemberDALFactory,
    "findProductMembers" | "findAvailableActors" | "findOrgIdentityIds"
  >;
  membershipDAL: Pick<TMembershipDALFactory, "insertMany" | "find" | "transaction" | "delete">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find" | "insertMany" | "delete" | "findRolesByMembershipIds">;
  roleDAL: Pick<TRoleDALFactory, "find" | "findById">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findActorsWithActiveOrgAccess" | "lockActorsForOrgAccess">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
} & TClearPersonalValuesDeps;

export type TAgentVaultMembershipServiceFactory = ReturnType<typeof agentVaultMembershipServiceFactory>;

export type TListAgentVaultProductMembersDTO = {
  projectId: string;
  ctx: TGenericPermission;
};

export type TListAgentVaultMembersDTO = {
  projectId: string;
  actorType?: AgentVaultMemberType;
  search?: string;
  limit: number;
  offset: number;
  ctx: TGenericPermission;
};

export type TAgentVaultActorRef = { type: AgentVaultMemberType; id: string };

type TAgentVaultNamedActor = TAgentVaultActorRef & { identifier: string };

export type TAgentVaultMemberIds = {
  userIds: string[];
  groupIds: string[];
  machineIdentityIds: string[];
};

// Role slugs: admin, no-access, a custom role's, or the deprecated member (the project's Member role).
export type TAddAgentVaultProductMembersDTO = TAgentVaultMemberIds & {
  projectId: string;
  emails: string[];
  usernames?: string[];
  roles: string[];
  ctx: TGenericPermission;
};

export type TUpdateAgentVaultProductMembersDTO = TAgentVaultMemberIds & {
  projectId: string;
  roles: string[];
  // Keep the roles the members hold for access bundles, which the deprecated `role` never changed.
  keepBundleRoles?: boolean;
  ctx: TGenericPermission;
};

export type TRevokeAgentVaultProductMembersDTO = TAgentVaultMemberIds & {
  projectId: string;
  ctx: TGenericPermission;
};

// actorName is for the audit body; the response schemas do not select it.
type TAgentVaultAuditedActor = TAgentVaultActorRef & { actorName?: TAgentVaultActorName };

type TAgentVaultWrittenMember = TAgentVaultAuditedActor & {
  roles: string[];
  addedAt: Date;
};

type TAgentVaultMemberWriteResult<TMember> = Promise<{
  members: TMember[];
  skipped: TAgentVaultNamedActor[];
}>;

type TMemberChange = "add" | "edit" | "remove";

const MEMBER_CHANGE_ACTIONS = {
  add: {
    user: ProjectPermissionMemberActions.Create,
    group: ProjectPermissionGroupActions.Create,
    identity: ProjectPermissionIdentityActions.Create
  },
  edit: {
    user: ProjectPermissionMemberActions.Edit,
    group: ProjectPermissionGroupActions.Edit,
    identity: ProjectPermissionIdentityActions.Edit
  },
  remove: {
    user: ProjectPermissionMemberActions.Delete,
    group: ProjectPermissionGroupActions.Delete,
    identity: ProjectPermissionIdentityActions.Delete
  }
} as const;

const ALL_ACTOR_TYPES = [AgentVaultMemberType.User, AgentVaultMemberType.Group, AgentVaultMemberType.MachineIdentity];

// An empty request is checked as every kind, so it still needs the full set rather than none.
const memberTypesOf = ({
  userIds,
  groupIds,
  machineIdentityIds,
  emails = []
}: TAgentVaultMemberIds & { emails?: string[] }) => {
  const types = [
    ...(userIds.length || emails.length ? [AgentVaultMemberType.User] : []),
    ...(groupIds.length ? [AgentVaultMemberType.Group] : []),
    ...(machineIdentityIds.length ? [AgentVaultMemberType.MachineIdentity] : [])
  ];
  return types.length ? types : ALL_ACTOR_TYPES;
};

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
  roleDAL,
  agentVaultAccessBundleDAL,
  permissionService,
  agentVaultPersonalValueDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL
}: TAgentVaultMembershipServiceFactoryDep) => {
  const getActorPermission = (projectId: string, ctx: TGenericPermission) =>
    permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });

  type TProjectPermission = Awaited<ReturnType<typeof getActorPermission>>["permission"];

  // Each kind of member takes the action on its own subject, so a role can manage users without identities.
  const assertCanChangeActorTypes = (
    permission: TProjectPermission,
    change: TMemberChange,
    types: AgentVaultMemberType[]
  ) => {
    const forbidden = ForbiddenError.from(permission);
    types.forEach((type) => {
      if (type === AgentVaultMemberType.User) {
        forbidden.throwUnlessCan(MEMBER_CHANGE_ACTIONS[change].user, ProjectPermissionSub.Member);
      } else if (type === AgentVaultMemberType.Group) {
        forbidden.throwUnlessCan(MEMBER_CHANGE_ACTIONS[change].group, ProjectPermissionSub.Groups);
      } else {
        forbidden.throwUnlessCan(MEMBER_CHANGE_ACTIONS[change].identity, ProjectPermissionSub.Identity);
      }
    });
  };

  const canChangeActorType = (permission: TProjectPermission, change: TMemberChange, type: AgentVaultMemberType) => {
    if (type === AgentVaultMemberType.User) {
      return permission.can(MEMBER_CHANGE_ACTIONS[change].user, ProjectPermissionSub.Member);
    }
    if (type === AgentVaultMemberType.Group) {
      return permission.can(MEMBER_CHANGE_ACTIONS[change].group, ProjectPermissionSub.Groups);
    }
    return permission.can(MEMBER_CHANGE_ACTIONS[change].identity, ProjectPermissionSub.Identity);
  };

  const checkCanChangeMembers = async (
    projectId: string,
    ctx: TGenericPermission,
    change: TMemberChange,
    types: AgentVaultMemberType[],
    identityIds: string[] = []
  ) => {
    const { permission, hasRole } = await getActorPermission(projectId, ctx);
    assertCanChangeActorTypes(permission, change, types);
    // A role can limit its identity rules to some identities, so each one named is checked, as the generic routes do.
    identityIds.forEach((identityId) =>
      ForbiddenError.from(permission).throwUnlessCan(
        MEMBER_CHANGE_ACTIONS[change].identity,
        subject(ProjectPermissionSub.Identity, { identityId })
      )
    );
    return { permission, isAdmin: hasRole(ProjectMembershipRole.Admin) };
  };

  // The rule the generic membership routes apply to Agent Vault projects too.
  const assertAdminOnlyChange = ({
    isAdmin,
    givesAdmin,
    touchesAdmin
  }: {
    isAdmin: boolean;
    givesAdmin: boolean;
    touchesAdmin: boolean;
  }) =>
    assertAgentVaultAdminOnlyChange({
      project: { type: ProjectType.AgentVault },
      hasRole: (role) => isAdmin && role === ProjectMembershipRole.Admin,
      givesAdmin,
      touchesAdmin
    });

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

  // The machine identities a role can read among the candidates loadIds lists, null for every one
  // (readableIdentityIdsOf).
  const readableIdentitiesAmong = (
    permission: TProjectPermission,
    types: AgentVaultMemberType[],
    loadIds: () => Promise<string[]>
  ) => (types.includes(AgentVaultMemberType.MachineIdentity) ? readableIdentityIdsOf(permission, loadIds) : null);

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
    const identityIds = await readableIdentitiesAmong(permission, readable, async () =>
      (await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId })).flatMap((row) =>
        row.actorIdentityId ? [row.actorIdentityId] : []
      )
    );

    return agentVaultMemberDAL.findProductMembers({
      projectId,
      orgId: ctx.actorOrgId,
      actorTypes: readable,
      identityIds: identityIds ?? undefined,
      search,
      limit,
      offset
    });
  };

  const listAvailableProductMembers = async ({
    projectId,
    actorType,
    search,
    limit,
    offset,
    ctx
  }: TListAgentVaultMembersDTO) => {
    const { permission } = await getActorPermission(projectId, ctx);
    const asked = actorType ? [actorType] : ALL_ACTOR_TYPES;
    // Only kinds the caller could add are offered, so each has to be both readable and addable.
    const readable = asked.filter(
      (type) => canReadActorType(permission, type) && canChangeActorType(permission, "add", type)
    );
    if (!readable.length) {
      assertCanReadActorType(permission, asked[0]);
      assertCanChangeActorTypes(permission, "add", [asked[0]]);
    }

    // Identities in the org only through a group are candidates too, as the list below reaches them.
    const identityIds = await readableIdentitiesAmong(permission, readable, () =>
      agentVaultMemberDAL.findOrgIdentityIds(ctx.actorOrgId)
    );

    return agentVaultMemberDAL.findAvailableActors({
      projectId,
      orgId: ctx.actorOrgId,
      actorTypes: readable,
      identityIds: identityIds ?? undefined,
      search,
      limit,
      offset
    });
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
            .join(", ")} to this project because they are not a member of this organization. Invite them first.`
        });
      }

      emails.forEach((email) => add(AgentVaultMemberType.User, userByEmail.get(email)!.id, email));
    }

    return [...byKey.values()];
  };

  const resolveActorNames = (actors: TAgentVaultActorRef[]) =>
    resolveAgentVaultActorNames({ userDAL, groupDAL, identityDAL }, actors);

  // resolveSession refuses an actor with no active org membership, so one added without it could never mint.
  // Users and identities need an active row of their own or an active group into the org. Reconcile revokes
  // the membership if that group path goes.
  const assertActorsAreAddable = async (actors: TAgentVaultNamedActor[], orgId: string, projectId: string) => {
    const groupIds = named(actors, AgentVaultMemberType.Group);
    const machineIdentityIds = named(actors, AgentVaultMemberType.MachineIdentity);
    const userIds = named(actors, AgentVaultMemberType.User);

    // An org reaches a group or an identity through an org-scope membership row, not by owning the row:
    // that is how a sub-org is given one of its parent's, and how the generic project membership path
    // decides the same question. Reading orgId off the group or identity refuses every linked one.
    const orgScoped = (column: TAgentVaultActorColumn, ids: string[]) =>
      ids.length
        ? membershipDAL.find({ scope: AccessScope.Organization, scopeOrgId: orgId, $in: { [column]: ids } })
        : [];

    const [groupMemberships, identityMemberships, userMemberships, identities, withActiveOrgAccess] = await Promise.all(
      [
        orgScoped("actorGroupId", groupIds),
        orgScoped("actorIdentityId", machineIdentityIds),
        orgScoped("actorUserId", userIds),
        machineIdentityIds.length ? identityDAL.find({ $in: { id: machineIdentityIds } }) : [],
        orgDAL.findActorsWithActiveOrgAccess({ orgId, userIds, identityIds: machineIdentityIds })
      ]
    );

    const activeIds = (memberships: TMemberships[], column: TAgentVaultActorColumn) =>
      new Set(memberships.filter((membership) => membership.isActive).map((membership) => membership[column]));

    const userMemberIds = withActiveOrgAccess.userIds;
    const identityMemberIds = withActiveOrgAccess.identityIds;

    // Active, so a deactivated group cannot be restored to Agent Vault by adding it again.
    const foundGroups = activeIds(groupMemberships, "actorGroupId");
    const missingGroups = groupIds.filter((id) => !foundGroups.has(id));
    if (missingGroups.length) {
      throw new NotFoundError({ message: `Group(s) ${missingGroups.map((el) => `'${el}'`).join(", ")} not found` });
    }

    // Keyed on the membership, so an identity in another org stays a 404 rather than reaching the
    // active-member check below, which would confirm it exists.
    const foundIdentities = new Set([
      ...identityMemberships.map((membership) => membership.actorIdentityId),
      ...identityMemberIds
    ]);
    const identityById = new Map(identities.map((identity) => [identity.id, identity]));
    const missingIdentities = machineIdentityIds.filter((id) => !foundIdentities.has(id));
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
          .join(", ")} belong to another project and cannot be given access to this project`
      });
    }

    // Status is not required: an org invite that has not been accepted still gets project access
    // everywhere else on the platform, and resolveSession refuses the actor until it is. isActive is the
    // real gate, so a deactivated member is still refused.
    //
    // The two refusals are separated because the remedy differs, and this runs on a role change as well as
    // an add, so neither message may name one of them.
    const deactivated: TAgentVaultNamedActor[] = [];
    const strangers: TAgentVaultNamedActor[] = [];
    actors.forEach((actor) => {
      const isUser = actor.type === AgentVaultMemberType.User;
      if (!isUser && actor.type !== AgentVaultMemberType.MachineIdentity) return;
      if ((isUser ? userMemberIds : identityMemberIds).has(actor.id)) return;

      const column = isUser ? "actorUserId" : "actorIdentityId";
      const hasRow = (isUser ? userMemberships : identityMemberships).some((row) => row[column] === actor.id);
      (hasRow ? deactivated : strangers).push(actor);
    });

    if (deactivated.length || strangers.length) {
      // Names only for the deactivated, who are in this org. The lookup is not org-scoped, so resolving a
      // stranger would hand back another tenant's email, and tell a real id apart from a made-up one.
      const nameByKey = await resolveActorNames(deactivated);
      const listOf = (refused: TAgentVaultNamedActor[]) =>
        refused.map((actor) => `'${nameByKey.get(actorKey(actor))?.name ?? actor.identifier}'`).join(", ");

      // Both, when a batch holds both: fixing one and retrying to discover the other is a wasted round
      // trip, and a bulk change is where that hurts.
      const reasons: string[] = [];
      if (deactivated.length) {
        const one = deactivated.length === 1;
        reasons.push(
          `${listOf(deactivated)} ${one ? "is" : "are"} deactivated in this organization. Reactivate ${
            one ? "them" : "those members"
          } before changing their Agent Vault access.`
        );
      }
      if (strangers.length) {
        reasons.push(
          `${listOf(strangers)} ${
            strangers.length === 1 ? "is not a member" : "are not members"
          } of this organization. Invite them to the organization first.`
        );
      }

      throw new BadRequestError({ message: reasons.join(" ") });
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
            $in: { [AGENT_VAULT_ACTOR_COLUMN[type]]: ids }
          },
          { tx }
        );
        rows.forEach((row) => {
          const id = row[AGENT_VAULT_ACTOR_COLUMN[type]];
          if (id) byActor.set(`${type}:${id}`, row);
        });
      })
    );

    return byActor;
  };

  // Giving a member a role, or changing or removing the one they hold, takes assign-role on that kind of member, and on
  // the legacy privilege system every permission of each role involved. The change actions alone would let a role that
  // only manages identities add or promote an Agent Vault admin.
  const assertRoleBoundary = async ({
    projectId,
    ctx,
    permission,
    entries,
    baseMessage
  }: {
    projectId: string;
    ctx: TGenericPermission;
    permission: TProjectPermission;
    entries: { actor: TAgentVaultActorRef; roles: string[] }[];
    baseMessage: string;
  }) => {
    if (!entries.length) return;
    const slugs = [...new Set(entries.flatMap(({ roles }) => roles))].filter(roleNeedsPrivilegeBoundary);
    const [org, roleAbilities, names] = await Promise.all([
      orgDAL.findById(ctx.actorOrgId),
      slugs.length ? permissionService.getProjectPermissionByRoles(slugs, projectId) : [],
      resolveActorNames(entries.map(({ actor }) => actor))
    ]);
    const abilityOf = new Map(roleAbilities.map((el) => [el.role?.slug, el]));

    entries.forEach(({ actor, roles }) => {
      const op = AGENT_VAULT_ROLE_ASSIGNMENT[actor.type];
      assertRoleSetBoundary({
        shouldUseNewPrivilegeSystem: Boolean(org?.shouldUseNewPrivilegeSystem),
        opActions: [...op.actions],
        opSubject: op.subject,
        actorPermission: permission,
        targetPermissions: roles.flatMap((role) => {
          const ability = abilityOf.get(role);
          return ability ? [ability] : [];
        }),
        baseMessage,
        subjectFields: op.fields(actor.id, names.get(actorKey(actor)))
      });
    });
  };

  // Read once before the write's transaction, for the admin and boundary checks, and again under its lock
  // (assertRolesUnchanged). Both take a tx so they read the primary: a replica behind a change made a moment ago would
  // make the two reads disagree and refuse a valid request. Custom roles by their slug, the way the boundary check names
  // them.
  const currentRolesOf = async (projectId: string, actors: TAgentVaultActorRef[], tx: Knex) => {
    const memberships = await findMembershipsForActors(projectId, actors, tx);
    const membershipIds = [...memberships.values()].map((membership) => membership.id);
    const roles = membershipIds.length ? await membershipRoleDAL.findRolesByMembershipIds(membershipIds, tx) : [];
    return actors.flatMap((actor) => {
      const membership = memberships.get(actorKey(actor));
      if (!membership) return [];
      return [
        {
          actor,
          // An expired temporary role confers nothing, so the admin and boundary checks leave it out, as the generic
          // routes' guards do.
          roles: roles
            .filter((role) => role.membershipId === membership.id && isActiveRole(role))
            .map((role) => role.customRoleSlug || role.role)
        }
      ];
    });
  };

  // The admin and boundary checks ran on roles read before the write's lock. If another change got in since, this write
  // would skip those checks for the roles it now finds (an admin promoted in the meantime, say), so it starts over. An
  // admin passes both checks whatever the members hold, so callers skip this for one.
  const assertRolesUnchanged = async (
    projectId: string,
    actors: TAgentVaultActorRef[],
    checked: { actor: TAgentVaultActorRef; roles: string[] }[],
    tx: Knex
  ) => {
    const byActor = (entries: { actor: TAgentVaultActorRef; roles: string[] }[]) =>
      new Map(entries.map(({ actor, roles }) => [actorKey(actor), [...roles].sort().join(",")]));
    const before = byActor(checked);
    const now = byActor(await currentRolesOf(projectId, actors, tx));
    if (before.size !== now.size || [...before].some(([key, roles]) => now.get(key) !== roles)) {
      throw new ConflictError({ message: "A member's roles changed while this request was running. Try again." });
    }
  };

  const roleRowsFor = (membershipIds: string[], resolved: TAgentVaultResolvedRole[]) =>
    membershipIds.flatMap((membershipId) =>
      resolved.map(({ role, customRoleId }) => ({ membershipId, role, ...(customRoleId ? { customRoleId } : {}) }))
    );

  const addProductMembers = async ({
    projectId,
    roles,
    ctx,
    emails,
    usernames = [],
    ...ids
  }: TAddAgentVaultProductMembersDTO): TAgentVaultMemberWriteResult<TAgentVaultWrittenMember> => {
    const { permission, isAdmin } = await checkCanChangeMembers(
      projectId,
      ctx,
      "add",
      memberTypesOf({ ...ids, emails: [...emails, ...usernames] }),
      ids.machineIdentityIds
    );
    const resolved = await resolveAgentVaultMemberRoles(roleDAL, { projectId, slugs: roles });
    const slugs = resolved.map((entry) => entry.slug);
    assertAdminOnlyChange({ isAdmin, givesAdmin: slugs.includes(ProjectMembershipRole.Admin), touchesAdmin: false });

    // A username is matched the same way as an email, by the user's username and then their SSO aliases.
    const actors = await resolveNamedActors({ ...ids, emails: [...emails, ...usernames] }, ctx.actorOrgId);
    await assertActorsAreAddable(actors, ctx.actorOrgId, projectId);
    await assertRoleBoundary({
      projectId,
      ctx,
      permission,
      entries: actors.map((actor) => ({ actor, roles: slugs })),
      baseMessage: "Failed to add the member with this role"
    });

    const nameByKey = await resolveActorNames(actors);

    const written = await membershipDAL.transaction(async (tx) => {
      const existing = await findMembershipsForActors(projectId, actors, tx);
      const skipped = actors.filter((actor) => existing.has(actorKey(actor)));
      const toCreate = actors.filter((actor) => !existing.has(actorKey(actor)));
      if (!toCreate.length) return { created: [], skipped };

      await lockAndAssertActiveOrgAccess(
        {
          orgDAL,
          orgId: ctx.actorOrgId,
          userIds: named(toCreate, AgentVaultMemberType.User),
          identityIds: named(toCreate, AgentVaultMemberType.MachineIdentity)
        },
        tx
      );

      const memberships = await membershipDAL.insertMany(
        toCreate.map((actor) => ({
          scope: AccessScope.Project,
          scopeOrgId: ctx.actorOrgId,
          scopeProjectId: projectId,
          [AGENT_VAULT_ACTOR_COLUMN[actor.type]]: actor.id,
          isActive: true
        })),
        tx
      );

      await membershipRoleDAL.insertMany(
        roleRowsFor(
          memberships.map((membership) => membership.id),
          resolved
        ),
        tx
      );

      const addedUserIds = named(toCreate, AgentVaultMemberType.User);
      if (addedUserIds.length) {
        await projectAccessRequestDAL.delete({ projectId, $in: { requesterUserId: addedUserIds } }, tx);
      }

      const membershipByActor = new Map(
        memberships.map((membership) => {
          const type = ALL_ACTOR_TYPES.find((el) => membership[AGENT_VAULT_ACTOR_COLUMN[el]])!;
          return [`${type}:${membership[AGENT_VAULT_ACTOR_COLUMN[type]]!}`, membership];
        })
      );

      return {
        created: toCreate.map((actor) => {
          const membership = membershipByActor.get(actorKey(actor))!;
          return {
            type: actor.type,
            id: actor.id,
            roles: slugs,
            addedAt: membership.createdAt,
            actorName: nameByKey.get(actorKey(actor))
          };
        }),
        skipped
      };
    });

    return { members: written.created, skipped: written.skipped };
  };

  const updateProductMemberRoles = async ({
    projectId,
    roles,
    keepBundleRoles = false,
    ctx,
    ...ids
  }: TUpdateAgentVaultProductMembersDTO): TAgentVaultMemberWriteResult<TAgentVaultWrittenMember> => {
    const { permission, isAdmin } = await checkCanChangeMembers(
      projectId,
      ctx,
      "edit",
      memberTypesOf(ids),
      ids.machineIdentityIds
    );
    const resolved = await resolveAgentVaultMemberRoles(roleDAL, { projectId, slugs: roles });
    const slugs = resolved.map((entry) => entry.slug);
    const givesAdmin = slugs.includes(ProjectMembershipRole.Admin);

    const actors = await resolveNamedActors({ ...ids, emails: [] }, ctx.actorOrgId);

    if (actors.some((actor) => isAgentVaultSelf(actor, ctx))) {
      throw new ForbiddenRequestError({ message: "You cannot change your own role" });
    }

    const current = await membershipDAL.transaction((tx) => currentRolesOf(projectId, actors, tx));
    assertAdminOnlyChange({
      isAdmin,
      givesAdmin,
      touchesAdmin: current.some((entry) => entry.roles.includes(ProjectMembershipRole.Admin))
    });
    await assertRoleBoundary({
      projectId,
      ctx,
      permission,
      entries: current,
      baseMessage: "Failed to change the role of a more privileged member"
    });
    await assertRoleBoundary({
      projectId,
      ctx,
      permission,
      entries: actors.map((actor) => ({ actor, roles: slugs })),
      baseMessage: "Failed to give the member this role"
    });

    // Promotion only: a deactivated member must not be made an admin, but taking admin away from one has
    // to work without reactivating them first.
    if (givesAdmin) {
      await assertActorsAreAddable(actors, ctx.actorOrgId, projectId);
    }

    const nameByKey = await resolveActorNames(actors);

    const written = await membershipDAL.transaction(async (tx) => {
      // Before the roles are read, not only around the admin count: two changes for one member that both
      // read the old role would each insert their own, leaving the member with two roles.
      await lockProjectRoleChanges(projectId, tx);
      if (!isAdmin) await assertRolesUnchanged(projectId, actors, current, tx);
      const existing = await findMembershipsForActors(projectId, actors, tx);
      const held = actors.filter((actor) => existing.has(actorKey(actor)));
      const heldMembershipIds = held.map((actor) => existing.get(actorKey(actor))!.id);

      const currentRoles = heldMembershipIds.length
        ? await membershipRoleDAL.find({ $in: { membershipId: heldMembershipIds } }, { tx })
        : [];
      // A role whose time limit has ended grants nothing and no member list shows it, so it counts as not held, and
      // naming it again gives it afresh.
      const liveRoles = currentRoles.filter(isActiveRole);
      // Slug by role id, for every access bundle's role in the project.
      const bundleRoles = new Map<string, string>();
      if (keepBundleRoles) {
        const bundleRoleIds = (await agentVaultAccessBundleDAL.find({ projectId }, { tx })).flatMap((bundle) =>
          bundle.grantRoleId ? [bundle.grantRoleId] : []
        );
        if (bundleRoleIds.length) {
          (await roleDAL.find({ $in: { id: bundleRoleIds } }, { tx })).forEach((role) =>
            bundleRoles.set(role.id, role.slug)
          );
        }
      }
      const keyOfRole = ({ role, customRoleId }: { role: string; customRoleId?: string | null }) =>
        customRoleId ? `custom:${customRoleId}` : role;
      const requestedKeys = new Set(resolved.map(keyOfRole));
      const isKeptBundleRole = (row: { customRoleId?: string | null }) =>
        Boolean(row.customRoleId && bundleRoles.has(row.customRoleId));
      // A role the request names again keeps its row as it is, time limit included, so resending a member's roles to add
      // one never makes a time-limited role permanent. A bundle's role stays too when it's kept.
      const keptOf = (membershipId: string) =>
        liveRoles.filter(
          (row) => row.membershipId === membershipId && (requestedKeys.has(keyOfRole(row)) || isKeptBundleRole(row))
        );
      const wantedOf = (membershipId: string) => new Set([...requestedKeys, ...keptOf(membershipId).map(keyOfRole)]);
      const alreadyInRole = new Set(
        heldMembershipIds.filter((membershipId) => {
          const heldRoles = new Set(liveRoles.filter((el) => el.membershipId === membershipId).map(keyOfRole));
          const wanted = wantedOf(membershipId);
          return heldRoles.size === wanted.size && [...wanted].every((key) => heldRoles.has(key));
        })
      );

      // Skipped covers both a non-member and a member already in the role, so neither writes an audit event.
      const toChange = held.filter((actor) => !alreadyInRole.has(existing.get(actorKey(actor))!.id));
      const skipped = actors.filter((actor) => !toChange.includes(actor));
      if (!toChange.length) return { updated: [], skipped };

      const membershipIds = toChange.map((actor) => existing.get(actorKey(actor))!.id);
      membershipIds.forEach((membershipId) => assertAgentVaultKeptRolesWithinLimit(wantedOf(membershipId).size));

      // One check for the whole batch: per actor, two admins each pass on the other still standing.
      if (!givesAdmin) {
        await assertWillRetainProjectAdmin({
          scopeProjectId: projectId,
          excludeMembershipIds: membershipIds,
          productLabel: "This project",
          tx
        });
      }

      // A kept row stays as it is, temporary access included, and is never given twice.
      const keptRows = membershipIds.flatMap(keptOf);
      const keptIds = new Set(keptRows.map((row) => row.id));
      const replaced = currentRoles.filter((row) => membershipIds.includes(row.membershipId) && !keptIds.has(row.id));
      if (replaced.length) await membershipRoleDAL.delete({ $in: { id: replaced.map((row) => row.id) } }, tx);
      const newRows = roleRowsFor(membershipIds, resolved).filter(
        (row) => !keptRows.some((kept) => kept.membershipId === row.membershipId && keyOfRole(kept) === keyOfRole(row))
      );
      await membershipRoleDAL.insertMany(newRows, tx);

      const rolesOf = (membershipId: string) => [
        ...slugs,
        ...keptOf(membershipId)
          .filter(isKeptBundleRole)
          .map((row) => bundleRoles.get(row.customRoleId!)!)
          .filter((slug) => !slugs.includes(slug))
      ];

      return {
        updated: toChange.map((actor) => ({
          type: actor.type,
          id: actor.id,
          roles: rolesOf(existing.get(actorKey(actor))!.id),
          addedAt: existing.get(actorKey(actor))!.createdAt,
          actorName: nameByKey.get(actorKey(actor))
        })),
        skipped
      };
    });

    return { members: written.updated, skipped: written.skipped };
  };

  const revokeProductMembers = async ({
    projectId,
    ctx,
    ...ids
  }: TRevokeAgentVaultProductMembersDTO): TAgentVaultMemberWriteResult<TAgentVaultAuditedActor> => {
    const { permission, isAdmin } = await checkCanChangeMembers(
      projectId,
      ctx,
      "remove",
      memberTypesOf(ids),
      ids.machineIdentityIds
    );

    const actors = await resolveNamedActors({ ...ids, emails: [] }, ctx.actorOrgId);

    // Naming yourself is a mistake, not a no-op: skipping it would let an admin believe they had left.
    if (actors.some((actor) => isAgentVaultSelf(actor, ctx))) {
      throw new ForbiddenRequestError({ message: "You cannot remove your own access" });
    }

    const current = await membershipDAL.transaction((tx) => currentRolesOf(projectId, actors, tx));
    assertAdminOnlyChange({
      isAdmin,
      givesAdmin: false,
      touchesAdmin: current.some((entry) => entry.roles.includes(ProjectMembershipRole.Admin))
    });
    await assertRoleBoundary({
      projectId,
      ctx,
      permission,
      entries: current,
      baseMessage: "Failed to remove a more privileged member"
    });

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
      // The lock a role change takes, so a promotion can't land between the checks above and this removal.
      await lockProjectRoleChanges(projectId, tx);
      if (!isAdmin) await assertRolesUnchanged(projectId, actors, current, tx);
      const existing = await findMembershipsForActors(projectId, actors, tx);
      const skipped = actors.filter((actor) => !existing.has(actorKey(actor)));
      const held = actors.filter((actor) => existing.has(actorKey(actor)));
      if (!held.length) return { removed: [], skipped };

      const membershipIds = held.map((actor) => existing.get(actorKey(actor))!.id);

      // One check for the whole batch: per actor, two admins each pass on the other still standing.
      await assertWillRetainProjectAdmin({
        scopeProjectId: projectId,
        excludeMembershipIds: membershipIds,
        productLabel: "This project",
        tx
      });

      // In id order before anything is deleted, the order a delegation save takes them in. A multi-row delete takes
      // its rows in whatever order its plan reads them, so without this the two could each hold a row the other wants.
      await lockMembershipsById(membershipIds, tx);

      // membership_roles and the delegation rows cascade on the membership FK, so the roles go with these rows, as do
      // an identity's delegation and the users and groups a delegation names.
      await membershipDAL.delete({ $in: { id: membershipIds } }, tx);

      // Their own variables stay, as they would if they only lost a role.
      await clearPersonalValuesAfterLeaving(
        { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL },
        {
          projectId,
          userIds: named(held, AgentVaultMemberType.User),
          identityIds: named(held, AgentVaultMemberType.MachineIdentity),
          groupIds: named(held, AgentVaultMemberType.Group)
        },
        tx
      );

      return {
        removed: held.map((actor) => ({
          type: actor.type,
          id: actor.id,
          actorName: nameByKey.get(actorKey(actor))
        })),
        skipped
      };
    });

    return { members: written.removed, skipped: written.skipped };
  };

  // The current slug of the Member role the role migration made, found by its id, so a renamed or suffixed slug still
  // reads as `member` in the deprecated `role` field and another role's slug never does. Null in a project without one.
  const findMemberRoleSlug = async (projectId: string) =>
    (await findAgentVaultMemberRole(roleDAL, projectId))?.slug ?? null;

  return {
    listProductMembers,
    listAvailableProductMembers,
    addProductMembers,
    updateProductMemberRoles,
    revokeProductMembers,
    findMemberRoleSlug
  };
};
