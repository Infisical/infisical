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
  type ShellLevel,
  type ShellNavItem,
  type ShellNavSection
} from "./navigation";

export type ShellLocation = {
  level: ShellLevel;
  sections: readonly ShellNavSection[];
  current?: ShellNavItem;
  /** The expandable row that holds current, such as Settings. */
  group?: ShellNavItem;
  product?: ProjectType;
  projectId?: string;
};

export const withoutNavItem = (location: ShellLocation, itemId: string): ShellLocation => {
  const sections = location.sections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.id !== itemId)
      .map((item) => {
        if (!item.children) return item;
        const children = item.children.filter((child) => child.id !== itemId);
        return { ...item, children: children.length > 1 ? children : undefined };
      })
  }));
  const group = sections
    .flatMap((section) => section.items)
    .find((item) => item.id === location.group?.id);
  if (!location.group || group?.children) return { ...location, sections, group };
  return { ...location, sections, current: group, group: undefined };
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
  [/^\/cert-manager\/approvals\//, "requests"],
  [/^\/cert-manager\/ca\//, "authorities"],
  [/^\/cert-manager\/hsm-connectors\//, "hsm-connectors"]
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
  return { level: "org", sections: orgSections(isSubOrganization) };
};

export const resolveShellLocation = (
  path: string,
  selectedTab: string | undefined,
  isSubOrganization: boolean
): ShellLocation => {
  const at = locate(path, isSubOrganization);
  const rows = at.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      (item.children ?? [item]).map((row) => ({ row, group: item.children && item }))
    )
  );
  const longest = rows
    .filter(({ row }) => path === row.path || path.startsWith(`${row.path}/`))
    .sort((a, b) => b.row.path.length - a.row.path.length)[0]?.row.path;
  const onPath = rows.filter(({ row }) => row.path === longest);
  const match =
    onPath.find(({ row }) => row.search?.selectedTab === selectedTab) ??
    onPath[0] ??
    rows.find(
      ({ row }) => row.id === detailOwners.find(([pattern]) => pattern.test(`${path}/`))?.[1]
    );
  return { ...at, current: match?.row, group: match?.group };
};
