import { useCallback } from "react";

import { useProjectPermission } from "@app/context";
import { getAgentVaultAdminChangeBlockedReason } from "@app/helpers/agentVaultMembers";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const useAgentVaultAdminGuard = () => {
  const { hasProjectRole } = useProjectPermission();
  const isViewerAdmin = Boolean(hasProjectRole(ProjectMembershipRole.Admin));

  const blockedReasonFor = useCallback(
    (memberRoles: readonly string[]) =>
      getAgentVaultAdminChangeBlockedReason({ isViewerAdmin, memberRoles }),
    [isViewerAdmin]
  );

  return { isViewerAdmin, blockedReasonFor };
};
