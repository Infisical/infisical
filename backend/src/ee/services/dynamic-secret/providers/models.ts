import RE2 from "re2";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { TConstraint } from "@app/services/secret-validation-rule/secret-validation-rule-types";

import {
  ActorIdentityAttributes,
  TDynamicSecretLeaseConfig
} from "../../dynamic-secret-lease/dynamic-secret-lease-types";

export type PasswordRequirements = {
  length: number;
  required: {
    lowercase: number;
    uppercase: number;
    digits: number;
    symbols: number;
  };
  allowedSymbols?: string;
};

export enum SqlProviders {
  Postgres = "postgres",
  MySQL = "mysql2",
  Oracle = "oracledb",
  MsSQL = "mssql",
  SapAse = "sap-ase",
  Vertica = "vertica"
}

export enum AwsIamAuthType {
  AssumeRole = "assume-role",
  AccessKey = "access-key",
  IRSA = "irsa"
}

export enum AwsIamCredentialType {
  IamUser = "iam-user",
  TemporaryCredentials = "temporary-credentials"
}

export enum ElasticSearchAuthTypes {
  User = "user",
  ApiKey = "api-key"
}

export enum LdapCredentialType {
  Dynamic = "dynamic",
  Static = "static"
}

export enum KubernetesCredentialType {
  Static = "static",
  Dynamic = "dynamic"
}

export enum KubernetesRoleType {
  ClusterRole = "cluster-role",
  Role = "role"
}

export enum KubernetesAuthMethod {
  Gateway = "gateway",
  Api = "api"
}

export enum TotpConfigType {
  URL = "url",
  MANUAL = "manual"
}

export enum TotpAlgorithm {
  SHA1 = "sha1",
  SHA256 = "sha256",
  SHA512 = "sha512"
}

export const DynamicSecretRedisDBSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  username: z.string().trim(), // this is often "default".
  password: z.string().trim().optional(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const DynamicSecretAwsElastiCacheSchema = z.object({
  clusterName: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),

  region: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim()
});

export enum AwsMemoryDbAuthType {
  IAM = "iam"
}

export const DynamicSecretAwsMemoryDbSchema = z.object({
  clusterName: z.string().trim().min(1),
  auth: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(AwsMemoryDbAuthType.IAM),
      accessKeyId: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1)
    })
  ]),
  region: z.string().trim().min(1),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim()
});

export const DynamicSecretElasticSearchSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number(),
  roles: z.array(z.string().trim().min(1)).min(1),

  // two auth types "user, apikey"
  auth: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(ElasticSearchAuthTypes.User),
      username: z.string().trim(),
      password: z.string().trim()
    }),
    z.object({
      type: z.literal(ElasticSearchAuthTypes.ApiKey),
      apiKey: z.string().trim(),
      apiKeyId: z.string().trim()
    })
  ]),

  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const DynamicSecretRabbitMqSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number(),
  tags: z.array(z.string().trim()).default([]),

  username: z.string().trim().min(1),
  password: z.string().trim().min(1),

  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),

  virtualHost: z.object({
    name: z.string().trim().min(1),
    permissions: z.object({
      read: z.string().trim().min(1),
      write: z.string().trim().min(1),
      configure: z.string().trim().min(1)
    })
  })
});

