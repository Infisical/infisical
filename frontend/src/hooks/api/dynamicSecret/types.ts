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
  maxTTL?: string;
  usernameTemplate?: string | null;
  metadata?: { key: string; value: string }[];
  tags?: { key: string; value: string }[];
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
  Ldap = "ldap",
  SapHana = "sap-hana",
  Snowflake = "snowflake",
  Totp = "totp",
  SapAse = "sap-ase",
  Kubernetes = "kubernetes",
  Vertica = "vertica",
  GcpIam = "gcp-iam",
  Github = "github"
}

export enum KubernetesDynamicSecretCredentialType {
  Static = "static",
  Dynamic = "dynamic"
}

export enum SqlProviders {
  Postgres = "postgres",
  MySql = "mysql2",
  Oracle = "oracledb",
  MsSQL = "mssql"
}

export enum DynamicSecretAwsIamAuth {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
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
        gatewayId?: string;
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
      tags?: { key: string; value: string }[];
      inputs:
        | {
            method: DynamicSecretAwsIamAuth.AccessKey;
            accessKey: string;
            secretAccessKey: string;
            region: string;
            awsPath?: string;
            policyDocument?: string;
            userGroups?: string;
            policyArns?: string;
          }
        | {
            method: DynamicSecretAwsIamAuth.AssumeRole;
            roleArn: string;
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
        credentialType: string;
        creationLdif?: string;
        revocationLdif?: string;
        rollbackLdif?: string;
        rotationLdif?: string;
      };
    }
  | {
      type: DynamicSecretProviders.SapHana;
      inputs: {
        host: string;
        port: number;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
        ca?: string | undefined;
      };
    }
  | {
      type: DynamicSecretProviders.SapAse;
      inputs: {
        host: string;
        port: number;
        username: string;
        database: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
      };
    }
  | {
      type: DynamicSecretProviders.Snowflake;
      inputs: {
        orgId: string;
        accountId: string;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
      };
    }
  | {
      type: DynamicSecretProviders.Totp;
      inputs:
        | {
            configType: "url";
            url: string;
          }
        | {
            configType: "manual";
            secret: string;
            period?: number;
            algorithm?: string;
            digits?: number;
          };
    }
  | {
      type: DynamicSecretProviders.Kubernetes;
      inputs:
        | {
            url?: string;
            clusterToken?: string;
            ca?: string;
            serviceAccountName: string;
            credentialType: KubernetesDynamicSecretCredentialType.Static;
            namespace: string;
            gatewayId?: string;
            sslEnabled: boolean;
            audiences: string[];
            authMethod: string;
          }
        | {
            url?: string;
            clusterToken?: string;
            ca?: string;
            credentialType: KubernetesDynamicSecretCredentialType.Dynamic;
            namespace: string;
            gatewayId?: string;
            sslEnabled: boolean;
            audiences: string[];
            roleType: string;
            role: string;
            authMethod: string;
          };
    }
  | {
      type: DynamicSecretProviders.Vertica;
      inputs: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
      };
    }
  | {
      type: DynamicSecretProviders.GcpIam;
      inputs: {
        serviceAccountEmail: string;
      };
    }
  | {
      type: DynamicSecretProviders.Github;
      inputs: {
        appId: number;
        installationId: number;
        privateKey: string;
      };
    };

export type TCreateDynamicSecretDTO = {
  projectSlug: string;
  provider: TDynamicSecretProvider;
  defaultTTL: string;
  maxTTL?: string;
  path: string;
  environmentSlug: string;
  name: string;
  metadata?: { key: string; value: string }[];
  usernameTemplate?: string;
  tags?: { key: string; value: string }[];
};

export type TUpdateDynamicSecretDTO = {
  name: string;
  projectSlug: string;
  path: string;
  environmentSlug: string;
  data: {
    newName?: string;
    metadata?: { key: string; value: string }[];
    defaultTTL?: string;
    maxTTL?: string | null;
    inputs?: unknown;
    usernameTemplate?: string | null;
    tags?: { key: string; value: string }[];
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
