import type { SidebarSection } from "@infisical/cipher/ui/sidebar";
import type { LinkOptions } from "@tanstack/react-router";

import type { ProjectType } from "@app/hooks/api/projects/types";

import type { ShellLocation } from "./location";
import {
  orgSections,
  productNavItems,
  productOf,
  productSections,
  settingsSections,
  type ShellNavItem,
  type ShellNavSection
} from "./navigation";

export type V4ShellLevel = {
  id: string;
  label: string;
  landing: LinkOptions;
  sections: readonly SidebarSection[];
};

type LinkTo = (path: string, search?: Record<string, string>) => LinkOptions;

const navLink = (linkTo: LinkTo, item: Pick<ShellNavItem, "id" | "path" | "search">) =>
  ({
    ...linkTo(item.path, item.search),
    activeOptions: {
      exact: item.id === "home" || item.id === "projects",
      includeSearch: Boolean(item.search)
    }
  }) as LinkOptions;

const shellLevel = (
  linkTo: LinkTo,
  id: string,
  label: string,
  sections: readonly ShellNavSection[],
  opens: Record<string, V4ShellLevel> = {},
  counts: Record<string, number> = {}
): V4ShellLevel => {
  const first = sections[0].items[0];
  return {
    id,
    label,
    landing: linkTo(first.path, first.search),
    sections: sections.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({
        id: `${id}:${item.id}`,
        label: item.label,
        icon: item.icon,
        count: counts[item.id] || item.count,
        ...(opens[item.id]
          ? { drillIn: true, link: opens[item.id].landing }
          : { link: navLink(linkTo, item) })
      }))
    }))
  };
};

/** The sidebar id of a product page's row in the org level's Products section. */
export const productNavId = (slug: string, itemId: string) => `org:${slug}:${itemId}`;

const withProducts = (
  level: V4ShellLevel,
  linkTo: LinkTo,
  blocked: ReadonlySet<ProjectType>
): V4ShellLevel => ({
  ...level,
  sections: [
    level.sections[0],
    {
      label: "Products",
      items: productNavItems(blocked).map((product) => ({
        id: `org:${product.id}`,
        label: product.label,
        icon: product.icon,
        disabled: product.disabled,
        ...(product.children && !product.disabled
          ? {
              defaultOpen: product.id === "secret-management",
              children: product.children.map((page) => ({
                id: productNavId(product.id, page.id),
                label: page.label,
                link: navLink(linkTo, page)
              }))
            }
          : { link: navLink(linkTo, { id: product.id, path: product.path }) })
      }))
    },
    ...level.sections.slice(1)
  ]
});

/** The sidebar levels from the org down to the one the route is on; each lands on its first row. */
export const shellTrail = ({
  at,
  projectName,
  isSubOrganization,
  blocked,
  nested = [],
  linkTo,
  projectCounts
}: {
  at: ShellLocation;
  projectName?: string;
  isSubOrganization: boolean;
  blocked: ReadonlySet<ProjectType>;
  nested?: readonly V4ShellLevel[];
  linkTo: LinkTo;
  /** Count badges on the project level's links, by item id. */
  projectCounts?: Record<string, number>;
}): V4ShellLevel[] => {
  const product = at.product ? productOf(at.product) : undefined;
  const orgSettings = shellLevel(
    linkTo,
    "settings",
    "Settings",
    settingsSections(isSubOrganization)
  );
  const trail = [
    withProducts(
      shellLevel(linkTo, "org", "Home", orgSections(isSubOrganization), {
        settings: orgSettings
      }),
      linkTo,
      blocked
    ),
    ...nested
  ];
  if (at.level === "settings") trail.push(orgSettings);
  if (product && at.projectId)
    trail.push(shellLevel(linkTo, "product", product.label, productSections(product)));
  const projectSettings =
    at.settings && shellLevel(linkTo, "project-settings", "Settings", at.settings);
  const opens = projectSettings ? { settings: projectSettings } : undefined;
  if (at.projectId)
    trail.push(
      shellLevel(linkTo, at.level, projectName ?? "Project", at.sections, opens, projectCounts)
    );
  else if (at.level === "pki" || at.level === "scanning" || at.level === "pam")
    trail.push(shellLevel(linkTo, at.level, product?.label ?? at.level, at.sections, opens));
  if (projectSettings && at.inSettings) trail.push(projectSettings);
  return trail;
};
