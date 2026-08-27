import { useMemo, useState } from "react";
import { KeyRoundIcon, SearchIcon } from "lucide-react";

import { dynamicSecretProviderRegistry } from "@app/components/dynamic-secrets";
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
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

type TProviderPresentation = {
  brand: string;
  image?: string;
};

const PROVIDER_PRESENTATION: Record<DynamicSecretProviders, TProviderPresentation> = {
  [DynamicSecretProviders.SqlDatabase]: { brand: "SQL", image: "Postgres.png" },
  [DynamicSecretProviders.Cassandra]: { brand: "Cassandra", image: "Cassandra.png" },
  [DynamicSecretProviders.Redis]: { brand: "Redis", image: "Redis.png" },
  [DynamicSecretProviders.AwsElastiCache]: {
    brand: "AWS",
    image: "Amazon Web Services.png"
  },
  [DynamicSecretProviders.AwsMemoryDb]: { brand: "AWS", image: "Amazon Web Services.png" },
  [DynamicSecretProviders.AwsIam]: { brand: "AWS", image: "Amazon Web Services.png" },
  [DynamicSecretProviders.MongoAtlas]: { brand: "MongoDB", image: "MongoDB.png" },
  [DynamicSecretProviders.MongoDB]: { brand: "MongoDB", image: "MongoDB.png" },
  [DynamicSecretProviders.ElasticSearch]: { brand: "Elastic", image: "Elastic.png" },
  [DynamicSecretProviders.RabbitMq]: { brand: "RabbitMQ" },
  [DynamicSecretProviders.AzureEntraId]: {
    brand: "Azure",
    image: "Microsoft Azure.png"
  },
  [DynamicSecretProviders.AzureSqlDatabase]: {
    brand: "Azure",
    image: "Microsoft Azure.png"
  },
  [DynamicSecretProviders.Ldap]: { brand: "LDAP", image: "LDAP.png" },
  [DynamicSecretProviders.SapHana]: { brand: "SAP" },
  [DynamicSecretProviders.SapAse]: { brand: "SAP" },
  [DynamicSecretProviders.Snowflake]: { brand: "Snowflake", image: "Snowflake.png" },
  [DynamicSecretProviders.Totp]: { brand: "TOTP" },
  [DynamicSecretProviders.Vertica]: { brand: "Vertica" },
  [DynamicSecretProviders.Kubernetes]: { brand: "Kubernetes", image: "Kubernetes.png" },
  [DynamicSecretProviders.GcpIam]: {
    brand: "Google Cloud",
    image: "Google Cloud Platform.png"
  },
  [DynamicSecretProviders.Github]: { brand: "GitHub", image: "GitHub.png" },
  [DynamicSecretProviders.Couchbase]: { brand: "Couchbase" },
  [DynamicSecretProviders.Milvus]: { brand: "Milvus" },
  [DynamicSecretProviders.Clickhouse]: { brand: "ClickHouse" },
  [DynamicSecretProviders.Ssh]: { brand: "SSH", image: "SSH.png" },
  [DynamicSecretProviders.IbmApiConnect]: { brand: "IBM", image: "IBM.png" },
  [DynamicSecretProviders.Tailscale]: { brand: "Tailscale" }
};

const ProviderCard = ({
  provider,
  onSelect
}: {
  provider: DynamicSecretProviders;
  onSelect: () => void;
}) => {
  const definition = dynamicSecretProviderRegistry.requireDefinition(provider);
  const { brand, image } = PROVIDER_PRESENTATION[provider];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-foreground/15 hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-container">
          {image ? (
            <img
              src={`/images/integrations/${image}`}
              alt={`${brand} logo`}
              className="size-6 object-contain"
            />
          ) : (
            <KeyRoundIcon className="size-5 text-muted" aria-hidden="true" />
          )}
        </div>
        <span className="text-xs font-medium text-muted">{brand}</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{definition.label}</p>
        <p className="text-xs leading-relaxed text-muted">
          Generate time-limited {definition.label} credentials on demand.
        </p>
      </div>
    </button>
  );
};

export const DynamicSecretProviderSelect = ({
  onSelect
}: {
  onSelect: (provider: DynamicSecretProviders) => void;
}) => {
  const [search, setSearch] = useState("");
  const filteredProviders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dynamicSecretProviderRegistry.providers;

    return dynamicSecretProviderRegistry.providers.filter((provider) => {
      const definition = dynamicSecretProviderRegistry.requireDefinition(provider);
      const { brand } = PROVIDER_PRESENTATION[provider];
      return [definition.label, brand, provider].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [search]);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search providers — SQL, AWS, MongoDB..."
          aria-label="Search dynamic secret providers"
        />
      </InputGroup>

      <section>
        <p className="mb-3 text-xs font-medium text-muted">All providers</p>
        {filteredProviders.length ? (
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            {filteredProviders.map((provider) => (
              <ProviderCard
                key={provider}
                provider={provider}
                onSelect={() => onSelect(provider)}
              />
            ))}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No matching providers</EmptyTitle>
              <EmptyDescription>Try a different search term.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
};
