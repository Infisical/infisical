import { Knex } from "knex";

import { ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import {
  clearPersonalValuesAfterRevoke,
  TClearPersonalValuesDeps
} from "@app/ee/services/agent-vault-personal-value/agent-vault-personal-value-fns";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TMembershipDALFactory } from "./membership-dal";

type TApplicationMembershipCleanupServiceFactoryDep = TClearPersonalValuesDeps & {
  membershipDAL: Pick<TMembershipDALFactory, "delete">;
  projectDAL: Pick<TProjectDALFactory, "findProjectTypesByIds">;
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "deleteStepApproversBySubject" | "deleteUserStepApproversInProjects" | "deleteUserBypassersInProjects"
  >;
};

export type TApplicationMembershipCleanupServiceFactory = ReturnType<typeof applicationMembershipCleanupServiceFactory>;

const APPLICATION_APPROVAL_SCOPES = [ApprovalPolicyScope.PkiApplication, ApprovalPolicyScope.Signer];
const ORG_EXIT_APPROVAL_SCOPES = [...APPLICATION_APPROVAL_SCOPES, ApprovalPolicyScope.PamFolder];

export const applicationMembershipCleanupServiceFactory = ({
  membershipDAL,
  projectDAL,
  approvalPolicyDAL,
  agentVaultPersonalValueDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL
}: TApplicationMembershipCleanupServiceFactoryDep) => {
  // Includes projects pending deletion, so restoring one can't bring back a removed actor's saved values.
  const findAgentVaultProjectIds = async (projectIds: string[], tx: Knex) => {
    if (!projectIds.length) return [];
    const projects = await projectDAL.findProjectTypesByIds(projectIds, tx);
    // Sorted so concurrent cleanups across several projects take the per-project advisory locks in one order.
    return projects
      .filter((project) => project.type === ProjectType.AgentVault)
      .map((project) => project.id)
      .sort();
  };

  // Runs after the actor's project membership and grants are deleted, since the clear keeps the values of anyone who
  // still holds a grant or a project admin role.
  const clearAgentVaultPersonalValues = async (
    {
      projectIds,
      userIds = [],
      identityIds = [],
      groupIds = []
    }: { projectIds: string[]; userIds?: string[]; identityIds?: string[]; groupIds?: string[] },
    tx: Knex
  ) => {
    if (!userIds.length && !identityIds.length && !groupIds.length) return;
    const agentVaultProjectIds = await findAgentVaultProjectIds(projectIds, tx);
    for (const projectId of agentVaultProjectIds) {
      // eslint-disable-next-line no-await-in-loop
      await clearPersonalValuesAfterRevoke(
        { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL },
        { projectId, userIds, identityIds, groupIds },
        tx
      );
    }
  };

  const cleanupActorApplicationMemberships = async (
    {
      projectId,
      actorKind,
      actorId
    }: {
      projectId: string;
      actorKind: ApplicationMemberKind;
      actorId: string;
    },
    tx: Knex
  ) => {
    if (actorKind !== ApplicationMemberKind.Identity) {
      const userId = actorKind === ApplicationMemberKind.User ? actorId : undefined;
      const groupId = actorKind === ApplicationMemberKind.Group ? actorId : undefined;
      for (const scopeType of APPLICATION_APPROVAL_SCOPES) {
        // eslint-disable-next-line no-await-in-loop
        await approvalPolicyDAL.deleteStepApproversBySubject({ projectId, scopeType, userId, groupId }, tx);
      }
    }

    const actorFilter: Record<string, string> = {};
    if (actorKind === ApplicationMemberKind.User) actorFilter.actorUserId = actorId;
    else if (actorKind === ApplicationMemberKind.Identity) actorFilter.actorIdentityId = actorId;
    else actorFilter.actorGroupId = actorId;

    await membershipDAL.delete(
      {
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        ...actorFilter
      },
      tx
    );

    await clearAgentVaultPersonalValues(
      {
        projectIds: [projectId],
        userIds: actorKind === ApplicationMemberKind.User ? [actorId] : [],
        identityIds: actorKind === ApplicationMemberKind.Identity ? [actorId] : [],
        groupIds: actorKind === ApplicationMemberKind.Group ? [actorId] : []
      },
      tx
    );
  };

  const cleanupUsersApplicationMemberships = async (
    { projectId, userIds }: { projectId: string; userIds: string[] },
    tx: Knex
  ) => {
    if (!userIds.length) return;

    await approvalPolicyDAL.deleteUserStepApproversInProjects(
      { projectIds: [projectId], userIds, scopeTypes: APPLICATION_APPROVAL_SCOPES },
      tx
    );

    await membershipDAL.delete(
      {
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        $in: { actorUserId: userIds }
      },
      tx
    );

    await clearAgentVaultPersonalValues({ projectIds: [projectId], userIds }, tx);
  };

  // Returns the removed resource rows so callers can report them.
  const cleanupActorsApplicationMembershipsInProjects = async (
    { projectIds, userIds, identityIds }: { projectIds: string[]; userIds: string[]; identityIds: string[] },
    tx: Knex
  ) => {
    if (!projectIds.length) return [];

    if (userIds.length) {
      await approvalPolicyDAL.deleteUserStepApproversInProjects(
        { projectIds, userIds, scopeTypes: ORG_EXIT_APPROVAL_SCOPES },
        tx
      );
      await approvalPolicyDAL.deleteUserBypassersInProjects(
        { projectIds, userIds, scopeTypes: ORG_EXIT_APPROVAL_SCOPES },
        tx
      );
    }

    const userRows = userIds.length
      ? await membershipDAL.delete(
          { scope: RESOURCE_SCOPE, $in: { scopeProjectId: projectIds, actorUserId: userIds } },
          tx
        )
      : [];
    const identityRows = identityIds.length
      ? await membershipDAL.delete(
          { scope: RESOURCE_SCOPE, $in: { scopeProjectId: projectIds, actorIdentityId: identityIds } },
          tx
        )
      : [];

    await clearAgentVaultPersonalValues({ projectIds, userIds, identityIds }, tx);

    return [...userRows, ...identityRows];
  };

  return {
    cleanupActorApplicationMemberships,
    cleanupUsersApplicationMemberships,
    cleanupActorsApplicationMembershipsInProjects
  };
};
