import { createElement, type ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import type { SidebarSection } from "@infisical/cipher/ui/sidebar";
import type { LinkOptions } from "@tanstack/react-router";

import type { ProjectType } from "@app/hooks/api/projects/types";

import type { ShellLocation } from "./location";
import {
  orgSections,
  productNavItems,
  productOf,
  productSections,
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
  counts: Record<string, number> = {},
  badges: Record<string, ReactNode> = {}
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
        badge: badges[item.id],
        ...(item.children
          ? {
              children: item.children.map((child) => ({
                id: `${id}:${child.id}`,
                label: child.label,
                count: counts[child.id] || child.count,
                badge: badges[child.id],
                link: navLink(linkTo, child)
              }))
            }
          : { link: navLink(linkTo, item) })
      }))
    }))
  };
};

/** The sidebar id of a product page's row in the org level's Products section. */
export const productNavId = (slug: string, itemId: string) => `org:${slug}:${itemId}`;

export const productCurrentId = (type: ProjectType, itemId: string) => {
  const product = productOf(type);
  return productSections(product)[0].items.length > 1
    ? productNavId(product.slug, itemId)
    : `org:${product.slug}`;
};

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
        badge:
          product.id === "agent-vault"
            ? createElement(Badge, { size: "sm", collapse: true }, "Preview")
            : undefined,
        ...(product.children
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
  projectCounts,
  projectBadges,
  productCounts
}: {
  at: ShellLocation;
  projectName?: string;
  isSubOrganization: boolean;
  blocked: ReadonlySet<ProjectType>;
  nested?: readonly V4ShellLevel[];
  linkTo: LinkTo;
  /** Count badges on the project level's links, by item id. */
  projectCounts?: Record<string, number>;
  /** Badges on the project level's links, by item id. */
  projectBadges?: Record<string, ReactNode>;
  /** Count badges on an org-scoped product level's links, by item id. */
  productCounts?: Record<string, number>;
}): V4ShellLevel[] => {
  const product = at.product ? productOf(at.product) : undefined;
  const trail = [
    withProducts(
      shellLevel(linkTo, "org", "Home", orgSections(isSubOrganization)),
      linkTo,
      blocked
    ),
    ...nested
  ];
  if (product && at.projectId)
    trail.push(shellLevel(linkTo, "product", product.label, productSections(product)));
  if (at.projectId)
    trail.push(
      shellLevel(
        linkTo,
        at.level,
        projectName ?? "Project",
        at.sections,
        projectCounts,
        projectBadges
      )
    );
  else if (at.level === "pki" || at.level === "scanning" || at.level === "pam")
    trail.push(
      shellLevel(linkTo, at.level, product?.label ?? at.level, at.sections, productCounts)
    );
  return trail;
};
