import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faKeyboard } from "@fortawesome/free-regular-svg-icons";
import { faComputer } from "@fortawesome/free-solid-svg-icons";
import { Search } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";

import { IntegrationDocsCard } from "../IntegrationDocsCard";
import frameworks from "../json/frameworkIntegrations.json";

const TOOLING_INTEGRATIONS = [
  {
    name: "CLI",
    slug: "cli",
    category: "Tooling",
    description: "Inject secrets into any process or script with the Infisical CLI.",
    icon: faKeyboard,
    href: "https://infisical.com/docs/cli/commands/run"
  },
  {
    name: "SDKs",
    slug: "sdks",
    category: "Tooling",
    description: "Fetch and manage secrets programmatically with Infisical's language SDKs.",
    icon: faComputer,
    href: "https://infisical.com/docs/sdks/overview"
  }
];

export const FrameworkIntegrationTab = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const matchesQuery = (item: { name: string; slug: string; category: string }) =>
    !query ||
    item.name.toLowerCase().includes(query) ||
    item.slug.toLowerCase().includes(query) ||
    item.category.toLowerCase().includes(query);

  const filteredFrameworks = [...frameworks]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(matchesQuery);

  const filteredTooling = TOOLING_INTEGRATIONS.filter(matchesQuery);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("integrations.click-to-setup")}</p>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search frameworks (e.g. Next.js, Django, Rails)"
        />
      </InputGroup>
      {filteredFrameworks.length || filteredTooling.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredFrameworks.map((framework) => (
            <IntegrationDocsCard
              key={`framework-integration-${framework.slug}`}
              name={framework.name}
              category={framework.category}
              description={framework.description}
              image={framework.image}
              href={framework.docsLink}
            />
          ))}
          {filteredTooling.map((tool) => (
            <IntegrationDocsCard
              key={`framework-integration-${tool.slug}`}
              name={tool.name}
              category={tool.category}
              description={tool.description}
              icon={tool.icon}
              href={tool.href}
            />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching frameworks</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
