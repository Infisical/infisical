import { Knex } from "knex";

import { RESOURCE_SCOPE } from "@app/db/schemas";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { TMembershipDALFactory } from "./membership-dal";

export enum ApplicationCleanupActorKind {
  User = "user",
  Group = "group",
  Identity = "identity"
}

type TApplicationMembershipCleanupServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "delete">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteStepApproversBySubject">;
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
      actorKind: ApplicationCleanupActorKind;
      actorId: string;
    },
    tx: Knex
  ) => {
    if (actorKind !== ApplicationCleanupActorKind.Identity) {
      const userId = actorKind === ApplicationCleanupActorKind.User ? actorId : undefined;
      const groupId = actorKind === ApplicationCleanupActorKind.Group ? actorId : undefined;
      for (const scopeType of APPLICATION_APPROVAL_SCOPES) {
        // eslint-disable-next-line no-await-in-loop
        await approvalPolicyDAL.deleteStepApproversBySubject({ projectId, scopeType, userId, groupId }, tx);
      }
    }

    const actorFilter: Record<string, string> = {};
    if (actorKind === ApplicationCleanupActorKind.User) actorFilter.actorUserId = actorId;
    else if (actorKind === ApplicationCleanupActorKind.Identity) actorFilter.actorIdentityId = actorId;
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

  return { cleanupActorApplicationMemberships };
};
