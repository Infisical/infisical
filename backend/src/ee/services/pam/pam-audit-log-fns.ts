import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PamResourcePermissionActions } from "@app/domains/pam/pam/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPamAuditLogScope } from "../audit-log/audit-log-dal";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamProductRole } from "./pam-enums";
import { getResourceIdsWithActions, verifyProductMembership } from "./pam-permission";

type TPamAuditLogScopeResolverDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "find">;
};

export const pamAuditLogScopeResolverFactory = ({
  projectDAL,
  projectsDomain,
  membershipDAL,
  membershipRoleDAL,
  pamAccountDAL
}: TPamAuditLogScopeResolverDeps) => {
  return async ({
    projectId,
    actor
  }: {
    projectId: string;
    actor: TActorContext;
  }): Promise<TPamAuditLogScope | null> => {
    const project = await projectDAL.findById(projectId);
    if (!project || project.type !== ProjectType.PAM) return null;

    const productPermission = await verifyProductMembership(projectsDomain, projectId, actor);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { anyOf: [PamResourcePermissionActions.ViewAuditLogs] },
      actor
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
      includeProductLevel: productPermission.hasRole({ slug: PamProductRole.Admin })
    };
  };
};
