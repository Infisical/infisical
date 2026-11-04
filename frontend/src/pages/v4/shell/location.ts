import { urlSlugToProjectType } from "@app/helpers/project";
import type { ProjectType } from "@app/hooks/api/projects/types";

import {
  agentVaultSections,
  kmsSections,
  orgSections,
  pamSections,
  pkiSections,
  productOf,
  productSections,
  projectSections,
  scanningSections,
  settingsSections,
  type ShellLevel,
  type ShellNavItem,
  type ShellNavSection
} from "./navigation";

export type ShellLocation = {
  level: ShellLevel;
  sections: readonly ShellNavSection[];
  current?: ShellNavItem;
  product?: ProjectType;
  projectId?: string;
};

const productResources = new Set([
  "insights",
  "secret-sharing",
  "product-settings",
  "kmip-servers"
]);
const detailOwners: [RegExp, string][] = [
  [/\/(members|identities|groups|roles)\//, "access"],
  [/^\/cert-manager\/certificates\//, "inventory"]
];

const locate = (path: string, isSubOrganization: boolean): Omit<ShellLocation, "current"> => {
  const project = path.match(/^\/projects\/(secret-management|kms)\/([^/]+)/);
  if (project && !productResources.has(project[2])) {
    const type = urlSlugToProjectType(project[1])!;
    const base = project[0];
    return project[1] === "kms"
      ? { level: "kms", sections: kmsSections(base), product: type, projectId: project[2] }
      : { level: "project", sections: projectSections(base), product: type, projectId: project[2] };
  }
  if (path.startsWith("/cert-manager")) {
    return { level: "pki", sections: pkiSections, product: urlSlugToProjectType("cert-manager")! };
  }
  if (path.startsWith("/secret-scanning")) {
    return {
      level: "scanning",
      sections: scanningSections,
      product: urlSlugToProjectType("secret-scanning")!
    };
  }
  if (/^\/pam(\/|$)/.test(path)) {
    return { level: "pam", sections: pamSections, product: urlSlugToProjectType("pam")! };
  }
  if (/^\/agent-vault(\/|$)/.test(path)) {
    return {
      level: "agent-vault",
      sections: agentVaultSections,
      product: urlSlugToProjectType("agent-vault")!
    };
  }
  const product = urlSlugToProjectType(
    path.match(/^\/projects\/product-settings\/([^/]+)/)?.[1] ??
      path.match(/^\/projects\/([^/]+)/)?.[1] ??
      ""
  );
  if (product) {
    return { level: "product", sections: productSections(productOf(product)), product };
  }
  if (/^\/(settings|sso|oauth-applications|networking)(\/|$)/.test(path)) {
    return { level: "settings", sections: settingsSections(isSubOrganization) };
  }
  return { level: "org", sections: orgSections };
};

export const resolveShellLocation = (
  path: string,
  selectedTab: string | undefined,
  isSubOrganization: boolean
): ShellLocation => {
  const at = locate(path, isSubOrganization);
  const items = at.sections.flatMap((section) => section.items);
  const matches = items.filter(
    (item) =>
      (path === item.path || path.startsWith(`${item.path}/`)) &&
      (!item.search || item.search.selectedTab === (selectedTab ?? "tab-org-general"))
  );
  const current =
    matches.sort((a, b) => b.path.length - a.path.length)[0] ??
    items.find(
      (item) => item.id === detailOwners.find(([pattern]) => pattern.test(`${path}/`))?.[1]
    );
  return { ...at, current };
};
