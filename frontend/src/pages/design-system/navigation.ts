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
export const documentationPages = [...foundationPages, ...componentPages, ...guidancePages];
export type DocumentationPage = (typeof documentationPages)[number]["id"];
export type ComponentPage = (typeof componentPages)[number]["id"];

export const resolveDocumentationPage = (hash: string): DocumentationPage => {
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
