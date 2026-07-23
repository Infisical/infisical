import { ProjectType } from "@app/db/schemas";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPamAuditLogScope } from "../audit-log/audit-log-dal";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import { PamProductRole } from "./pam-enums";
import { getResourceIdsWithActions, verifyProductMembership } from "./pam-permission";

type TPamAuditLogScopeResolverDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "find">;
};

export const pamAuditLogScopeResolverFactory = ({
  projectDAL,
  permissionService,
  membershipDAL,
  membershipRoleDAL,
  pamAccountDAL
}: TPamAuditLogScopeResolverDeps) => {
  return async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    projectId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }): Promise<TPamAuditLogScope | null> => {
    const project = await projectDAL.findById(projectId);
    if (!project || project.type !== ProjectType.PAM) return null;

    const ctx = { actor, actorId, actorAuthMethod, actorOrgId };
    const { hasRole } = await verifyProductMembership(permissionService, projectId, ctx);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { anyOf: [ResourcePermissionPamResourceActions.ViewAuditLogs] },
      ctx
    );

    // A ViewAuditLogs grant on a folder also covers logs for the accounts within it
    let resolvedAccountIds = accountIds;
    if (folderIds.length) {
      const accountsInFolders = await pamAccountDAL.find({ $in: { folderId: folderIds } });
      resolvedAccountIds = [...new Set([...accountIds, ...accountsInFolders.map((account) => account.id)])];
    }

    return {
      accountIds: resolvedAccountIds,
      folderIds,
      includeProductLevel: hasRole(PamProductRole.Admin)
    };
  };
};
