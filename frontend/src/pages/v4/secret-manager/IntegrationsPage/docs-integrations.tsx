import { TilePicker, type TilePickerItem } from "@infisical/cipher/patterns/tile-picker";
import type { IconName } from "@infisical/cipher/ui/icon";

import frameworks from "@app/const/integrationDocs/frameworkIntegrations.json";
import infrastructure from "@app/const/integrationDocs/infrastructureIntegrations.json";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

type DocsEntry = {
  name: string;
  slug: string;
  category: string;
  docsLink: string;
  image?: string;
  icon?: IconName;
};

const TOOLING: DocsEntry[] = [
  {
    name: "CLI",
    slug: "cli",
    category: "Tooling",
    icon: "terminal",
    docsLink: "https://infisical.com/docs/cli/commands/run"
  },
  {
    name: "SDKs",
    slug: "sdks",
    category: "Tooling",
    icon: "apps",
    docsLink: "https://infisical.com/docs/sdks/overview"
  }
];

const byName = (a: DocsEntry, b: DocsEntry) => a.name.localeCompare(b.name);

const toItem = (entry: DocsEntry): TilePickerItem => ({
  value: entry.slug,
  title: entry.name,
  eyebrow: entry.category,
  icon: entry.icon,
  media: entry.image && <ProviderIcon icon={`${entry.image}.png`} alt="" />,
  keywords: [entry.slug],
  // v4-check-ignore hand-built-docs-link -- each catalog tile is itself a docs link
  href: entry.docsLink,
  external: true
});

const SOURCES = {
  frameworks: {
    label: "frameworks",
    placeholder: "Search frameworks, such as Next.js, Django or Rails",
    items: [...[...frameworks].sort(byName), ...TOOLING].map(toItem)
  },
  infrastructure: {
    label: "integrations",
    placeholder: "Search integrations, such as Kubernetes, Terraform or Jenkins",
    items: [...infrastructure].sort(byName).map(toItem)
  }
};

export const DocsIntegrationsTab = ({ kind }: { kind: keyof typeof SOURCES }) => {
  const { label, placeholder, items } = SOURCES[kind];
  return (
    <TilePicker
      items={items}
      searchLabel={`Search ${label}`}
      searchPlaceholder={placeholder}
      noun={label}
    />
  );
};
