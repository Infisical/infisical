import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuItem
} from "@app/components/v4/ui/command-menu";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../data/adapters";
import { useV4Session } from "../data/session/contract";
import { V4_DEMO_ORG_ID } from "../mode";
import {
  kmsSections,
  orgSections,
  pkiSections,
  productHome,
  productOf,
  products,
  productSections,
  projectBase,
  projectSections,
  scanningSections,
  settingsSections,
  type ShellNavSection
} from "./navigation";
import { useClearThemeOverride } from "./useClearThemeOverride";

type Theme = "light" | "dark" | "system";

export const CommandPalette = ({
  orgId,
  projectId,
  open,
  onOpenChange
}: {
  orgId: string;
  projectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  const session = useV4Session();
  const access = useV4Adapter("access");
  const { setTheme } = useTheme();
  const clearThemeOverride = useClearThemeOverride();
  const [groupSearch, setGroupSearch] = useState("");
  const { data: groupData } = access.useOrgGroups({
    organizationId: orgId,
    limit: 20,
    search: groupSearch
  });
  const base = `/v4/organizations/${orgId}`;
  const go = (path: string, search?: Record<string, string>) =>
    navigate({ to: `${base}${path}` as never, search: search as never });
  const project = session.projects.find((entry) => entry.id === projectId);

  const groups = useMemo(() => {
    const pageItems = (prefix: string, sections: readonly ShellNavSection[], scope?: string) =>
      sections.flatMap((section) =>
        section.items.map((item): CommandMenuItem => ({
          id: `${prefix}:${item.id}`,
          label: item.label,
          icon: item.icon,
          kind: "page",
          description: scope,
          keywords: [item.id, ...(section.label ? [section.label] : [])],
          onSelect: () => go(item.path, item.search)
        }))
      );
    const projectSectionsOf = (type: ProjectType, id: string) => {
      const projectPath = projectBase(type, id);
      return type === ProjectType.KMS ? kmsSections(projectPath) : projectSections(projectPath);
    };
    const productPages = (product: (typeof products)[number]) => {
      if (product.type === ProjectType.CertificateManager) return pkiSections;
      if (product.type === ProjectType.SecretScanning) return scanningSections;
      if (product.type === ProjectType.SecretManager || product.type === ProjectType.KMS)
        return productSections(product);
      return [];
    };
    const result: CommandMenuGroup[] = [];
    if (
      project &&
      (project.type === ProjectType.SecretManager || project.type === ProjectType.KMS)
    ) {
      result.push({
        label: project.name,
        items: pageItems("project", projectSectionsOf(project.type, project.id), project.name)
      });
    }
    result.push({
      label: "Organization",
      items: [
        ...pageItems("org", orgSections),
        ...pageItems(
          "settings",
          settingsSections(session.organization.isSubOrganization),
          "Settings"
        )
      ]
    });
    result.push({
      label: "Products",
      items: products.flatMap((product) => [
        {
          id: `product:${product.slug}`,
          label: product.label,
          icon: product.icon,
          kind: "page" as const,
          onSelect: () => go(productHome(product))
        },
        ...pageItems(`product-${product.slug}`, productPages(product), product.label)
      ]),
      searchOnly: true,
      limit: 12
    });
    result.push({
      label: "Projects",
      items: session.projects
        .filter(
          (entry) => entry.type === ProjectType.SecretManager || entry.type === ProjectType.KMS
        )
        .map((entry) => ({
          id: `project-entity:${entry.id}`,
          label: entry.name,
          kind: "project" as const,
          mono: true,
          description: productOf(entry.type).label,
          onSelect: () => go(`${projectBase(entry.type, entry.id)}/overview`)
        })),
      searchOnly: true,
      limit: 8
    });
    result.push({
      label: "Groups",
      items: (groupData?.groups ?? []).map((group) => ({
        id: `group:${group.id}`,
        label: group.name,
        kind: "person" as const,
        icon: "user" as const,
        onSelect: () => go(`/groups/${group.id}`)
      })),
      searchOnly: true,
      limit: 8
    });
    if (orgId !== V4_DEMO_ORG_ID) {
      result.push({
        label: "Organizations",
        items: session.organizations
          .filter((entry) => entry.id !== orgId)
          .map((entry) => ({
            id: `org:${entry.id}`,
            label: entry.name,
            kind: "organization" as const,
            onSelect: () => navigate({ to: `/v4/organizations/${entry.id}/projects` as never })
          })),
        searchOnly: true,
        limit: 8
      });
    }
    const pickTheme = (theme: Theme) => () => {
      setTheme(theme, "command-menu");
      clearThemeOverride();
    };
    result.push({
      label: "Commands",
      items: [
        {
          id: "theme:light",
          label: "Switch to light theme",
          icon: "sun",
          kind: "action",
          onSelect: pickTheme("light")
        },
        {
          id: "theme:dark",
          label: "Switch to dark theme",
          icon: "moon",
          kind: "action",
          onSelect: pickTheme("dark")
        },
        {
          id: "theme:system",
          label: "Use system theme",
          icon: "monitor",
          kind: "action",
          onSelect: pickTheme("system")
        }
      ]
    });
    return result;
  }, [base, groupData, project, session, orgId]);

  return (
    <CommandMenu
      open={open}
      onOpenChange={onOpenChange}
      label="Search Infisical"
      groups={groups}
      onQueryChange={(query) => setGroupSearch(query)}
    />
  );
};
