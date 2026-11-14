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
  projectSettingsSections,
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
  settings?: readonly ShellNavSection[];
  inSettings?: boolean;
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
  [/^\/cert-manager\/certificates\//, "inventory"],
  [/^\/cert-manager\/approvals\//, "requests"]
];

const locate = (path: string, isSubOrganization: boolean): Omit<ShellLocation, "current"> => {
  const project = path.match(/^\/projects\/(secret-management|kms|agent-vault)\/([^/]+)/);
  if (project && !productResources.has(project[2])) {
    const type = urlSlugToProjectType(project[1])!;
    const base = project[0];
    const projectId = project[2];
    if (project[1] === "kms")
      return { level: "kms", sections: kmsSections(base), product: type, projectId };
    if (project[1] === "agent-vault")
      return { level: "agent-vault", sections: agentVaultSections(base), product: type, projectId };
    return { level: "project", sections: projectSections(base), product: type, projectId };
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
  return { level: "org", sections: orgSections(isSubOrganization) };
};

export const resolveShellLocation = (
  path: string,
  selectedTab: string | undefined,
  isSubOrganization: boolean
): ShellLocation => {
  const at = locate(path, isSubOrganization);
  const settingsPath = at.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "settings")?.path;
  const settings = settingsPath ? projectSettingsSections(at.level, settingsPath) : undefined;
  if (settings && settingsPath === path) {
    const tabs = settings.flatMap((section) => section.items);
    const current = tabs.find((item) => item.search?.selectedTab === selectedTab) ?? tabs[0];
    return { ...at, settings, inSettings: true, current };
  }
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
  return { ...at, settings, current };
};
