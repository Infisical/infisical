import { TilePicker } from "@infisical/cipher/patterns/tile-picker";
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

const SOURCES = {
  frameworks: {
    label: "Frameworks",
    entries: [...[...frameworks].sort(byName), ...TOOLING] as DocsEntry[]
  },
  infrastructure: {
    label: "Infrastructure integrations",
    entries: [...infrastructure].sort(byName) as DocsEntry[]
  }
};

export const DocsIntegrationsTab = ({ kind }: { kind: keyof typeof SOURCES }) => {
  const { label, entries } = SOURCES[kind];
  return (
    <TilePicker
      items={entries.map((entry) => ({
        value: entry.docsLink,
        title: entry.name,
        eyebrow: entry.category,
        icon: entry.image ? undefined : entry.icon,
        media: entry.image && (
          <ProviderIcon icon={`${entry.image}.png`} alt={`${entry.name} logo`} size="md" />
        ),
        keywords: [entry.slug]
      }))}
      onSelect={(docsLink) => window.open(docsLink, "_blank", "noopener,noreferrer")}
      searchLabel={`Search ${label.toLowerCase()}`}
      searchPlaceholder={`Search ${label.toLowerCase()}...`}
      noun="integrations"
    />
  );
};
