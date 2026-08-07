import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TDynamicSecretProviderDefinition } from "./types";

export type TRegisteredDynamicSecretProviderDefinition = TDynamicSecretProviderDefinition<
  DynamicSecretProviders,
  // Provider value types remain available from each concrete definition. The
  // composition root intentionally erases them for heterogeneous lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export type TDynamicSecretProviderDefinitionModule = {
  id: string;
  definitions: readonly TRegisteredDynamicSecretProviderDefinition[];
};

export const defineDynamicSecretProviderModule = <
  const TDefinitions extends readonly TRegisteredDynamicSecretProviderDefinition[]
>(module: {
  id: string;
  definitions: TDefinitions;
}) => module;

/** Product picker order. Partially migrated registries expose only registered entries. */
export const DYNAMIC_SECRET_PROVIDER_PICKER_ORDER = [
  DynamicSecretProviders.SqlDatabase,
  DynamicSecretProviders.Cassandra,
  DynamicSecretProviders.Redis,
  DynamicSecretProviders.AwsElastiCache,
  DynamicSecretProviders.AwsMemoryDb,
  DynamicSecretProviders.AwsIam,
  DynamicSecretProviders.MongoAtlas,
  DynamicSecretProviders.MongoDB,
  DynamicSecretProviders.ElasticSearch,
  DynamicSecretProviders.RabbitMq,
  DynamicSecretProviders.AzureEntraId,
  DynamicSecretProviders.AzureSqlDatabase,
  DynamicSecretProviders.Ldap,
  DynamicSecretProviders.SapHana,
  DynamicSecretProviders.SapAse,
  DynamicSecretProviders.Snowflake,
  DynamicSecretProviders.Totp,
  DynamicSecretProviders.Vertica,
  DynamicSecretProviders.Kubernetes,
  DynamicSecretProviders.GcpIam,
  DynamicSecretProviders.Github,
  DynamicSecretProviders.Couchbase,
  DynamicSecretProviders.Milvus,
  DynamicSecretProviders.Clickhouse,
  DynamicSecretProviders.Ssh,
  DynamicSecretProviders.IbmApiConnect,
  DynamicSecretProviders.Tailscale
] as const satisfies readonly DynamicSecretProviders[];

const DYNAMIC_SECRET_PROVIDER_DOCS_SLUG: Partial<Record<DynamicSecretProviders, string>> = {
  [DynamicSecretProviders.SqlDatabase]: "postgresql",
  [DynamicSecretProviders.MongoAtlas]: "mongo-atlas"
};

export const createDynamicSecretProviderRegistry = (
  ...modules: readonly TDynamicSecretProviderDefinitionModule[]
) => {
  const definitions = new Map<DynamicSecretProviders, TRegisteredDynamicSecretProviderDefinition>();
  const moduleIds = new Set<string>();

  modules.forEach((module) => {
    if (moduleIds.has(module.id)) {
      throw new Error(
        `Dynamic-secret provider module "${module.id}" was registered more than once.`
      );
    }
    moduleIds.add(module.id);

    module.definitions.forEach((definition) => {
      if (definitions.has(definition.provider)) {
        throw new Error(
          `Dynamic-secret provider "${definition.provider}" was registered more than once.`
        );
      }
      definitions.set(definition.provider, definition);
    });
  });

  const providers = Object.freeze(
    DYNAMIC_SECRET_PROVIDER_PICKER_ORDER.filter((provider) => definitions.has(provider))
  );
  const registeredDefinitions = Object.freeze(
    providers.map(
      (provider) => definitions.get(provider) as TRegisteredDynamicSecretProviderDefinition
    )
  );

  return Object.freeze({
    providers,
    definitions: registeredDefinitions,
    hasDefinition: (provider: DynamicSecretProviders) => definitions.has(provider),
    getDefinition: (provider: DynamicSecretProviders) => definitions.get(provider),
    requireDefinition: (provider: DynamicSecretProviders) => {
      const definition = definitions.get(provider);
      if (!definition) {
        throw new Error(`Dynamic-secret provider "${provider}" is not registered.`);
      }
      return definition;
    },
    getLabel: (provider: DynamicSecretProviders) => definitions.get(provider)?.label,
    getDocsSlug: (provider: DynamicSecretProviders) =>
      DYNAMIC_SECRET_PROVIDER_DOCS_SLUG[provider] ?? provider
  });
};

export type TDynamicSecretProviderRegistry = ReturnType<typeof createDynamicSecretProviderRegistry>;
