import { useState } from "react";
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
import integrations from "../json/infrastructureIntegrations.json";

export const InfrastructureIntegrationTab = () => {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const filteredIntegrations = [...integrations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(
      (integration) =>
        !query ||
        integration.name.toLowerCase().includes(query) ||
        integration.slug.toLowerCase().includes(query) ||
        integration.category.toLowerCase().includes(query)
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Click on an integration to read the documentation.</p>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search integrations (e.g. Kubernetes, Terraform, Jenkins)"
        />
      </InputGroup>
      {filteredIntegrations.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredIntegrations.map((integration) => (
            <IntegrationDocsCard
              key={`infrastructure-integration-${integration.slug}`}
              name={integration.name}
              category={integration.category}
              description={integration.description}
              image={integration.image}
              href={integration.docsLink}
            />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching integrations</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
