import { Knex } from "knex";

import { RESOURCE_SCOPE } from "@app/db/schemas";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { TMembershipDALFactory } from "./membership-dal";

type TApplicationMembershipCleanupServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "delete">;
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "deleteStepApproversBySubject" | "deleteUserStepApproversInProjects"
  >;
};

export type TApplicationMembershipCleanupServiceFactory = ReturnType<typeof applicationMembershipCleanupServiceFactory>;

export const APPLICATION_APPROVAL_SCOPES = [ApprovalPolicyScope.PkiApplication, ApprovalPolicyScope.Signer];

export const applicationMembershipCleanupServiceFactory = ({
  membershipDAL,
  approvalPolicyDAL
}: TApplicationMembershipCleanupServiceFactoryDep) => {
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
  };

  return { cleanupActorApplicationMemberships, cleanupUsersApplicationMemberships };
};
