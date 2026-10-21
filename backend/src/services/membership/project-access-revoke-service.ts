import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, TMemberships } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { terminatePamSessionsForUsers } from "@app/ee/services/pam-session/pam-session-access-fns";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { groupBy } from "@app/lib/fn";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "../alert/alert-channel-recipient-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TApplicationMembershipCleanupServiceFactory } from "./application-membership-cleanup-service";
import { TMembershipDALFactory } from "./membership-dal";

type TProjectAccessRevokeServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "find" | "delete">;
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

export type TRevokedProjectResource = { projectId: string; resourceType: string; resourceId: string };
export type TRevokedProjectAccess = {
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

// The one definition of what an actor loses when they leave the projects of an org: project rows,
// resource rows (PAM, Agent Vault, PKI applications, signers), project keys, privileges, approver
// slots, alert recipient slots and live PAM sessions. Everything keyed on actor + project is reaped
// across every project in the orgs, not only the ones the actor held a row in, since those can exist
// in projects reached through a group. Membership roles cascade from the membership row.
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
  // Runs inside the caller's transaction and returns the PAM cancellation sender to call after it
  // commits, as `terminatePamSessionsForUsers` does.
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

    const rows = [...userRows, ...identityRows, ...resourceRows];
    const revoked: TRevokedProjectAccess[] = [
      ...Object.entries(
        groupBy(
          rows.filter((row) => row.actorUserId),
          (row) => row.actorUserId as string
        )
      ).map(([userId, actorRows]) => ({ userId, ...toRevoked(actorRows) })),
      ...Object.entries(
        groupBy(
          rows.filter((row) => row.actorIdentityId),
          (row) => row.actorIdentityId as string
        )
      ).map(([identityId, actorRows]) => ({ identityId, ...toRevoked(actorRows) }))
    ];

    return { revoked, sendPamCancellations };
  };

  return { revokeActorsInOrgs };
};