export const DynamicSecretSqlDBSchema = z.object({
  client: z.nativeEnum(SqlProviders),
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  database: z.string().trim(),
  username: z.string().trim(),
  password: z.string().trim(),
  passwordRequirements: z
    .object({
      length: z.number().min(1).max(250),
      required: z
        .object({
          lowercase: z.number().min(0),
          uppercase: z.number().min(0),
          digits: z.number().min(0),
          symbols: z.number().min(0)
        })
        .refine((data) => {
          const total = Object.values(data).reduce((sum, count) => sum + count, 0);
          return total <= 250;
        }, "Sum of required characters cannot exceed 250"),
      allowedSymbols: z.string().optional()
    })
    .refine((data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    }, "Sum of required characters cannot exceed the total length")
    .optional()
    .describe("Password generation requirements"),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  sslEnabled: z.boolean().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

export const DynamicSecretClickhouseSchema = z.object({
  host: z.string().trim(),
  port: z.number(),
  database: z.string().trim(),
  username: z.string().trim(),
  password: z.string().trim(),
  passwordRequirements: z
    .object({
      length: z.number().min(1).max(250),
      required: z
        .object({
          lowercase: z.number().min(0),
          uppercase: z.number().min(0),
          digits: z.number().min(0),
          symbols: z.number().min(0)
        })
        .refine((data) => {
          const total = Object.values(data).reduce((sum, count) => sum + count, 0);
          return total <= 250;
        }, "Sum of required characters cannot exceed 250"),
      allowedSymbols: z.string().optional()
    })
    .refine((data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    }, "Sum of required characters cannot exceed the total length")
    .optional()
    .describe("Password generation requirements"),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

export const DynamicSecretCassandraSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  localDataCenter: z.string().trim().min(1),
  keyspace: z.string().trim().optional(),
  username: z.string().trim(),
  password: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const DynamicSecretSapAseSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  database: z.string().trim(),
  username: z.string().trim(),
  password: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim()
});

export const DynamicSecretAwsIamSchema = z.preprocess(
  (val) => {
    if (typeof val === "object" && val !== null && !Object.hasOwn(val, "method")) {
      // eslint-disable-next-line no-param-reassign
      (val as { method: string }).method = AwsIamAuthType.AccessKey;
    }
    return val;
  },
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AwsIamAuthType.AccessKey),
      credentialType: z.nativeEnum(AwsIamCredentialType).default(AwsIamCredentialType.IamUser),
      accessKey: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional(),
      tags: ResourceMetadataNonEncryptionSchema.optional()
    }),
    z.object({
      method: z.literal(AwsIamAuthType.AssumeRole),
      credentialType: z.nativeEnum(AwsIamCredentialType).default(AwsIamCredentialType.IamUser),
      roleArn: z.string().trim().min(1, "Role ARN required"),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional(),
      tags: ResourceMetadataNonEncryptionSchema.optional()
    }),
    z.object({
      method: z.literal(AwsIamAuthType.IRSA),
      credentialType: z.nativeEnum(AwsIamCredentialType).default(AwsIamCredentialType.IamUser),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional(),
      tags: ResourceMetadataNonEncryptionSchema.optional()
    })
  ])
);

export const DynamicSecretMongoAtlasSchema = z.object({
  adminPublicKey: z.string().trim().min(1).describe("Admin user public api key"),
  adminPrivateKey: z.string().trim().min(1).describe("Admin user private api key"),
  groupId: z
    .string()
    .trim()
    .min(1)
    .describe("Unique 24-hexadecimal digit string that identifies your project. This is same as project id"),
  roles: z
    .object({
      collectionName: z.string().optional().describe("Collection on which this role applies."),
      databaseName: z.string().min(1).describe("Database to which the user is granted access privileges."),
      roleName: z
        .string()
        .min(1)
        .describe(
          ' Enum: "atlasAdmin" "backup" "clusterMonitor" "dbAdmin" "dbAdminAnyDatabase" "enableSharding" "read" "readAnyDatabase" "readWrite" "readWriteAnyDatabase" "<a custom role name>".Human-readable label that identifies a group of privileges assigned to a database user. This value can either be a built-in role or a custom role.'
        )
    })
    .array()
    .min(1),
  scopes: z
    .object({
      name: z
        .string()
        .min(1)
        .describe(
          "Human-readable label that identifies the cluster or MongoDB Atlas Data Lake that this database user can access."
        ),
      type: z
        .string()
        .min(1)
        .describe("Category of resource that this database user can access. Enum: CLUSTER, DATA_LAKE, STREAM")
    })
    .array()
});

