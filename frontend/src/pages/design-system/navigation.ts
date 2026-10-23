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
    description: "A local Secrets Overview with scoped resources and interactive fixture scenarios."
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
