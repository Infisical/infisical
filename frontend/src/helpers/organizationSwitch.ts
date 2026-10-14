import type { ParsedLocation } from "@tanstack/react-router";

const organizationSwitchSections = [
  "projects/secret-management/product-settings",
  "projects/secret-management/secret-sharing",
  "projects/secret-management/insights",
  "projects/kms/kmip-servers",
  "projects/secret-management",
  "projects/cert-manager",
  "projects/secret-scanning",
  "projects/kms",
  "projects",
  "networking",
  "access-management",
  "audit-logs",
  "settings",
  "integrations",
  "sso",
  "billing",
  "oauth-applications",
  "pam/accounts",
  "pam/templates",
  "pam/discovery",
  "pam/sessions",
  "pam/approval-requests",
  "pam/audit-logs",
  "pam/access-management",
  "agent-vault/sessions",
  "agent-vault/access-bundles",
  "agent-vault/proxies",
  "agent-vault/settings",
  "agent-vault/audit-logs",
  "agent-vault/access-management"
];

export const getOrganizationSwitchDestination = (
  location: Pick<ParsedLocation<Record<string, unknown>>, "pathname" | "search">,
  organizationId: string,
  isSubOrganization = false
) => {
  const path = location.pathname.match(/^\/organizations\/[^/]+\/(.*?)\/?$/)?.[1] ?? "";
  const accessResource = path.match(/^(?:(pam|agent-vault)\/)?(groups|members|roles|identities)\//);
  let section = organizationSwitchSections.find(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`)
  );
  let selectedTab =
    path === section && typeof location.search.selectedTab === "string"
      ? location.search.selectedTab
      : undefined;

  if (accessResource) {
    const [, productScope, resourceTab] = accessResource;
    section = `${productScope ? `${productScope}/` : ""}access-management`;
    selectedTab = resourceTab;
  } else if (path.startsWith("networking/relays/")) {
    selectedTab = "relays";
  } else if (path.startsWith("app-connections")) {
    section = "integrations";
  } else if (path === "cert-manager" || path.startsWith("cert-manager/")) {
    // The other org may have no Certificate Manager yet, which the product landing page handles.
    section = "projects/cert-manager";
    selectedTab = undefined;
  }

  if (isSubOrganization) {
    if (section && ["sso", "billing", "oauth-applications"].includes(section)) {
      section = "settings";
      selectedTab = undefined;
    } else if (
      section === "settings" &&
      selectedTab &&
      ["tab-org-security", "tab-sub-organizations"].includes(selectedTab)
    ) {
      selectedTab = undefined;
    }
  }

  return {
    to: `/organizations/$orgId/${section ?? "projects"}`,
    params: { orgId: organizationId },
    search: { selectedTab, subOrganization: undefined }
  };
};