export const DynamicSecretMongoDBSchema = z.object({
  host: z.string().min(1).trim().toLowerCase(),
  port: z.number().optional().nullable(),
  username: z.string().min(1).trim(),
  password: z.string().min(1).trim(),
  database: z.string().min(1).trim(),
  ca: z.string().trim().optional().nullable(),
  sslRejectUnauthorized: z.boolean().default(true),
  roles: z
    .string()
    .array()
    .min(1)
    .describe(
      'Enum: "atlasAdmin" "backup" "clusterMonitor" "dbAdmin" "dbAdminAnyDatabase" "enableSharding" "read" "readAnyDatabase" "readWrite" "readWriteAnyDatabase" "<a custom role name>".Human-readable label that identifies a group of privileges assigned to a database user. This value can either be a built-in role or a custom role.'
    )
});

export const DynamicSecretSapHanaSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  username: z.string().trim(),
  password: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const DynamicSecretSnowflakeSchema = z.object({
  accountId: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  creationStatement: z.string().trim().min(1),
  revocationStatement: z.string().trim().min(1),
  renewStatement: z.string().trim().optional()
});

export const AzureEntraIDSchema = z.object({
  tenantId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  email: z.string().trim().min(1),
  applicationId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1)
});

export const DynamicSecretAzureSqlDBSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  database: z.string().trim(),
  masterDatabase: z.string().trim().optional().default("master"),
  username: z.string().trim(),
  password: z.string().trim(),
  passwordRequirements: z
    .object({
      length: z.number().min(1).max(250),
      required: z
        .object({
          lowercase: z.number().min(0),
          uppercase: z.number().min(0),
          digits: z.number().min(0),
          symbols: z.number().min(0)
        })
        .refine((data) => {
          const total = Object.values(data).reduce((sum, count) => sum + count, 0);
          return total <= 250;
        }, "Sum of required characters cannot exceed 250"),
      allowedSymbols: z.string().optional()
    })
    .refine((data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    }, "Sum of required characters cannot exceed the total length")
    .optional()
    .describe("Password generation requirements"),
  masterCreationStatement: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional(),
  sslEnabled: z.boolean().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

export const LdapSchema = z.union([
  z.object({
    url: z.string().trim().min(1),
    binddn: z.string().trim().min(1),
    bindpass: z.string().trim().min(1),
    ca: z.string().optional(),
    sslRejectUnauthorized: z.boolean().default(true),
    credentialType: z.literal(LdapCredentialType.Dynamic).optional().default(LdapCredentialType.Dynamic),
    creationLdif: z.string().min(1),
    revocationLdif: z.string().min(1),
    rollbackLdif: z.string().optional()
  }),
  z.object({
    url: z.string().trim().min(1),
    binddn: z.string().trim().min(1),
    bindpass: z.string().trim().min(1),
    ca: z.string().optional(),
    sslRejectUnauthorized: z.boolean().default(true),
    credentialType: z.literal(LdapCredentialType.Static),
    rotationLdif: z.string().min(1)
  })
]);

