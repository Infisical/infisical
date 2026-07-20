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
  AwsMemoryDb = "aws-memorydb",
  MongoAtlas = "mongo-db-atlas",
  ElasticSearch = "elastic-search",
  MongoDB = "mongo-db",
  RabbitMq = "rabbit-mq",
  AzureEntraId = "azure-entra-id",
  AzureSqlDatabase = "azure-sql-database",
  Ldap = "ldap",
  SapHana = "sap-hana",
  Snowflake = "snowflake",
  Totp = "totp",
  SapAse = "sap-ase",
  Kubernetes = "kubernetes",
  Vertica = "vertica",
  GcpIam = "gcp-iam",
  Github = "github",
  Couchbase = "couchbase",
  Clickhouse = "clickhouse",
  Milvus = "milvus",
  Ssh = "ssh",
  IbmApiConnect = "ibm-api-connect",
  Tailscale = "tailscale"
}

export enum TailscaleKeyAuthType {
  AuthKeys = "auth_keys",
  OAuthKeys = "oauth_keys",
  FederatedKeys = "federated_keys"
}

export enum TailscaleAuthMethod {
  ApiKey = "api_key",
  OAuth = "oauth"
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
  AccessKey = "access-key",
  IRSA = "irsa"
}

// currently the only option, but we may want to extend this later to ACL-based auth
export enum AwsMemoryDbAuthType {
  IAM = "iam"
}

export enum DynamicSecretAwsIamCredentialType {
  IamUser = "iam-user",
  TemporaryCredentials = "temporary-credentials"
}

export const MILVUS_OBJECT_TYPES = [
  { label: "Collection", value: "Collection" },
  { label: "Database", value: "Database" },
  { label: "Global", value: "Global" },
  { label: "Cluster", value: "Cluster" },
  { label: "User", value: "User" }
] as const;

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
            credentialType: DynamicSecretAwsIamCredentialType;
            accessKey: string;
            secretAccessKey: string;
            region: string;
            awsPath?: string;
            policyDocument?: string;
            userGroups?: string;
            policyArns?: string;
            sessionPolicyArns?: string;
            sessionPolicyDocument?: string;
          }
        | {
            method: DynamicSecretAwsIamAuth.AssumeRole;
            credentialType: DynamicSecretAwsIamCredentialType;
            roleArn: string;
            region: string;
            awsPath?: string;
            policyDocument?: string;
            userGroups?: string;
            policyArns?: string;
            sessionPolicyArns?: string;
            sessionPolicyDocument?: string;
          }
        | {
            method: DynamicSecretAwsIamAuth.IRSA;
            credentialType: DynamicSecretAwsIamCredentialType;
            region: string;
            awsPath?: string;
            policyDocument?: string;
            userGroups?: string;
            policyArns?: string;
            sessionPolicyArns?: string;
            sessionPolicyDocument?: string;
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
      type: DynamicSecretProviders.AwsMemoryDb;
      inputs: {
        clusterName: string;
        region: string;
        auth: {
          type: AwsMemoryDbAuthType.IAM;
          accessKeyId: string;
          secretAccessKey: string;
        };
        creationStatement: string;
        revocationStatement: string;
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
      type: DynamicSecretProviders.AzureSqlDatabase;
      inputs: {
        host: string;
        port: number;
        database: string;
        masterDatabase?: string;
        username: string;
        password: string;
        passwordRequirements?: {
          length: number;
          required: {
            lowercase: number;
            uppercase: number;
            digits: number;
            symbols: number;
          };
          allowedSymbols?: string;
        };
        masterCreationStatement: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
        ca?: string;
        sslEnabled?: boolean;
        gatewayId?: string;
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
        tokenScopes: string[];
      };
    }
  | {
      type: DynamicSecretProviders.Github;
      inputs: {
        appId: number;
        installationId: number;
        privateKey: string;
      };
    }
  | {
      type: DynamicSecretProviders.Couchbase;
      inputs: {
        url: string;
        orgId: string;
        projectId: string;
        clusterId: string;
        roles: string[];
        buckets:
          | string
          | Array<{
              name: string;
              scopes?: Array<{
                name: string;
                collections?: string[];
              }>;
            }>;
        passwordRequirements?: {
          length: number;
          required: {
            lowercase: number;
            uppercase: number;
            digits: number;
            symbols: number;
          };
          allowedSymbols?: string;
        };
        auth: {
          apiKey: string;
        };
      };
    }
  | {
      type: DynamicSecretProviders.Clickhouse;
      inputs: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        creationStatement: string;
        revocationStatement: string;
        renewStatement?: string;
        ca?: string;
        gatewayId?: string;
        passwordRequirements?: {
          length: number;
          required: {
            lowercase: number;
            uppercase: number;
            digits: number;
            symbols: number;
          };
          allowedSymbols?: string;
        };
      };
    }
  | {
      type: DynamicSecretProviders.Milvus;
      inputs: {
        host: string;
        port: number;
        username: string;
        password: string;
        database?: string;
        privileges: Array<{
          objectType: string;
          objectName: string;
          privilege: string;
          dbName?: string;
        }>;
        ca?: string;
        sslRejectUnauthorized?: boolean;
        gatewayId?: string | null;
        gatewayPoolId?: string | null;
      };
    }
  | {
      type: DynamicSecretProviders.Ssh;
      inputs: {
        caPublicKey?: string;
        principals: string[];
        keyAlgorithm: string;
      };
    }
  | {
      type: DynamicSecretProviders.IbmApiConnect;
      inputs: {
        clientId: string;
        clientSecret: string;
        instanceUrl: string;
        apiKey: string;
        orgId: string;
        catalogId: string;
        appId: string;
        gatewayId?: string;
        gatewayPoolId?: string;
      };
    }
  | {
      type: DynamicSecretProviders.Tailscale;
      inputs:
        | {
            authType: TailscaleKeyAuthType.AuthKeys;
            auth:
              | { method: TailscaleAuthMethod.ApiKey; apiKey: string }
              | { method: TailscaleAuthMethod.OAuth; clientId: string; clientSecret: string };
            tailnet: string;
            description?: string;
            tags: string[];
            reusable: boolean;
            preauthorized: boolean;
          }
        | {
            authType: TailscaleKeyAuthType.OAuthKeys;
            auth:
              | { method: TailscaleAuthMethod.ApiKey; apiKey: string }
              | { method: TailscaleAuthMethod.OAuth; clientId: string; clientSecret: string };
            tailnet: string;
            description?: string;
            tags: string[];
            scopes: string[];
          }
        | {
            authType: TailscaleKeyAuthType.FederatedKeys;
            auth:
              | { method: TailscaleAuthMethod.ApiKey; apiKey: string }
              | { method: TailscaleAuthMethod.OAuth; clientId: string; clientSecret: string };
            tailnet: string;
            description?: string;
            tags: string[];
            scopes: string[];
            issuer: string;
            subject: string;
            audience?: string;
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
