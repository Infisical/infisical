import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TDynamicSecretProviderDefinition } from "../types";
import { awsIamDynamicSecretProvider } from "./awsIam";
import {
  awsElastiCacheDynamicSecretProvider,
  awsMemoryDbDynamicSecretProvider
} from "./awsManagedStores";
import { azureEntraIdDynamicSecretProvider } from "./azureEntraId";
import { azureSqlDatabaseDynamicSecretProvider } from "./azureSqlDatabase";
import { cassandraDynamicSecretProvider } from "./cassandra";
import { clickHouseDynamicSecretProvider } from "./clickHouse";
import { couchbaseDynamicSecretProvider } from "./couchbase";
import { elasticSearchDynamicSecretProvider } from "./elasticSearch";
import { gcpIamDynamicSecretProvider } from "./gcpIam";
import { githubDynamicSecretProvider } from "./github";
import { ibmApiConnectDynamicSecretProvider } from "./ibmApiConnect";
import { kubernetesDynamicSecretProvider } from "./kubernetes";
import { ldapDynamicSecretProvider } from "./ldap";
import { milvusDynamicSecretProvider } from "./milvus";
import { mongoAtlasDynamicSecretProvider } from "./mongoAtlas";
import { mongoDbDynamicSecretProvider } from "./mongoDb";
import { rabbitMqDynamicSecretProvider } from "./rabbitMq";
import { redisDynamicSecretProvider } from "./redis";
import { sapAseDynamicSecretProvider } from "./sapAse";
import { sapHanaDynamicSecretProvider } from "./sapHana";
import { snowflakeDynamicSecretProvider } from "./snowflake";
import { sqlDatabaseDynamicSecretProvider } from "./sqlDatabase";
import { sshDynamicSecretProvider } from "./ssh";
import { tailscaleDynamicSecretProvider } from "./tailscale";
import { totpDynamicSecretProvider } from "./totp";
import { verticaDynamicSecretProvider } from "./vertica";

// Provider create/edit forms are heterogeneous. The registry erases per-provider
// value types; call sites that need them import the concrete definition.
export type TRegisteredDynamicSecretProviderDefinition = TDynamicSecretProviderDefinition<
  DynamicSecretProviders,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

const DYNAMIC_SECRET_PROVIDER_DEFINITIONS = {
  [DynamicSecretProviders.SqlDatabase]: sqlDatabaseDynamicSecretProvider,
  [DynamicSecretProviders.Cassandra]: cassandraDynamicSecretProvider,
  [DynamicSecretProviders.AwsIam]: awsIamDynamicSecretProvider,
  [DynamicSecretProviders.Redis]: redisDynamicSecretProvider,
  [DynamicSecretProviders.AwsElastiCache]: awsElastiCacheDynamicSecretProvider,
  [DynamicSecretProviders.AwsMemoryDb]: awsMemoryDbDynamicSecretProvider,
  [DynamicSecretProviders.MongoAtlas]: mongoAtlasDynamicSecretProvider,
  [DynamicSecretProviders.ElasticSearch]: elasticSearchDynamicSecretProvider,
  [DynamicSecretProviders.MongoDB]: mongoDbDynamicSecretProvider,
  [DynamicSecretProviders.RabbitMq]: rabbitMqDynamicSecretProvider,
  [DynamicSecretProviders.AzureEntraId]: azureEntraIdDynamicSecretProvider,
  [DynamicSecretProviders.AzureSqlDatabase]: azureSqlDatabaseDynamicSecretProvider,
  [DynamicSecretProviders.Ldap]: ldapDynamicSecretProvider,
  [DynamicSecretProviders.SapHana]: sapHanaDynamicSecretProvider,
  [DynamicSecretProviders.Snowflake]: snowflakeDynamicSecretProvider,
  [DynamicSecretProviders.Totp]: totpDynamicSecretProvider,
  [DynamicSecretProviders.SapAse]: sapAseDynamicSecretProvider,
  [DynamicSecretProviders.Kubernetes]: kubernetesDynamicSecretProvider,
  [DynamicSecretProviders.Vertica]: verticaDynamicSecretProvider,
  [DynamicSecretProviders.GcpIam]: gcpIamDynamicSecretProvider,
  [DynamicSecretProviders.Github]: githubDynamicSecretProvider,
  [DynamicSecretProviders.Couchbase]: couchbaseDynamicSecretProvider,
  [DynamicSecretProviders.Clickhouse]: clickHouseDynamicSecretProvider,
  [DynamicSecretProviders.Milvus]: milvusDynamicSecretProvider,
  [DynamicSecretProviders.Ssh]: sshDynamicSecretProvider,
  [DynamicSecretProviders.IbmApiConnect]: ibmApiConnectDynamicSecretProvider,
  [DynamicSecretProviders.Tailscale]: tailscaleDynamicSecretProvider
} satisfies Record<DynamicSecretProviders, TRegisteredDynamicSecretProviderDefinition>;

/** Docs path segment overrides when the slug differs from the provider enum value. */
const DYNAMIC_SECRET_PROVIDER_DOCS_SLUG: Partial<Record<DynamicSecretProviders, string>> = {
  [DynamicSecretProviders.SqlDatabase]: "postgresql",
  [DynamicSecretProviders.MongoAtlas]: "mongo-atlas"
};

/** Picker display order (product order, not enum order). */
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

export const getDynamicSecretProviderDefinition = (
  provider: DynamicSecretProviders
): TRegisteredDynamicSecretProviderDefinition =>
  DYNAMIC_SECRET_PROVIDER_DEFINITIONS[provider] as TRegisteredDynamicSecretProviderDefinition;

export const getDynamicSecretProviderLabel = (provider: DynamicSecretProviders) =>
  getDynamicSecretProviderDefinition(provider).label;

export const getDynamicSecretProviderDocsSlug = (provider: DynamicSecretProviders) =>
  DYNAMIC_SECRET_PROVIDER_DOCS_SLUG[provider] ?? provider;