export const DynamicSecretKubernetesSchema = z
  .discriminatedUnion("credentialType", [
    z.object({
      url: z
        .string()
        .optional()
        .refine((val: string | undefined) => !val || new RE2(/^https?:\/\/.+/).test(val), {
          message: "Invalid URL. Must start with http:// or https:// (e.g. https://example.com)"
        }),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      credentialType: z.literal(KubernetesCredentialType.Static),
      serviceAccountName: z.string().trim().min(1),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine((val) => !val.includes(","), "Namespace must be a single value, not a comma-separated list")
        .refine(
          (val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val),
          "Invalid namespace format"
        ),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable(),
      audiences: z.array(z.string().trim().min(1)),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    }),
    z.object({
      url: z
        .string()
        .url()
        .optional()
        .refine((val: string | undefined) => !val || new RE2(/^https?:\/\/.+/).test(val), {
          message: "Invalid URL. Must start with http:// or https:// (e.g. https://example.com)"
        }),
      clusterToken: z.string().trim().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      credentialType: z.literal(KubernetesCredentialType.Dynamic),
      namespace: z
        .string()
        .trim()
        .min(1)
        .refine((val) => {
          const namespaces = val.split(",").map((ns) => ns.trim());
          return (
            namespaces.length > 0 &&
            namespaces.every((ns) => ns.length > 0) &&
            namespaces.every((ns) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(ns))
          );
        }, "Must be a valid comma-separated list of namespace values"),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable(),
      audiences: z.array(z.string().trim().min(1)),
      roleType: z.nativeEnum(KubernetesRoleType),
      role: z.string().trim().min(1),
      authMethod: z.nativeEnum(KubernetesAuthMethod).default(KubernetesAuthMethod.Api)
    })
  ])
  .superRefine((data, ctx) => {
    if (data.gatewayId && data.gatewayPoolId) {
      ctx.addIssue({
        path: ["gatewayPoolId"],
        code: z.ZodIssueCode.custom,
        message: "Cannot specify both a gateway and a gateway pool"
      });
    }
    if (data.authMethod === KubernetesAuthMethod.Gateway && !data.gatewayId && !data.gatewayPoolId) {
      ctx.addIssue({
        path: ["gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When auth method is set to Gateway, a gateway or gateway pool must be selected"
      });
    }
    if (data.authMethod === KubernetesAuthMethod.Api || !data.authMethod) {
      if (!data.clusterToken) {
        ctx.addIssue({
          path: ["clusterToken"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster token must be provided"
        });
      }
      if (!data.url) {
        ctx.addIssue({
          path: ["url"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster URL must be provided"
        });
      }
    }
  });

export const DynamicSecretVerticaSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  username: z.string().trim(),
  password: z.string().trim(),
  database: z.string().trim(),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  passwordRequirements: z
    .object({
      length: z.number().min(1).max(250),
      required: z
        .object({
          lowercase: z.number().min(0),
          uppercase: z.number().min(0),
          digits: z.number().min(0),
          symbols: z.number().min(0)
        })
        .refine((data) => {
          const total = Object.values(data).reduce((sum, count) => sum + count, 0);
          return total <= 250;
        }, "Sum of required characters cannot exceed 250"),
      allowedSymbols: z.string().optional()
    })
    .refine((data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    }, "Sum of required characters cannot exceed the total length")
    .optional()
    .describe("Password generation requirements")
});

export const DynamicSecretTotpSchema = z.discriminatedUnion("configType", [
  z.object({
    configType: z.literal(TotpConfigType.URL),
    url: z
      .string()
      .url()
      .trim()
      .min(1)
      .refine((val) => {
        const urlObj = new URL(val);
        const secret = urlObj.searchParams.get("secret");

        return Boolean(secret);
      }, "OTP URL must contain secret field")
  }),
  z.object({
    configType: z.literal(TotpConfigType.MANUAL),
    secret: z
      .string()
      .trim()
      .min(1)
      .transform((val) => val.replace(/\s+/g, "")),
    period: z.number().optional(),
    algorithm: z.nativeEnum(TotpAlgorithm).optional(),
    digits: z.number().optional()
  })
]);

export const DynamicSecretGcpIamSchema = z.object({
  serviceAccountEmail: z.string().email().trim().min(1, "Service account email required").max(128),
  tokenScopes: z
    .array(z.string().trim().min(1))
    .min(1, "At least one scope is required")
    .default(["https://www.googleapis.com/auth/iam", "https://www.googleapis.com/auth/cloud-platform"])
    .describe("OAuth scopes for the generated access token.")
});

export const DynamicSecretGithubSchema = z.object({
  appId: z.number().min(1).describe("The ID of your GitHub App."),
  installationId: z.number().min(1).describe("The ID of the GitHub App installation."),
  privateKey: z
    .string()
    .trim()
    .min(1)
    .refine(
      (val) =>
        new RE2(
          /^-----BEGIN(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----\s*[\s\S]*?-----END(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----$/
        ).test(val),
      "Invalid PEM format for private key"
    )
    .describe("The private key generated for your GitHub App.")
});

export const DynamicSecretCouchbaseSchema = z.object({
  url: z.string().url().trim().min(1).describe("Couchbase Cloud API URL"),
  orgId: z.string().trim().min(1).describe("Organization ID"),
  projectId: z.string().trim().min(1).describe("Project ID"),
  clusterId: z.string().trim().min(1).describe("Cluster ID"),
  roles: z.array(z.string().trim().min(1)).min(1).describe("Roles to assign to the user"),
  buckets: z
    .union([
      z
        .string()
        .trim()
        .min(1)
        .default("*")
        .refine((val) => {
          if (val.includes(",")) {
            const buckets = val
              .split(",")
              .map((b) => b.trim())
              .filter((b) => b.length > 0);
            if (buckets.includes("*") && buckets.length > 1) {
              return false;
            }
          }
          return true;
        }, "Cannot combine '*' with other bucket names"),
      z
        .array(
          z.object({
            name: z.string().trim().min(1).describe("Bucket name"),
            scopes: z
              .array(
                z.object({
                  name: z.string().trim().min(1).describe("Scope name"),
                  collections: z.array(z.string().trim().min(1)).optional().describe("Collection names")
                })
              )
              .optional()
              .describe("Scopes within the bucket")
          })
        )
        .refine((buckets) => {
          const hasWildcard = buckets.some((bucket) => bucket.name === "*");
          if (hasWildcard && buckets.length > 1) {
            return false;
          }
          return true;
        }, "Cannot combine '*' bucket with other buckets")
    ])
    .default("*")
    .describe(
      "Bucket configuration: '*' for all buckets, scopes, and collections or array of bucket objects with specific scopes and collections"
    ),
  passwordRequirements: z
    .object({
      length: z.number().min(8, "Password must be at least 8 characters").max(128),
      required: z
        .object({
          lowercase: z.number().min(1, "At least 1 lowercase character required"),
          uppercase: z.number().min(1, "At least 1 uppercase character required"),
          digits: z.number().min(1, "At least 1 digit required"),
          symbols: z.number().min(1, "At least 1 special character required")
        })
        .refine((data) => {
          const total = Object.values(data).reduce((sum, count) => sum + count, 0);
          return total <= 128;
        }, "Sum of required characters cannot exceed 128"),
      allowedSymbols: z
        .string()
        .refine((symbols) => {
          const forbiddenChars = ["<", ">", ";", ".", "*", "&", "|", "£"];
          return !forbiddenChars.some((char) => symbols?.includes(char));
        }, "Cannot contain: < > ; . * & | £")
        .optional()
    })
    .refine((data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    }, "Sum of required characters cannot exceed the total length")
    .optional()
    .describe("Password generation requirements for Couchbase"),
  auth: z.object({
    apiKey: z.string().trim().min(1).describe("Couchbase Cloud API Key")
  })
});

export const DynamicSecretMilvusSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Milvus endpoint host; uses https when the host includes https:// or a CA is provided, http when the host includes http://, otherwise http (e.g. localhost)."
    ),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1).describe("Admin username used to manage Milvus users and roles"),
  password: z.string().trim().min(1).describe("Admin password used to manage Milvus users and roles"),
  database: z.string().trim().min(1).default("default").describe("Default Milvus database used for privilege grants"),
  privileges: z
    .array(
      z.object({
        objectType: z
          .string()
          .trim()
          .min(1)
          .describe('Milvus object type (e.g. "Collection", "Database", "Global", "User", "Cluster")'),
        objectName: z.string().trim().min(1).default("*").describe('Name of the target object, or "*" to apply to all'),
        privilege: z
          .string()
          .trim()
          .min(1)
          .describe('Milvus privilege name or built-in privilege group (e.g. "Search", "COLL_RO", "DB_Admin")'),
        dbName: z.string().trim().min(1).optional().describe("Optional database override for this privilege")
      })
    )
    .default([])
    .describe(
      "Privileges granted to an ephemeral role bound to the lease user. Leave empty to create the user with only the built-in public role."
    ),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database",
  Clickhouse = "clickhouse",
  Cassandra = "cassandra",
  AwsIam = "aws-iam",
  Redis = "redis",
  AwsElastiCache = "aws-elasticache",
  AwsMemoryDb = "aws-memorydb",
  MongoAtlas = "mongo-db-atlas",
  ElasticSearch = "elastic-search",
  MongoDB = "mongo-db",
  RabbitMq = "rabbit-mq",
  AzureEntraID = "azure-entra-id",
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
  Milvus = "milvus",
  Ssh = "ssh",
  IbmApiConnect = "ibm-api-connect",
  Tailscale = "tailscale"
}

export const DynamicSecretIbmApiConnectSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required"),
  clientSecret: z.string().trim().min(1, "Client Secret is required"),
  instanceUrl: z.string().url("Must be a valid URL").trim().min(1, "Instance URL is required"),
  apiKey: z.string().trim().min(1, "API Key is required"),
  orgId: z.string().trim().min(1, "Organization is required"),
  catalogId: z.string().trim().min(1, "Catalog is required"),
  consumerOrgId: z.string().trim().min(1, "Consumer Organization is required"),
  appId: z.string().trim().min(1, "Application is required"),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

export enum TailscaleKeyAuthType {
  AuthKeys = "auth_keys",
  OAuthKeys = "oauth_keys"
}

export enum TailscaleAuthMethod {
  ApiKey = "api_key",
  OAuth = "oauth"
}

const DynamicSecretTailscaleAuthSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(TailscaleAuthMethod.ApiKey),
    apiKey: z.string().trim().min(1).describe("Tailscale API access token used to create and revoke keys.")
  }),
  z.object({
    method: z.literal(TailscaleAuthMethod.OAuth),
    clientId: z.string().trim().min(1).describe("Tailscale OAuth client ID."),
    clientSecret: z.string().trim().min(1).describe("Tailscale OAuth client secret.")
  })
]);

