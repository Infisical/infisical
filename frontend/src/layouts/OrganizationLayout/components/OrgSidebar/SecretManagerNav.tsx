import {
  BookCheck,
  DoorOpen,
  FileKey,
  FileText,
  Plug,
  RefreshCw,
  Settings,
  Shield
} from "lucide-react";

import { ProjectIcon } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";

import { ProjectNavList } from "./ProjectNavLink";
import {
  INTEGRATIONS_SUBMENU,
  SECRET_MANAGER_ACCESS_CONTROL_SUBMENU,
  SM_SETTINGS_SUBMENU
} from "./submenus";
import type { NavItem, Submenu } from "./types";

export const SecretManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { currentProject, projectId } = useProject();

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({ projectId });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug: currentProject?.slug || ""
  });
  const { data: secretRotations } = useGetSecretRotations({
    workspaceId: projectId,
    options: { refetchOnMount: false }
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  const approvalsSubmenu: Submenu = {
    title: "Approvals",
    pathSuffix: "approval",
    defaultTab: "approval-requests",
    items: [
      {
        label: "Change Requests",
        icon: FileKey,
        tab: "approval-requests",
        badgeCount: secretApprovalReqCount?.open || undefined
      },
      {
        label: "Access Requests",
        icon: DoorOpen,
        tab: "resource-requests",
        badgeCount: accessApprovalRequestCount?.pendingCount || undefined
      },
      { label: "Policies", icon: Shield, tab: "policies" }
    ]
  };

  const items: NavItem[] = [
    {
      label: "Overview",
      icon: ProjectIcon,
      pathSuffix: "overview",
      activeMatch: /\/secrets\/|\/commits\//
    },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approval",
      badgeCount: pendingRequestsCount || undefined,
      submenu: approvalsSubmenu
    },
    {
      label: "Integrations",
      icon: Plug,
      pathSuffix: "integrations",
      submenu: INTEGRATIONS_SUBMENU
    },
    {
      label: "Secret Rotations",
      icon: RefreshCw,
      pathSuffix: "secret-rotation",
      hidden: !secretRotations?.length
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: SECRET_MANAGER_ACCESS_CONTROL_SUBMENU
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings", submenu: SM_SETTINGS_SUBMENU }
  ];

  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
