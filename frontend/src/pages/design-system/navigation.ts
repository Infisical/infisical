import { componentCatalog } from "@app/components/v4/catalog";
import required from "@app/components/v4/required-capabilities.json";
import guidance from "@app/components/v4/skills/infisical-ui/rules.json";

export const foundationPages = [
  { id: "overview", title: "Overview" },
  { id: "colors", title: "Color" },
  { id: "typography", title: "Typography" },
  { id: "spacing-shape", title: "Spacing and shape" },
  { id: "motion", title: "Motion" }
] as const;

export const componentPages = componentCatalog.map(({ id, title, group }) => ({
  id,
  title,
  group
}));
export const guidancePages = [{ id: "rules", title: "Rules" }] as const;
export const comparisonPages = [
  {
    id: "compare-shell",
    screen: "shell",
    title: "App shell",
    description: "The sidebar, top bar and switchers on payments-api, with page content left out."
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
    description: "payments-api in Development: 2 folders and 11 secrets in a DataTable."
  },
  {
    id: "compare-access",
    screen: "access",
    title: "Access control",
    description: "The 7 organization users and their roles, with the section tabs in PageHeader."
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
  }
] as const;
export type ComparisonPage = (typeof comparisonPages)[number]["id"];
export const documentationPages = [
  ...foundationPages,
  ...componentPages,
  ...comparisonPages,
  ...guidancePages
];
export type DocumentationPage = (typeof documentationPages)[number]["id"];
export type ComponentPage = (typeof componentPages)[number]["id"];

export const resolveDocumentationPage = (fullHash: string): DocumentationPage => {
  const hash = fullHash.split("/")[0];
  if (hash === "#button-directions") return "button";
  const alias = Object.entries(required.aliases).find(([name]) => `#${name}` === hash)?.[1];
  if (alias) return alias;
  if (guidance.rules.some((rule) => `#rule-${rule.id}` === hash)) return "rules";
  const ruleOwner = componentCatalog.find((entry) =>
    entry.guidance.rules.some((rule) => `#rule-${rule.id}` === hash)
  );
  if (ruleOwner) return ruleOwner.id;
  return documentationPages.find((page) => `#${page.id}` === hash)?.id ?? "overview";
};

export const hasComponentPreview = (name: string) =>
  componentCatalog.some((entry) => entry.id === name && entry.examples.length > 0);