export const DynamicSecretTailscaleSchema = z.discriminatedUnion("authType", [
  z.object({
    authType: z.literal(TailscaleKeyAuthType.AuthKeys),
    auth: DynamicSecretTailscaleAuthSchema,
    tailnet: z
      .string()
      .trim()
      .min(1)
      .default("-")
      .describe("Tailnet identifier. Use '-' for the token owner's default tailnet."),
    description: z.string().trim().max(50).optional().describe("Description applied to the created key."),
    tags: z
      .array(z.string().trim().min(1))
      .default([])
      .describe("ACL tags to attach to devices (e.g. tag:ci). Required when authenticating with an OAuth token."),
    reusable: z.boolean().default(false).describe("Whether the auth key can register multiple devices."),
    ephemeral: z.boolean().default(false).describe("Whether devices registered with the key are ephemeral."),
    preauthorized: z.boolean().default(false).describe("Whether devices registered with the key are pre-authorized.")
  }),
  z.object({
    authType: z.literal(TailscaleKeyAuthType.OAuthKeys),
    auth: DynamicSecretTailscaleAuthSchema,
    tailnet: z
      .string()
      .trim()
      .min(1)
      .default("-")
      .describe("Tailnet identifier. Use '-' for the token owner's default tailnet."),
    description: z.string().trim().max(50).optional().describe("Description applied to the created OAuth client."),
    tags: z
      .array(z.string().trim().min(1))
      .default([])
      .describe("ACL tags to attach (e.g. tag:ci). Required if scopes include devices:core or auth_keys."),
    scopes: z.array(z.string().trim().min(1)).min(1).describe("OAuth scopes granted to the client.")
  })
]);

