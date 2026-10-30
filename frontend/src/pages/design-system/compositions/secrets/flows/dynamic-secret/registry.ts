import { DYNAMIC_SECRET_PROVIDER_PICKER_ORDER } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/registry";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { awsElastiCacheFlowProvider } from "./providers/aws-elasticache";
import { awsIamFlowProvider } from "./providers/aws-iam";
import { awsMemoryDbFlowProvider } from "./providers/aws-memorydb";
import { azureEntraIdFlowProvider } from "./providers/azure-entra-id";
import { azureSqlDatabaseFlowProvider } from "./providers/azure-sql-database";
import { cassandraFlowProvider } from "./providers/cassandra";
import { clickHouseFlowProvider } from "./providers/clickhouse";
import { couchbaseFlowProvider } from "./providers/couchbase";
import { elasticSearchFlowProvider } from "./providers/elastic-search";
import { gcpIamFlowProvider } from "./providers/gcp-iam";
import { githubFlowProvider } from "./providers/github";
import { ibmApiConnectFlowProvider } from "./providers/ibm-api-connect";
import { kafkaFlowProvider } from "./providers/kafka";
import { kubernetesFlowProvider } from "./providers/kubernetes";
import { ldapFlowProvider } from "./providers/ldap";
import { milvusFlowProvider } from "./providers/milvus";
import { mongoAtlasFlowProvider } from "./providers/mongo-atlas";
import { mongoDbFlowProvider } from "./providers/mongo-db";
import { oauth2FlowProvider } from "./providers/oauth2";
import { rabbitMqFlowProvider } from "./providers/rabbit-mq";
import { redisFlowProvider } from "./providers/redis";
import { sapAseFlowProvider } from "./providers/sap-ase";
import { sapHanaFlowProvider } from "./providers/sap-hana";
import { snowflakeFlowProvider } from "./providers/snowflake";
import { sqlDatabaseFlowProvider } from "./providers/sql-database";
import { sshFlowProvider } from "./providers/ssh";
import { tailscaleFlowProvider } from "./providers/tailscale";
import { totpFlowProvider } from "./providers/totp";
import { verticaFlowProvider } from "./providers/vertica";
import type { DynamicSecretFlowProvider } from "./types";

const definitions = new Map<DynamicSecretProviders, DynamicSecretFlowProvider>(
  [
    sqlDatabaseFlowProvider,
    cassandraFlowProvider,
    redisFlowProvider,
    awsElastiCacheFlowProvider,
    awsMemoryDbFlowProvider,
    awsIamFlowProvider,
    mongoAtlasFlowProvider,
    mongoDbFlowProvider,
    elasticSearchFlowProvider,
    rabbitMqFlowProvider,
    azureEntraIdFlowProvider,
    azureSqlDatabaseFlowProvider,
    ldapFlowProvider,
    sapHanaFlowProvider,
    sapAseFlowProvider,
    snowflakeFlowProvider,
    totpFlowProvider,
    verticaFlowProvider,
    kubernetesFlowProvider,
    gcpIamFlowProvider,
    githubFlowProvider,
    couchbaseFlowProvider,
    milvusFlowProvider,
    clickHouseFlowProvider,
    sshFlowProvider,
    ibmApiConnectFlowProvider,
    tailscaleFlowProvider,
    oauth2FlowProvider,
    kafkaFlowProvider
  ].map((definition) => [definition.provider, definition])
);

export const dynamicSecretFlowProviders = DYNAMIC_SECRET_PROVIDER_PICKER_ORDER.flatMap(
  (provider) => {
    const definition = definitions.get(provider);
    return definition ? [definition] : [];
  }
);

const DOCS_SLUG: Partial<Record<DynamicSecretProviders, string>> = {
  [DynamicSecretProviders.SqlDatabase]: "postgresql",
  [DynamicSecretProviders.MongoAtlas]: "mongo-atlas"
};

export const dynamicSecretDocsSlug = (provider: DynamicSecretProviders) =>
  DOCS_SLUG[provider] ?? provider;
