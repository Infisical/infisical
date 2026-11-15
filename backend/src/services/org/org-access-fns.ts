import { Knex } from "knex";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { TRevokedProjectAccess } from "../membership/project-access-revoke-service";
import { TOrgDALFactory } from "./org-dal";
import { OrgAccessRemovalCause } from "./org-membership-events";

export const auditRevokedProjectAccess = async ({
  auditLogService,
  revoked,
  reason,
  groupId
}: {
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  revoked: TRevokedProjectAccess[];
  reason: OrgAccessRemovalCause;
  groupId?: string;
}) => {
  for await (const { orgId, userId, identityId, projectIds, resources } of revoked) {
    await auditLogService.createAuditLog({
      orgId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.REVOKE_ORG_PROJECT_ACCESS,
        metadata: { userId, identityId, projectIds, resources, reason, groupId }
      }
    });
  }
};

// Call in the grant's tx before writing. Takes the consumer's per-actor lock and rechecks, so a path removed
// at the same time is caught either here or by the consumer after commit, never neither.
export const lockAndAssertActiveOrgAccess = async (
  {
    orgDAL,
    orgId,
    userIds = [],
    identityIds = []
  }: {
    orgDAL: Pick<TOrgDALFactory, "lockActorsForOrgAccess" | "findActorsWithActiveOrgAccess">;
    orgId: string;
    userIds?: string[];
    identityIds?: string[];
  },
  tx: Knex
) => {
  if (!userIds.length && !identityIds.length) return;

  await orgDAL.lockActorsForOrgAccess({ orgId, actorIds: [...userIds, ...identityIds] }, tx);
  const withAccess = await orgDAL.findActorsWithActiveOrgAccess({ orgId, userIds, identityIds }, tx);
  const lost = [
    ...userIds.filter((id) => !withAccess.userIds.has(id)),
    ...identityIds.filter((id) => !withAccess.identityIds.has(id))
  ];
  if (lost.length) {
    throw new BadRequestError({
      message: `${lost.map((id) => `'${id}'`).join(", ")} ${
        lost.length === 1 ? "is" : "are"
      } no longer an active member of this organization, so access was not granted.`
    });
  }
};
