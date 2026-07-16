import {
  BellRing,
  ClipboardList,
  FileText,
  FolderOpen,
  KeyRound,
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
  const isResourceAdmin = Boolean(capabilities?.isResourceAdmin);
  const canViewSessions = Boolean(capabilities?.canViewSessions);
  const canViewAuditLogs = Boolean(capabilities?.canViewAuditLogs);
  const isApprover = Boolean(accessRequestCount?.isApprover);
  const pendingCount = accessRequestCount?.pendingCount ?? 0;

  const accessItems: NavItem[] = [
    { label: "My Access", icon: KeyRound, pathSuffix: "access", exactPath: true }
  ];

  const manageItems: NavItem[] = [
    ...(isProductAdmin || isResourceAdmin
      ? [{ label: "Accounts", icon: FolderOpen, pathSuffix: "accounts" }]
      : []),
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
          },
          { label: "Alarms", icon: BellRing, pathSuffix: "alarms" }
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
