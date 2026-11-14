import type { SidebarSection } from "@infisical/cipher/ui/sidebar";
import type { LinkOptions } from "@tanstack/react-router";

import type { ShellLocation } from "./location";
import {
  orgSections,
  productOf,
  productSections,
  settingsSections,
  type ShellNavSection
} from "./navigation";

export type V4ShellLevel = {
  id: string;
  label: string;
  landing: LinkOptions;
  sections: readonly SidebarSection[];
};

type LinkTo = (path: string, search?: Record<string, string>) => LinkOptions;

const shellLevel = (
  linkTo: LinkTo,
  id: string,
  label: string,
  sections: readonly ShellNavSection[],
  opens: Record<string, V4ShellLevel> = {}
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
        count: item.count,
        ...(opens[item.id]
          ? { drillIn: true, link: opens[item.id].landing }
          : {
              link: {
                ...linkTo(item.path, item.search),
                activeOptions: {
                  exact: item.id === "home" || item.id === "projects",
                  includeSearch: Boolean(item.search)
                }
              } as LinkOptions
            })
      }))
    }))
  };
};

/** The sidebar levels from the org down to the one the route is on; each lands on its first row. */
export const shellTrail = ({
  at,
  orgName,
  projectName,
  isSubOrganization,
  nested = [],
  linkTo
}: {
  at: ShellLocation;
  orgName: string;
  projectName?: string;
  isSubOrganization: boolean;
  nested?: readonly V4ShellLevel[];
  linkTo: LinkTo;
}): V4ShellLevel[] => {
  const product = at.product ? productOf(at.product) : undefined;
  const orgSettings = shellLevel(
    linkTo,
    "settings",
    "Settings",
    settingsSections(isSubOrganization)
  );
  const trail = [
    shellLevel(linkTo, "org", orgName, orgSections(isSubOrganization), { settings: orgSettings }),
    ...nested
  ];
  if (at.level === "settings") trail.push(orgSettings);
  if (product && (at.level === "product" || at.projectId))
    trail.push(shellLevel(linkTo, "product", product.label, productSections(product)));
  const projectSettings =
    at.settings && shellLevel(linkTo, "project-settings", "Settings", at.settings);
  const opens = projectSettings ? { settings: projectSettings } : undefined;
  if (at.projectId)
    trail.push(shellLevel(linkTo, at.level, projectName ?? at.projectId, at.sections, opens));
  else if (at.level === "pki" || at.level === "scanning" || at.level === "pam")
    trail.push(shellLevel(linkTo, at.level, product?.label ?? at.level, at.sections, opens));
  if (projectSettings && at.inSettings) trail.push(projectSettings);
  return trail;
};
