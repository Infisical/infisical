import { SnowflakeProvider } from "@app/ee/services/dynamic-secret/providers/snowflake";

import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";
import { AwsIamProvider } from "./aws-iam";
import { AzureEntraIDProvider } from "./azure-entra-id";
import { AzureSqlDatabaseProvider } from "./azure-sql-database";
import { CassandraProvider } from "./cassandra";
import { CouchbaseProvider } from "./couchbase";
import { ElasticSearchProvider } from "./elastic-search";
import { GcpIamProvider } from "./gcp-iam";
import { GithubProvider } from "./github";
import { KubernetesProvider } from "./kubernetes";
import { LdapProvider } from "./ldap";
import { DynamicSecretProviders, TDynamicProviderFns } from "./models";
import { MongoAtlasProvider } from "./mongo-atlas";
import { MongoDBProvider } from "./mongo-db";
import { RabbitMqProvider } from "./rabbit-mq";
import { RedisDatabaseProvider } from "./redis";
import { SapAseProvider } from "./sap-ase";
import { SapHanaProvider } from "./sap-hana";
import { SqlDatabaseProvider } from "./sql-database";
import { TotpProvider } from "./totp";
import { VerticaProvider } from "./vertica";

type TBuildDynamicSecretProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export const buildDynamicSecretProviders = ({
  gatewayService,
  gatewayV2Service
}: TBuildDynamicSecretProviderDTO): Record<DynamicSecretProviders, TDynamicProviderFns> => ({
  [DynamicSecretProviders.SqlDatabase]: SqlDatabaseProvider({ gatewayService, gatewayV2Service }),
  [DynamicSecretProviders.Cassandra]: CassandraProvider(),
  [DynamicSecretProviders.AwsIam]: AwsIamProvider(),
  [DynamicSecretProviders.Redis]: RedisDatabaseProvider(),
  [DynamicSecretProviders.AwsElastiCache]: AwsElastiCacheDatabaseProvider(),
  [DynamicSecretProviders.MongoAtlas]: MongoAtlasProvider(),
  [DynamicSecretProviders.MongoDB]: MongoDBProvider(),
  [DynamicSecretProviders.ElasticSearch]: ElasticSearchProvider(),
  [DynamicSecretProviders.RabbitMq]: RabbitMqProvider(),
  [DynamicSecretProviders.AzureEntraID]: AzureEntraIDProvider(),
  [DynamicSecretProviders.AzureSqlDatabase]: AzureSqlDatabaseProvider({ gatewayService, gatewayV2Service }),
  [DynamicSecretProviders.Ldap]: LdapProvider(),
  [DynamicSecretProviders.SapHana]: SapHanaProvider(),
  [DynamicSecretProviders.Snowflake]: SnowflakeProvider(),
  [DynamicSecretProviders.Totp]: TotpProvider(),
  [DynamicSecretProviders.SapAse]: SapAseProvider(),
  [DynamicSecretProviders.Kubernetes]: KubernetesProvider({ gatewayService, gatewayV2Service }),
  [DynamicSecretProviders.Vertica]: VerticaProvider({ gatewayService }),
  [DynamicSecretProviders.GcpIam]: GcpIamProvider(),
  [DynamicSecretProviders.Github]: GithubProvider(),
  [DynamicSecretProviders.Couchbase]: CouchbaseProvider()
});
