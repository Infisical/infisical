import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import {
  Bell,
  BellRing,
  FileBadge,
  FileKey,
  FileText,
  GitCompare,
  Inbox,
  Landmark,
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
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
  ApprovalPolicyType
} from "@app/hooks/api/approvalPolicies";
import { approvalRequestQuery } from "@app/hooks/api/approvalRequests";
import { ApprovalRequestStatus } from "@app/hooks/api/approvalRequests/types";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const CertManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { hasProjectRole } = useProjectPermission();
  const { currentProject } = useProject();
  const { search: locationSearch } = useLocation();
  const hasSignerContext = Boolean((locationSearch as { signerId?: string })?.signerId);
  const isCertManagerAdmin = hasProjectRole("admin");
  const projectId = currentProject?.id ?? "";
  const { data: certManagerInstance } = useCertManagerInstanceState();
  // Hide only when the query has resolved AND the project is confirmed legacy. While the query
  // is in flight (data === undefined), stay optimistic so users on the active project don't see
  // the Applications group flicker in on first paint.
  const isLegacyCertManagerProject =
    certManagerInstance !== undefined && certManagerInstance.activeProjectId !== projectId;

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
    ...approvalPolicyQuery.list({
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId,
      policyType: ApprovalPolicyType.CertRequest
    }),
    enabled: isCertManagerAdmin && Boolean(projectId)
  });
  const { data: pendingCertRequestsCount = 0 } = useQuery({
    ...approvalRequestQuery.list({
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId,
      policyType: ApprovalPolicyType.CertRequest
    }),
    enabled: Boolean(projectId),
    select: (requests) => requests.filter((r) => r.status === ApprovalRequestStatus.Pending).length
  });
  const { data: pendingSigningRequestsCount = 0 } = useQuery({
    ...approvalRequestQuery.list({
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId,
      policyType: ApprovalPolicyType.CertCodeSigning
    }),
    enabled: Boolean(projectId),
    select: (requests) => requests.filter((r) => r.status === ApprovalRequestStatus.Pending).length
  });
  const pendingRequestsCount = pendingCertRequestsCount + pendingSigningRequestsCount;

  const hasLegacyAlerts =
    Boolean(v2AlertsData?.alerts?.some((a) => !a.applicationId)) ||
    Boolean(v1AlertsData?.alerts?.length);
  const hasLegacySyncs = Boolean(syncs?.some((s) => !s.applicationId));
  const hasLegacyPolicies = Boolean(policies?.some((p) => !p.scopeType));
  const hasAnyLegacy = hasLegacyAlerts || hasLegacySyncs || hasLegacyPolicies;

  const overviewItems: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, pathSuffix: "overview" },
    { label: "Inventory", icon: FileKey, pathSuffix: "inventory" },
    {
      label: "Discovery",
      icon: Search,
      pathSuffix: "discovery",
      activeMatch: /\/discovery/
    },
    {
      label: "Approval Requests",
      icon: Inbox,
      pathSuffix: "requests",
      badgeCount: pendingRequestsCount || undefined
    }
  ];

  const detailPathRegex = /\/(certificate-profiles|certificate-policies|ca)\//;

  const isApplicationSourcedDetail = (
    pathname: string,
    search: Record<string, unknown>
  ): boolean => {
    if (!detailPathRegex.test(pathname)) return false;
    const { from, profileFrom } = search as { from?: string; profileFrom?: string };
    return from === "application" || (from === "profile" && profileFrom === "application");
  };

  const applicationItems: NavItem[] = [
    {
      label: "Applications",
      icon: ResourceIcon,
      pathSuffix: "applications",
      activeMatch: (pathname, search) => isApplicationSourcedDetail(pathname, search)
    }
  ];

  const codeSigningItems: NavItem[] = [
    {
      label: "Signers",
      icon: PenTool,
      pathSuffix: "code-signing",
      activeMatch: hasSignerContext ? /\/code-signing|\/approvals\/[^/]+/ : /\/code-signing/
    }
  ];

  const certificateResourcesItems: NavItem[] = [
    {
      label: "Certificate Authorities",
      icon: Landmark,
      pathSuffix: "certificate-authorities",
      activeMatch: (pathname, search) =>
        /\/ca\//.test(pathname) && !isApplicationSourcedDetail(pathname, search)
    },
    {
      label: "Certificate Policies",
      icon: ShieldCheck,
      pathSuffix: "certificate-policies",
      exactPath: true,
      activeMatch: (pathname, search) =>
        /\/certificate-policies\//.test(pathname) && !isApplicationSourcedDetail(pathname, search)
    },
    {
      label: "Certificate Profiles",
      icon: FileBadge,
      pathSuffix: "certificate-profiles",
      exactPath: true,
      activeMatch: (pathname, search) =>
        /\/certificate-profiles\//.test(pathname) && !isApplicationSourcedDetail(pathname, search)
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
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
    },
    { label: "Alerts", icon: BellRing, pathSuffix: "alerts" },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings" }
  ];

  const generalItemsForRole = isCertManagerAdmin
    ? overviewItems
    : overviewItems.filter((item) => item.pathSuffix === "requests");

  return (
    <>
      <SidebarCollapsibleGroup label="General">
        <ProjectNavList items={generalItemsForRole} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      {isLegacyCertManagerProject ? null : (
        <SidebarCollapsibleGroup label="Applications">
          <ProjectNavList items={applicationItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      <SidebarCollapsibleGroup label="Code Signing">
        <ProjectNavList items={codeSigningItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      {isCertManagerAdmin ? (
        <SidebarCollapsibleGroup label="Certificate Resources">
          <ProjectNavList items={certificateResourcesItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      ) : null}
      {isCertManagerAdmin && hasAnyLegacy ? (
        <SidebarCollapsibleGroup label="Legacy" defaultOpen={false}>
          <ProjectNavList items={legacyItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      ) : null}
      {isCertManagerAdmin ? (
        <SidebarCollapsibleGroup label="Administration">
          <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      ) : null}
    </>
  );
};
