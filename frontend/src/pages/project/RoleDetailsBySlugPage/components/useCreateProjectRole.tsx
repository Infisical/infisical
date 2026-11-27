import { CustomRolesUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";

import { RoleModal } from "./RoleModal";

export const useCreateProjectRole = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["role", "upgradePlan"] as const);

  const canCreateRole =
    currentProject?.type !== ProjectType.CertificateManager &&
    permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);

  const openCreateRole = () =>
    handlePopUpOpen(subscription && !subscription.rbac ? "upgradePlan" : "role");

  const createRoleDialogs = (
    <>
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <UpgradeGate
        paywallKey="project.role"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(open) => handlePopUpToggle("upgradePlan", open)}
        intent={{ ...CustomRolesUpgradeIntent, isEnterpriseFeature: false }}
      />
    </>
  );

  return { canCreateRole, openCreateRole, createRoleDialogs };
};
