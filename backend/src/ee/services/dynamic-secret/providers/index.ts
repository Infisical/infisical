import { SnowflakeProvider } from "@app/ee/services/dynamic-secret/providers/snowflake";

import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "../../gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";
import { AwsIamProvider } from "./aws-iam";
import { AwsMemoryDbDatabaseProvider } from "./aws-memorydb";
import { AzureEntraIDProvider } from "./azure-entra-id";
import { AzureSqlDatabaseProvider } from "./azure-sql-database";
import { CassandraProvider } from "./cassandra";
import { ClickhouseProvider } from "./clickhouse";
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
import { SshProvider } from "./ssh";
import { TotpProvider } from "./totp";
import { VerticaProvider } from "./vertica";

type TBuildDynamicSecretProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export const buildDynamicSecretProviders = ({
  gatewayService,
  gatewayV2Service,
  gatewayPoolService
}: TBuildDynamicSecretProviderDTO): Record<DynamicSecretProviders, TDynamicProviderFns> => ({
  [DynamicSecretProviders.SqlDatabase]: SqlDatabaseProvider({ gatewayService, gatewayV2Service, gatewayPoolService }),
  [DynamicSecretProviders.Clickhouse]: ClickhouseProvider({ gatewayService, gatewayV2Service, gatewayPoolService }),
  [DynamicSecretProviders.Cassandra]: CassandraProvider(),
  [DynamicSecretProviders.AwsIam]: AwsIamProvider(),
  [DynamicSecretProviders.Redis]: RedisDatabaseProvider(),
  [DynamicSecretProviders.AwsElastiCache]: AwsElastiCacheDatabaseProvider(),
  [DynamicSecretProviders.AwsMemoryDb]: AwsMemoryDbDatabaseProvider(),
  [DynamicSecretProviders.MongoAtlas]: MongoAtlasProvider(),
  [DynamicSecretProviders.MongoDB]: MongoDBProvider(),
  [DynamicSecretProviders.ElasticSearch]: ElasticSearchProvider(),
  [DynamicSecretProviders.RabbitMq]: RabbitMqProvider(),
  [DynamicSecretProviders.AzureEntraID]: AzureEntraIDProvider(),
  [DynamicSecretProviders.AzureSqlDatabase]: AzureSqlDatabaseProvider({
    gatewayService,
    gatewayV2Service,
    gatewayPoolService
  }),
  [DynamicSecretProviders.Ldap]: LdapProvider(),
  [DynamicSecretProviders.SapHana]: SapHanaProvider(),
  [DynamicSecretProviders.Snowflake]: SnowflakeProvider(),
  [DynamicSecretProviders.Totp]: TotpProvider(),
  [DynamicSecretProviders.SapAse]: SapAseProvider(),
  [DynamicSecretProviders.Kubernetes]: KubernetesProvider({ gatewayService, gatewayV2Service, gatewayPoolService }),
  [DynamicSecretProviders.Vertica]: VerticaProvider({ gatewayService, gatewayV2Service, gatewayPoolService }),
  [DynamicSecretProviders.GcpIam]: GcpIamProvider(),
  [DynamicSecretProviders.Github]: GithubProvider(),
  [DynamicSecretProviders.Couchbase]: CouchbaseProvider(),
  [DynamicSecretProviders.Ssh]: SshProvider()
});
