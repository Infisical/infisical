import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  FileKey,
  FileText,
  GitCompare,
  Inbox,
  LayoutDashboard,
  PenTool,
  Search,
  Settings,
  Shield,
  ShieldCheck
} from "lucide-react";

import { ResourceIcon, SidebarCollapsibleGroup } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { useListWorkspacePkiAlerts } from "@app/hooks/api";
import { approvalPolicyQuery, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { approvalRequestQuery } from "@app/hooks/api/approvalRequests";
import { ApprovalRequestStatus } from "@app/hooks/api/approvalRequests/types";
import { useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { ProjectNavList } from "./ProjectNavLink";
import { CERT_MANAGER_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const CertManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { hasProjectRole } = useProjectPermission();
  const { currentProject } = useProject();
  const isCertManagerAdmin = hasProjectRole("admin");
  const projectId = currentProject?.id ?? "";

  const { data: v2AlertsData } = useGetPkiAlertsV2(
    {},
    { enabled: isCertManagerAdmin && Boolean(projectId) }
  );
  const { data: v1AlertsData } = useListWorkspacePkiAlerts({
    projectId: isCertManagerAdmin ? projectId : ""
  });
  const { data: syncs } = useListPkiSyncs(projectId, {
    enabled: isCertManagerAdmin && Boolean(projectId)
  });
  const { data: policies } = useQuery({
    ...approvalPolicyQuery.list({ projectId, policyType: ApprovalPolicyType.CertRequest }),
    enabled: isCertManagerAdmin && Boolean(projectId)
  });
  const { data: pendingRequestsCount = 0 } = useQuery({
    ...approvalRequestQuery.list({ projectId, policyType: ApprovalPolicyType.CertRequest }),
    enabled: Boolean(projectId),
    select: (requests) => requests.filter((r) => r.status === ApprovalRequestStatus.Pending).length
  });

  const hasLegacyAlerts =
    Boolean(v2AlertsData?.alerts?.some((a) => !a.applicationId)) ||
    Boolean(v1AlertsData?.alerts?.length);
  const hasLegacySyncs = Boolean(syncs?.some((s) => !s.applicationId));
  const hasLegacyPolicies = Boolean(policies?.some((p) => !p.applicationId));
  const hasAnyLegacy = hasLegacyAlerts || hasLegacySyncs || hasLegacyPolicies;

  const overviewItems: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, pathSuffix: "overview" },
    { label: "Inventory", icon: FileKey, pathSuffix: "inventory" },
    { label: "Discovery", icon: Search, pathSuffix: "discovery", activeMatch: /\/discovery/ },
    {
      label: "Requests",
      icon: Inbox,
      pathSuffix: "requests",
      badgeCount: pendingRequestsCount || undefined
    }
  ];

  const applicationItems: NavItem[] = [
    { label: "Applications", icon: ResourceIcon, pathSuffix: "applications" }
  ];

  const codeSigningItems: NavItem[] = [
    {
      label: "Signers",
      icon: PenTool,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/
    }
  ];

  const legacyItems: NavItem[] = [
    { label: "Alerts", icon: Bell, pathSuffix: "alerting", hidden: !hasLegacyAlerts },
    {
      label: "Approval Policies",
      icon: ShieldCheck,
      pathSuffix: "approvals",
      search: { legacy: "true", selectedTab: "policies" },
      hidden: !hasLegacyPolicies
    },
    {
      label: "Certificate Syncs",
      icon: GitCompare,
      pathSuffix: "integrations",
      search: { legacy: "true", selectedTab: "pki-syncs" },
      hidden: !hasLegacySyncs
    }
  ];

  const administrationItems: NavItem[] = [
    {
      label: "Access",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: CERT_MANAGER_ACCESS_CONTROL_SUBMENU
    },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings"
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" }
  ];

  const generalItemsForRole = isCertManagerAdmin
    ? overviewItems
    : overviewItems.filter((item) => item.pathSuffix === "requests");

  return (
    <>
      <SidebarCollapsibleGroup label="General">
        <ProjectNavList items={generalItemsForRole} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Applications">
        <ProjectNavList items={applicationItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Code Signing">
        <ProjectNavList items={codeSigningItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      {isCertManagerAdmin && hasAnyLegacy ? (
        <SidebarCollapsibleGroup label="Legacy" defaultOpen={false}>
          <ProjectNavList items={legacyItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      ) : null}
      <SidebarCollapsibleGroup label="Administration">
        <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
