import { Cable, Database, FileText, Search, Settings, Shield } from "lucide-react";

import {
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";
import {
  useGetSecretScanningInstanceState,
  useGetSecretScanningUnresolvedFindingCount
} from "@app/hooks/api/secretScanningV2";

import { ProjectNavList } from "./ProjectNavLink";
import { getSecretScanningSettingsSubmenu, PROJECT_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const SecretScanningNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { data: instanceState } = useGetSecretScanningInstanceState(currentOrg.id);

  const { data: unresolvedFindings } = useGetSecretScanningUnresolvedFindingCount(
    currentProject.id,
    {
      enabled:
        subscription.secretScanning &&
        permission.can(
          ProjectPermissionSecretScanningFindingActions.Read,
          ProjectPermissionSub.SecretScanningFindings
        ),
      refetchInterval: 30000
    }
  );

  const items: NavItem[] = [
    { label: "Data Sources", icon: Database, pathSuffix: "data-sources" },
    {
      label: "Findings",
      icon: Search,
      pathSuffix: "findings",
      badgeCount: unresolvedFindings || undefined
    },
    { label: "App Connections", icon: Cable, pathSuffix: "app-connections" },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings",
      submenu: getSecretScanningSettingsSubmenu(Boolean(instanceState?.isMultiInstance))
    }
  ];
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
