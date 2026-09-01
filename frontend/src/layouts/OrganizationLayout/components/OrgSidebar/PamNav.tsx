import {
  ClipboardList,
  FileText,
  FolderOpen,
  Radar,
  Shield,
  ShieldCheck,
  Video
} from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";
import { useGetPamAccessCapabilities, useGetPamAccessRequestCount } from "@app/hooks/api/pam";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { data: capabilities } = useGetPamAccessCapabilities();
  const { data: accessRequestCount } = useGetPamAccessRequestCount();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);
  const canViewSessions = Boolean(capabilities?.canViewSessions);
  const canViewAuditLogs = Boolean(capabilities?.canViewAuditLogs);
  const isApprover = Boolean(accessRequestCount?.isApprover);
  const pendingCount = accessRequestCount?.pendingCount ?? 0;

  // Accounts is visible to all users - regular users see only their accessible accounts
  const accessItems: NavItem[] = [{ label: "Accounts", icon: FolderOpen, pathSuffix: "accounts" }];

  const manageItems: NavItem[] = [
    ...(isProductAdmin
      ? [{ label: "Account Templates", icon: ClipboardList, pathSuffix: "templates" }]
      : []),
    ...(isProductAdmin ? [{ label: "Discovery", icon: Radar, pathSuffix: "discovery" }] : [])
  ];

  const monitorItems: NavItem[] = [
    ...(canViewSessions ? [{ label: "Sessions", icon: Video, pathSuffix: "sessions" }] : []),
    ...(isApprover
      ? [
          {
            label: "Approval Requests",
            icon: ShieldCheck,
            pathSuffix: "approval-requests",
            badgeCount: pendingCount,
            badgeVariant: "pam" as const
          }
        ]
      : []),
    ...(canViewAuditLogs ? [{ label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" }] : [])
  ];

  const configureItems: NavItem[] = [
    ...(isProductAdmin
      ? [
          {
            label: "Access Control",
            icon: Shield,
            pathSuffix: "access-management",
            activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
          }
        ]
      : [])
  ];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      {manageItems.length > 0 && (
        <SidebarCollapsibleGroup label="Manage">
          <ProjectNavList items={manageItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      {monitorItems.length > 0 && (
        <SidebarCollapsibleGroup label="Monitor">
          <ProjectNavList items={monitorItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      {configureItems.length > 0 && (
        <SidebarCollapsibleGroup label="Configure">
          <ProjectNavList items={configureItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
    </>
  );
};
