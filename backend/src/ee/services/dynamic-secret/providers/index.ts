import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";
import { AwsIamProvider } from "./aws-iam";
import { CassandraProvider } from "./cassandra";
import { DynamicSecretProviders } from "./models";
import { MongoAtlasProvider } from "./mongo-atlas";
import { RedisDatabaseProvider } from "./redis";
import { SqlDatabaseProvider } from "./sql-database";

export const buildDynamicSecretProviders = () => ({
  [DynamicSecretProviders.SqlDatabase]: SqlDatabaseProvider(),
  [DynamicSecretProviders.Cassandra]: CassandraProvider(),
  [DynamicSecretProviders.AwsIam]: AwsIamProvider(),
  [DynamicSecretProviders.Redis]: RedisDatabaseProvider(),
  [DynamicSecretProviders.AwsElastiCache]: AwsElastiCacheDatabaseProvider(),
  [DynamicSecretProviders.MongoAtlas]: MongoAtlasProvider()
});
