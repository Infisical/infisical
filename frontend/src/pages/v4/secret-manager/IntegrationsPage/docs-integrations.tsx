import { useState } from "react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import frameworks from "@app/const/integrationDocs/frameworkIntegrations.json";
import infrastructure from "@app/const/integrationDocs/infrastructureIntegrations.json";

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
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const categories = filters.find((entry) => entry.field === "category")?.values ?? [];
  const query = search.trim().toLowerCase();
  const visible = entries.filter(
    (entry) =>
      (!categories.length || categories.includes(entry.category)) &&
      (!query ||
        [entry.name, entry.slug, entry.category].some((text) => text.toLowerCase().includes(query)))
  );

  return (
    <Stack gap={16}>
      <FilterBar
        label={`${label} filters`}
        fields={[
          {
            key: "category",
            label: "Category",
            type: "multi-select",
            options: [...new Set(entries.map((entry) => entry.category))]
              .sort()
              .map((category) => ({ value: category, label: category }))
          }
        ]}
        value={filters}
        onChange={setFilters}
        search={
          <Input
            icon="search"
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />
      <List
        label={label}
        empty={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No matching integrations</EmptyTitle>
            </EmptyHeader>
          </Empty>
        }
      >
        {visible.map((entry) => (
          <ListRow
            key={entry.slug}
            value={entry.slug}
            label={entry.name}
            title={entry.name}
            media={
              entry.image ? (
                <ProviderIcon icon={`${entry.image}.png`} alt={`${entry.name} logo`} size="md" />
              ) : (
                entry.icon && <Icon name={entry.icon} />
              )
            }
            badge={<Badge tone="soft">{entry.category}</Badge>}
            actions={
              <Button asChild variant="outline" size="xs" icon="external">
                <a href={entry.docsLink} target="_blank" rel="noopener noreferrer">
                  Docs
                </a>
              </Button>
            }
          />
        ))}
      </List>
    </Stack>
  );
};
