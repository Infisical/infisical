import { ReactNode, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { CustomRolesUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { ComboboxActionCreationConfig } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

/**
 * The "Create Custom Role" row of a project role picker, for whoever can create roles. It opens role creation in a new
 * tab so the role's permissions can be configured there; the picker's caller refetches roles to pick it up. Without
 * custom roles on the plan the row opens the upgrade dialog, which the caller renders from `upgradeGate`.
 */
export const useProjectRoleCreation = <TOption,>(): {
  creation: ComboboxActionCreationConfig<TOption> | undefined;
  upgradeGate: ReactNode;
} => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const [isUpgradeGateOpen, setIsUpgradeGateOpen] = useState(false);

  const canCreateRole =
    currentProject.type === ProjectType.SecretManager &&
    permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  if (!canCreateRole) return { creation: undefined, upgradeGate: null };

  const label = (
    <span className="flex items-center gap-1.5">
      Create Custom Role
      <ExternalLinkIcon className="size-3.5" />
    </span>
  );

  return {
    creation: {
      mode: "action",
      emptyLabel: label,
      formatLabel: () => label,
      onAction: () => {
        if (!subscription.rbac) {
          setIsUpgradeGateOpen(true);
          return;
        }
        const { href } = router.buildLocation({
          to: "/organizations/$orgId/projects/secret-management/$projectId/access-management",
          params: { orgId: currentOrg.id, projectId: currentProject.id },
          search: {
            selectedTab: ProjectAccessControlTabs.Roles,
            requesterEmail: "",
            createRole: true
          }
        });
        window.open(href, "_blank", "noopener");
      }
    },
    upgradeGate: (
      <UpgradeGate
        paywallKey="project.role"
        isOpen={isUpgradeGateOpen}
        onOpenChange={setIsUpgradeGateOpen}
        intent={{ ...CustomRolesUpgradeIntent, isEnterpriseFeature: false }}
      />
    )
  };
};
