import { linkOptions, type LinkOptions } from "@tanstack/react-router";

import { componentCatalog } from "@app/components/v4/catalog";
import { type ComponentGroup } from "@app/components/v4/contracts/types";
import required from "@app/components/v4/required-capabilities.json";
import guidance from "@app/components/v4/skills/infisical-ui/rules.json";
import { type IconName } from "@app/components/v4/ui/icon";

export const foundationPages = [
  { id: "colors", slug: "color", title: "Color" },
  { id: "typography", slug: "typography", title: "Typography" },
  { id: "spacing-shape", slug: "spacing-shape", title: "Spacing and shape" },
  { id: "motion", slug: "motion", title: "Motion" },
  { id: "rules", slug: "rules", title: "Rules" }
] as const;

export const comparisonPages = [
  {
    id: "compare-shell",
    screen: "shell",
    title: "App shell",
    description: "The sidebar, top bar and switchers on payments-api, with page content left out.",
    start: 0
  },
  {
    id: "compare-home",
    screen: "home",
    title: "Organization home",
    description: "The products with their live counts, stats in the card frame band."
  },
  {
    id: "compare-secrets",
    screen: "secrets",
    title: "Secrets",
    description: "A local Secrets Overview with scoped resources and interactive fixture scenarios."
  },
  {
    id: "compare-access",
    screen: "access",
    title: "Access control",
    description:
      "Organization and project access control ported from main: users, machine identities, groups, service tokens, roles and the role editor, with every flow on local demo data. Pick a page or flow to compare."
  },
  {
    id: "compare-settings",
    screen: "settings",
    title: "Organization settings",
    description: "General settings as SettingsCard sections with Field, Input and Select."
  },
  {
    id: "compare-approvals",
    screen: "approvals",
    title: "Change requests",
    description: "4 open production change requests in the ApprovalQueue pattern."
  },
  {
    id: "compare-certificates",
    screen: "certificates",
    title: "Certificates",
    description:
      "The internal-pki inventory in a DataTable, with each certificate opening its detail page."
  },
  {
    id: "compare-kms",
    screen: "kms",
    title: "KMS keys",
    description: "The 7 keys in kms-keys with their usage, algorithm, status and key actions."
  },
  {
    id: "compare-connections",
    screen: "connections",
    title: "App connections",
    description:
      "9 app connections with method, owner and status, and New connection opens a three-step Sheet."
  },
  {
    id: "compare-identities",
    screen: "identities",
    title: "Machine identities",
    description:
      "6 machine identities with their auth methods; open one for its details, auth methods and projects."
  },
  {
    id: "compare-audit-logs",
    screen: "audit-logs",
    title: "Audit logs",
    description:
      "12,408 organization events from the last 30 days in a virtual DataTable that loads 500 rows at a time."
  },
  {
    id: "compare-secret-scanning",
    screen: "secret-scanning",
    title: "Secret Scanning findings",
    description:
      "Unresolved leaks across 3 GitHub data sources, with status and source filters and bulk triage."
  }
] as const;
export type ComparisonPage = (typeof comparisonPages)[number]["id"];

export const componentGroupOrder: readonly ComponentGroup[] = [
  "Actions",
  "Forms",
  "Navigation",
  "Data display",
  "Feedback",
  "Overlays",
  "Composites",
  "Patterns",
  "Code",
  "Utilities"
];

export type WorkbenchCategory =
  | "overview"
  | "foundations"
  | "components"
  | "patterns"
  | "comparisons";

export const workbenchCategories: { id: WorkbenchCategory; title: string; icon: IconName }[] = [
  { id: "overview", title: "Overview", icon: "home" },
  { id: "foundations", title: "Foundations", icon: "apps" },
  { id: "components", title: "Components", icon: "folder" },
  { id: "patterns", title: "Patterns", icon: "sync" },
  { id: "comparisons", title: "Comparisons", icon: "eye" }
];

export const groupIcons: Record<ComponentGroup, IconName> = {
  Actions: "plus",
  Forms: "file",
  Navigation: "menu",
  "Data display": "inbox",
  Feedback: "bell",
  Overlays: "folder-open",
  Composites: "building",
  Patterns: "sync",
  Code: "terminal",
  Utilities: "settings"
};

