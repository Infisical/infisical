export enum DynamicSecretStatus {
  Deleting = "Revocation in process",
  FailedDeletion = "Failed to delete"
}
// TODO(akhilmhdh): When we switch to monorepo all the server api ts will be in a shared repo
export type TDynamicSecret = {
  id: string;
  name: string;
  type: DynamicSecretProviders;
  createdAt: string;
  updatedAt: string;
  defaultTTL: string;
  status?: DynamicSecretStatus;
  statusDetails?: string;
  maxTTL: string;
};

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database",
  Cassandra = "cassandra",
  AwsIam = "aws-iam",
  Redis = "redis",
  AwsElastiCache = "aws-elasticache",
  MongoAtlas = "mongo-db-atlas",
  ElasticSearch = "elastic-search",
  MongoDB = "mongo-db",
  RabbitMq = "rabbit-mq",
  AzureEntraId = "azure-entra-id",
  Ldap = "ldap"
}

export enum SqlProviders {
  Postgres = "postgres",
  MySql = "mysql2",
  Oracle = "oracledb",
  MsSQL = "mssql"
}

export type TDynamicSecretProvider =
  | {
      type: DynamicSecretProviders.SqlDatabase;
      inputs: {
        client: SqlProviders;
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
        ca?: string | undefined;
      };
    }
  | {
      type: DynamicSecretProviders.Cassandra;
      inputs: {
        host: string;
        port: number;
        keyspace?: string;
        localDataCenter: string;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
        ca?: string | undefined;
      };
    }
  | {
      type: DynamicSecretProviders.AwsIam;
      inputs: {
        accessKey: string;
        secretAccessKey: string;
        region: string;
        awsPath?: string;
        policyDocument?: string;
        userGroups?: string;
        policyArns?: string;
      };
    }
  | {
      type: DynamicSecretProviders.Redis;
      inputs: {
        host: string;
        port: number;
        username: string;
        password?: string;
        creationStatement: string;
        renewStatement?: string;
        revocationStatement: string;
        ca?: string | undefined;
      };
    }
  | {
      type: DynamicSecretProviders.AwsElastiCache;
      inputs: {
        clusterName: string;
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        creationStatement: string;
        revocationStatement: string;
        ca?: string | undefined;
      };
    }
  | {
      type: DynamicSecretProviders.MongoAtlas;
      inputs: {
        adminPublicKey: string;
        adminPrivateKey: string;
        groupId: string;
        roles: {
          databaseName: string;
          roleName: string;
          collectionName?: string;
        }[];
        scopes?: {
          name: string;
          type: string;
        }[];
      };
    }
  | {
      type: DynamicSecretProviders.MongoDB;
      inputs: {
        host: string;
        port?: number;
        database: string;
        username: string;
        password: string;
        ca?: string | undefined;
        roles: (
          | {
              databaseName: string;
              roleName: string;
            }
          | string
        )[];
      };
    }
  | {
      type: DynamicSecretProviders.ElasticSearch;
      inputs: {
        host: string;
        port: number;
        ca?: string | undefined;
        roles: string[];
        auth:
          | {
              type: "user";
              username: string;
              password: string;
            }
          | {
              type: "api-key";
              apiKey: string;
              apiKeyId: string;
            };
      };
    }
  | {
      type: DynamicSecretProviders.RabbitMq;
      inputs: {
        host: string;
        port: number;

        username: string;
        password: string;

        tags: string[];
        virtualHost: {
          name: string;
          permissions: {
            configure: string;
            write: string;
            read: string;
          };
        };
        ca?: string;
      };
    }
  | {
      type: DynamicSecretProviders.AzureEntraId;
      inputs: {
        tenantId: string;
        userId: string;
        email: string;
        applicationId: string;
        clientSecret: string;
      };
  }
  | {
      type: DynamicSecretProviders.Ldap;
      inputs: {
        url: string;
        binddn: string;
        bindpass: string;
        ca?: string | undefined;
        creationLdif: string;
        revocationLdif: string;
        rollbackLdif?: string;
      };
    };
  ;

export type TCreateDynamicSecretDTO = {
  projectSlug: string;
  provider: TDynamicSecretProvider;
  defaultTTL: string;
  maxTTL?: string;
  path: string;
  environmentSlug: string;
  name: string;
};

export type TUpdateDynamicSecretDTO = {
  name: string;
  projectSlug: string;
  path: string;
  environmentSlug: string;
  data: {
    newName?: string;
    defaultTTL?: string;
    maxTTL?: string | null;
    inputs?: unknown;
  };
};

export type TListDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environmentSlug: string;
};

export type TDeleteDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environmentSlug: string;
  name: string;
  isForced?: boolean;
};

export type TDetailsDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environmentSlug: string;
  name: string;
};

export type TGetDynamicSecretsByEnvsDTO = {
  projectSlug: string;
  path: string;
  environmentSlugs: string[];
};