export const DynamicSecretSshSchema = z.object({
  principals: z.array(z.string().trim().min(1)).min(1),
  keyAlgorithm: z.nativeEnum(SshCertKeyAlgorithm).default(SshCertKeyAlgorithm.ED25519)
});

export const SshStoredSchema = z.object({
  caPrivateKey: z.string(),
  caPublicKey: z.string(),
  principals: z.array(z.string().trim().min(1)).min(1),
  keyAlgorithm: z.nativeEnum(SshCertKeyAlgorithm)
});

export const DynamicSecretProviderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(DynamicSecretProviders.SqlDatabase), inputs: DynamicSecretSqlDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Clickhouse), inputs: DynamicSecretClickhouseSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Cassandra), inputs: DynamicSecretCassandraSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.SapAse), inputs: DynamicSecretSapAseSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AwsIam), inputs: DynamicSecretAwsIamSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Redis), inputs: DynamicSecretRedisDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.SapHana), inputs: DynamicSecretSapHanaSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AwsElastiCache), inputs: DynamicSecretAwsElastiCacheSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AwsMemoryDb), inputs: DynamicSecretAwsMemoryDbSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.MongoAtlas), inputs: DynamicSecretMongoAtlasSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.ElasticSearch), inputs: DynamicSecretElasticSearchSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.MongoDB), inputs: DynamicSecretMongoDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.RabbitMq), inputs: DynamicSecretRabbitMqSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AzureEntraID), inputs: AzureEntraIDSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AzureSqlDatabase), inputs: DynamicSecretAzureSqlDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Ldap), inputs: LdapSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Snowflake), inputs: DynamicSecretSnowflakeSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Totp), inputs: DynamicSecretTotpSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Kubernetes), inputs: DynamicSecretKubernetesSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Vertica), inputs: DynamicSecretVerticaSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.GcpIam), inputs: DynamicSecretGcpIamSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Github), inputs: DynamicSecretGithubSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Couchbase), inputs: DynamicSecretCouchbaseSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Milvus), inputs: DynamicSecretMilvusSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Ssh), inputs: DynamicSecretSshSchema }),
  z.object({
    type: z.literal(DynamicSecretProviders.IbmApiConnect),
    inputs: DynamicSecretIbmApiConnectSchema
  }),
  z.object({ type: z.literal(DynamicSecretProviders.Tailscale), inputs: DynamicSecretTailscaleSchema })
]);

// Extended metadata passed to a provider's create() call. When the project
// has a matching secret validation rule, `passwordValidation` carries the
// constraints that any generated password must satisfy; providers that
// generate passwords (e.g. sql-database, milvus) honor it in place of the
// user-configured passwordRequirements.
export type TDynamicProviderCreateMetadata = {
  projectId: string;
  passwordValidation?: {
    constraints: TConstraint[];
    ruleNames: string[];
  };
};

export type TDynamicProviderFns = {
  create: (arg: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
    metadata: TDynamicProviderCreateMetadata;
    config?: TDynamicSecretLeaseConfig;
  }) => Promise<{ entityId: string; data: unknown }>;
  validateConnection: (inputs: unknown, metadata: { projectId: string }) => Promise<boolean>;
  validateProviderInputs: (inputs: object, metadata: { projectId: string }) => Promise<unknown>;
  revoke: (
    inputs: unknown,
    entityId: string,
    metadata: { projectId: string },
    config?: TDynamicSecretLeaseConfig
  ) => Promise<{ entityId: string }>;
  renew: (
    inputs: unknown,
    entityId: string,
    expireAt: number,
    metadata: { projectId: string }
  ) => Promise<{ entityId: string }>;
};
