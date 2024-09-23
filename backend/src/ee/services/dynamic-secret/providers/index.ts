import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";
import { AwsIamProvider } from "./aws-iam";
import { AzureEntraIDProvider } from "./azure-entra-id";
import { CassandraProvider } from "./cassandra";
import { ElasticSearchProvider } from "./elastic-search";
import { DynamicSecretProviders } from "./models";
import { MongoAtlasProvider } from "./mongo-atlas";
import { MongoDBProvider } from "./mongo-db";
import { RabbitMqProvider } from "./rabbit-mq";
import { RedisDatabaseProvider } from "./redis";
import { SqlDatabaseProvider } from "./sql-database";

export const buildDynamicSecretProviders = () => ({
  [DynamicSecretProviders.SqlDatabase]: SqlDatabaseProvider(),
  [DynamicSecretProviders.Cassandra]: CassandraProvider(),
  [DynamicSecretProviders.AwsIam]: AwsIamProvider(),
  [DynamicSecretProviders.Redis]: RedisDatabaseProvider(),
  [DynamicSecretProviders.AwsElastiCache]: AwsElastiCacheDatabaseProvider(),
  [DynamicSecretProviders.MongoAtlas]: MongoAtlasProvider(),
  [DynamicSecretProviders.MongoDB]: MongoDBProvider(),
  [DynamicSecretProviders.ElasticSearch]: ElasticSearchProvider(),
  [DynamicSecretProviders.RabbitMq]: RabbitMqProvider(),
  [DynamicSecretProviders.AzureEntraID]: AzureEntraIDProvider()
});
