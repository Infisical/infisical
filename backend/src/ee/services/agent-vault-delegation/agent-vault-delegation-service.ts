import { AccessScope } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { AgentVaultDelegationScope } from "../agent-vault/agent-vault-enums";
import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import {
  TAgentVaultDelegationDALFactory,
  TAgentVaultDelegationSubjectDALFactory,
  TAgentVaultDelegationView
} from "./agent-vault-delegation-dal";
import {
  TDeleteDelegationDTO,
  TGetDelegationDTO,
  TListDelegationsDTO,
  TSetDelegationDTO
} from "./agent-vault-delegation-types";

type TAgentVaultDelegationServiceFactoryDep = {
  agentVaultDelegationDAL: Pick<
    TAgentVaultDelegationDALFactory,
    "upsertScope" | "findViews" | "delete" | "transaction"
  >;
  agentVaultDelegationSubjectDAL: Pick<TAgentVaultDelegationSubjectDALFactory, "delete" | "insertMany">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "findOne">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAgentVaultDelegationServiceFactory = ReturnType<typeof agentVaultDelegationServiceFactory>;

// The row id stays internal: a delegation is named by its machine identity, the one id a client sends back.
const toDelegation = ({ id, ...delegation }: TAgentVaultDelegationView) => delegation;

const quoted = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

export const agentVaultDelegationServiceFactory = ({
  agentVaultDelegationDAL,
  agentVaultDelegationSubjectDAL,
  membershipDAL,
  userGroupMembershipDAL,
  permissionService
}: TAgentVaultDelegationServiceFactoryDep) => {
  const checkAdmin = async (projectId: string, ctx: TGenericPermission) => {
    const { isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    if (!isAdmin) {
      throw new ForbiddenRequestError({
        message: "Only Agent Vault admins can manage which users a machine identity acts on behalf of"
      });
    }
  };

  const notFound = (machineIdentityId: string) =>
    new NotFoundError({
      message: `Machine identity with ID '${machineIdentityId}' has no delegation, so it can't act on behalf of users`
    });

  // The same rule as granting an access bundle: a subject is named by its own Agent Vault membership.
  const assertSubjectsInAgentVault = async ({
    projectId,
    userIds,
    groupIds
  }: {
    projectId: string;
    userIds: string[];
    groupIds: string[];
  }) => {
    const projectScoped = (column: "actorUserId" | "actorGroupId", ids: string[]) =>
      ids.length
        ? membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId, $in: { [column]: ids } })
        : [];
    const [userRows, groupRows] = await Promise.all([
      projectScoped("actorUserId", userIds),
      projectScoped("actorGroupId", groupIds)
    ]);

    const memberGroups = new Set(groupRows.map((row) => row.actorGroupId));
    const missingGroups = groupIds.filter((id) => !memberGroups.has(id));
    if (missingGroups.length) {
      throw new BadRequestError({
        message: `Group(s) ${quoted(missingGroups)} are not members of Agent Vault. Add them under Access Control first.`
      });
    }

    const memberUsers = new Set(userRows.map((row) => row.actorUserId));
    const missingUsers = userIds.filter((id) => !memberUsers.has(id));
    if (!missingUsers.length) return;

    const groupMemberships = await userGroupMembershipDAL.find({ $in: { userId: missingUsers } });
    const groupsInAgentVault = groupMemberships.length
      ? await membershipDAL.find({
          scope: AccessScope.Project,
          scopeProjectId: projectId,
          $in: { actorGroupId: [...new Set(groupMemberships.map((row) => row.groupId))] }
        })
      : [];
    const memberGroupIds = new Set(groupsInAgentVault.map((row) => row.actorGroupId));
    const throughGroup = new Set(
      groupMemberships.filter((row) => memberGroupIds.has(row.groupId)).map((row) => row.userId)
    );

    // Both reasons in one message, so a batch that holds both is fixed in one round trip.
    const viaGroup = missingUsers.filter((id) => throughGroup.has(id));
    const strangers = missingUsers.filter((id) => !throughGroup.has(id));
    const reasons: string[] = [];
    if (viaGroup.length) {
      reasons.push(
        `User(s) ${quoted(viaGroup)} are in Agent Vault through a group. Name the group instead, or add them directly under Access Control first.`
      );
    }
    if (strangers.length) {
      reasons.push(`User(s) ${quoted(strangers)} are not members of Agent Vault. Add them under Access Control first.`);
    }
    throw new BadRequestError({ message: reasons.join(" ") });
  };

  const listDelegations = async ({ projectId, ctx, machineIdentityIds, limit, offset }: TListDelegationsDTO) => {
    await checkAdmin(projectId, ctx);
    const { delegations, totalCount } = await agentVaultDelegationDAL.findViews({
      projectId,
      identityIds: machineIdentityIds,
      limit,
      offset
    });
    return { delegations: delegations.map(toDelegation), totalCount };
  };

  // An identity may read its own, so an orchestrator can check what it was allowed before it acts.
  const getDelegation = async ({ projectId, ctx, machineIdentityId }: TGetDelegationDTO) => {
    const { isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    const isSelf = ctx.actor === ActorType.IDENTITY && ctx.actorId === machineIdentityId;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenRequestError({
        message: "Only Agent Vault admins, and the machine identity itself, can read a machine identity's delegation"
      });
    }

    const {
      delegations: [delegation]
    } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] });
    if (!delegation) throw notFound(machineIdentityId);
    return { delegation: toDelegation(delegation) };
  };

  const setDelegation = async ({ projectId, ctx, machineIdentityId, scope, userIds, groupIds }: TSetDelegationDTO) => {
    await checkAdmin(projectId, ctx);

    // Project-scoped, so an identity from another org is a 404 like one that doesn't exist.
    const identityMembership = await membershipDAL.findOne({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      actorIdentityId: machineIdentityId
    });
    if (!identityMembership) {
      throw new NotFoundError({
        message: `Machine identity with ID '${machineIdentityId}' is not a member of Agent Vault. Add it under Access Control first.`
      });
    }

    if (scope === AgentVaultDelegationScope.Selected) {
      await assertSubjectsInAgentVault({ projectId, userIds, groupIds });
    }

    const delegation = await agentVaultDelegationDAL.transaction(async (tx) => {
      const row = await agentVaultDelegationDAL.upsertScope({ projectId, identityId: machineIdentityId, scope }, tx);

      // A write replaces the whole list, so a subject left out is no longer covered.
      await agentVaultDelegationSubjectDAL.delete({ delegationId: row.id }, tx);
      const subjects =
        scope === AgentVaultDelegationScope.Selected
          ? [
              ...userIds.map((userId) => ({ delegationId: row.id, userId })),
              ...groupIds.map((groupId) => ({ delegationId: row.id, groupId }))
            ]
          : [];
      if (subjects.length) await agentVaultDelegationSubjectDAL.insertMany(subjects, tx);

      const {
        delegations: [written]
      } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx);
      return written;
    });

    return { delegation: toDelegation(delegation) };
  };

  const deleteDelegation = async ({ projectId, ctx, machineIdentityId }: TDeleteDelegationDTO) => {
    await checkAdmin(projectId, ctx);

    const deleted = await agentVaultDelegationDAL.transaction(async (tx) => {
      const {
        delegations: [delegation]
      } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx);
      if (!delegation) return undefined;

      // Two concurrent deletes both read it; only the one whose delete removed the row reports it, so the audit
      // trail holds a single deletion.
      const removed = await agentVaultDelegationDAL.delete({ id: delegation.id }, tx);
      return removed.length ? delegation : undefined;
    });
    if (!deleted) throw notFound(machineIdentityId);

    return { delegation: toDelegation(deleted) };
  };

  return { listDelegations, getDelegation, setDelegation, deleteDelegation };
};
