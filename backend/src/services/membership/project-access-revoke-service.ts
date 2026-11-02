import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, TMemberships } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { terminatePamSessionsForUsers } from "@app/ee/services/pam-session/pam-session-access-fns";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { groupBy } from "@app/lib/fn";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "../alert/alert-channel-recipient-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TApplicationMembershipCleanupServiceFactory } from "./application-membership-cleanup-service";
import { TMembershipDALFactory } from "./membership-dal";

type TProjectAccessRevokeServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "delete">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  applicationMembershipCleanupService: Pick<
    TApplicationMembershipCleanupServiceFactory,
    "cleanupActorsApplicationMembershipsInProjects"
  >;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "findLiveByOrgAndUserIds" | "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
};

export type TProjectAccessRevokeServiceFactory = ReturnType<typeof projectAccessRevokeServiceFactory>;

type TRevokedProjectResource = { projectId: string; resourceType: string; resourceId: string };
export type TRevokedProjectAccess = {
  orgId: string;
  userId?: string;
  identityId?: string;
  projectIds: string[];
  resources: TRevokedProjectResource[];
};

const toRevoked = (rows: TMemberships[]) => ({
  projectIds: rows.filter((row) => row.scope === AccessScope.Project).map((row) => row.scopeProjectId as string),
  resources: rows
    .filter((row) => row.scope === RESOURCE_SCOPE)
    .map((row) => ({
      projectId: row.scopeProjectId as string,
      resourceType: row.scopeResourceType as string,
      resourceId: row.scopeResourceId as string
    }))
});

// The one list of what leaving an org's projects takes away: project and resource rows, keys, privileges,
// approver and alert recipient slots, live PAM sessions. Actor + project stuff is reaped across every
// project in the orgs, since it can exist in group-only projects. Roles cascade from the membership row.
export const projectAccessRevokeServiceFactory = ({
  membershipDAL,
  projectDAL,
  projectKeyDAL,
  additionalPrivilegeDAL,
  applicationMembershipCleanupService,
  alertChannelRecipientDAL,
  pamSessionDAL,
  gatewayV2Service
}: TProjectAccessRevokeServiceFactoryDep) => {
  // Runs in the caller's tx; call the returned PAM cancellation sender after commit.
  const revokeActorsInOrgs = async (
    { orgIds, userIds = [], identityIds = [] }: { orgIds: string[]; userIds?: string[]; identityIds?: string[] },
    tx: Knex
  ): Promise<{ revoked: TRevokedProjectAccess[]; sendPamCancellations: () => void }> => {
    if (!orgIds.length || (!userIds.length && !identityIds.length)) {
      return { revoked: [], sendPamCancellations: () => {} };
    }

    const projectScope = { scope: AccessScope.Project, $in: { scopeOrgId: orgIds } };
    const userRows = userIds.length
      ? await membershipDAL.delete({ ...projectScope, $in: { ...projectScope.$in, actorUserId: userIds } }, tx)
      : [];
    const identityRows = identityIds.length
      ? await membershipDAL.delete({ ...projectScope, $in: { ...projectScope.$in, actorIdentityId: identityIds } }, tx)
      : [];

    const projectIds = (await projectDAL.find({ $in: { orgId: orgIds } }, { tx })).map((project) => project.id);
    const resourceRows = projectIds.length
      ? await applicationMembershipCleanupService.cleanupActorsApplicationMembershipsInProjects(
          { projectIds, userIds, identityIds },
          tx
        )
      : [];

    if (projectIds.length && userIds.length) {
      await projectKeyDAL.delete({ $in: { receiverId: userIds, projectId: projectIds } }, tx);
      await additionalPrivilegeDAL.delete({ $in: { actorUserId: userIds, projectId: projectIds } }, tx);
    }
    if (projectIds.length && identityIds.length) {
      await additionalPrivilegeDAL.delete({ $in: { actorIdentityId: identityIds, projectId: projectIds } }, tx);
    }

    if (userIds.length) {
      await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds }, tx);
    }

    const sendPamCancellations = await terminatePamSessionsForUsers({
      orgIds,
      userIds,
      pamSessionDAL,
      gatewayV2Service,
      tx
    });

    const rows = [...userRows, ...identityRows, ...resourceRows].filter(
      (row) => row.actorUserId || row.actorIdentityId
    );
    const revoked: TRevokedProjectAccess[] = Object.values(
      groupBy(rows, (row) => `${row.scopeOrgId}|${row.actorUserId ?? ""}|${row.actorIdentityId ?? ""}`)
    ).map((actorRows) => {
      const [{ scopeOrgId, actorUserId, actorIdentityId }] = actorRows;
      return {
        orgId: scopeOrgId as string,
        userId: actorUserId ?? undefined,
        identityId: actorIdentityId ?? undefined,
        ...toRevoked(actorRows)
      };
    });

    return { revoked, sendPamCancellations };
  };

  return { revokeActorsInOrgs };
};