export type WorkbenchPage = {
  id: string;
  title: string;
  slug: string;
  category: WorkbenchCategory;
  group?: ComponentGroup;
  link: LinkOptions;
};

export const groupSlug = (group: string) => group.toLowerCase().replaceAll(" ", "-");

const catalogPages = (category: "components" | "patterns") =>
  componentGroupOrder
    .filter((group) => (group === "Patterns") === (category === "patterns"))
    .flatMap((group) => componentCatalog.filter((entry) => entry.group === group))
    .map((entry): WorkbenchPage => ({
      id: entry.id,
      title: entry.title,
      slug: entry.id,
      category,
      group: category === "components" ? entry.group : undefined,
      link:
        category === "components"
          ? linkOptions({
              to: "/design-system/components/$group/$component",
              params: { group: groupSlug(entry.group), component: entry.id }
            })
          : linkOptions({ to: "/design-system/patterns/$pattern", params: { pattern: entry.id } })
    }));

export const workbenchPages: readonly WorkbenchPage[] = [
  {
    id: "overview",
    title: "Overview",
    slug: "",
    category: "overview",
    link: linkOptions({ to: "/design-system", activeOptions: { exact: true } })
  },
  ...foundationPages.map((page): WorkbenchPage => ({
    ...page,
    category: "foundations",
    link: linkOptions({ to: "/design-system/foundations/$page", params: { page: page.slug } })
  })),
  ...catalogPages("components"),
  ...catalogPages("patterns"),
  ...comparisonPages.map((page): WorkbenchPage => ({
    id: page.id,
    title: page.title,
    slug: page.screen,
    category: "comparisons",
    link: linkOptions({
      to: "/design-system/comparisons/$comparison",
      params: { comparison: page.screen }
    })
  }))
];

export const pagesIn = (category: WorkbenchCategory, group?: string) =>
  workbenchPages.filter(
    (page) => page.category === category && (!group || groupSlug(page.group ?? "") === group)
  );

export const workbenchPage = (id: string | undefined) =>
  workbenchPages.find((page) => page.id === id) ?? workbenchPages[0];

export const findWorkbenchPage = (category: WorkbenchCategory, slug: string, group?: string) =>
  pagesIn(category, group).find((page) => page.slug === slug);

export const fallbackLink = (splat: string) => {
  const [category, group] = splat.split("/");
  const pages = workbenchCategories.some((entry) => entry.id === category)
    ? pagesIn(category as WorkbenchCategory, group)
    : [];
  return (pages[0] ?? pagesIn(category as WorkbenchCategory)[0] ?? workbenchPages[0]).link;
};

export const routePage = (routeId: string, routeParams: object) => {
  if (routeId === "/design-system/") return workbenchPages[0];
  const params = routeParams as Record<string, string | undefined>;
  const category = routeId.split("/")[2] as WorkbenchCategory;
  const slug = params.page ?? params.component ?? params.pattern ?? params.comparison;
  return slug ? findWorkbenchPage(category, slug, params.group) : undefined;
};

export const legacyHashLink = (fullHash: string): LinkOptions | undefined => {
  const [name, example] = fullHash.replace(/^#/, "").split("/");
  if (!name) return undefined;
  const pageLink = (id: string, hash?: string) => {
    const page = workbenchPages.find((entry) => entry.id === id);
    return page && { ...page.link, hash };
  };
  if (name === "button-directions") return pageLink("button");
  const alias = Object.entries(required.aliases).find(([entry]) => entry === name)?.[1];
  if (alias) return pageLink(alias);
  if (guidance.rules.some((rule) => `rule-${rule.id}` === name)) return pageLink("rules", name);
  const ruleOwner = componentCatalog.find((entry) =>
    entry.guidance.rules.some((rule) => `rule-${rule.id}` === name)
  );
  if (ruleOwner) return pageLink(ruleOwner.id, name);
  return pageLink(name, example);
};

export const hasComponentPreview = (name: string) =>
  componentCatalog.some((entry) => entry.id === name && entry.examples.length > 0);
