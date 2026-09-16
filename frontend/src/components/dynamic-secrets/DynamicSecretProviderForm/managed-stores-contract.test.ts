import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AwsMemoryDbAuthType, DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  awsElastiCacheCreateFormSchema,
  awsElastiCacheEditFormSchema,
  awsMemoryDbCreateFormSchema,
  awsMemoryDbEditFormSchema,
  getAwsElastiCacheCreateDefaultValues,
  getAwsElastiCacheCreatePayload,
  getAwsElastiCacheEditDefaultValues,
  getAwsElastiCacheEditPayload,
  getAwsMemoryDbCreateDefaultValues,
  getAwsMemoryDbCreatePayload,
  getAwsMemoryDbEditDefaultValues,
  getAwsMemoryDbEditPayload
} from "./providerDefinitions/awsManagedStoresContract";
import {
  couchbaseCreateFormSchema,
  couchbaseEditFormSchema,
  getCouchbaseCreateDefaultValues,
  getCouchbaseCreatePayload,
  getCouchbaseEditDefaultValues,
  getCouchbaseEditPayload
} from "./providerDefinitions/couchbaseContract";
import { MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS } from "./providerDefinitions/managedStoresContract";
import {
  getMongoAtlasCreateDefaultValues,
  getMongoAtlasCreatePayload,
  getMongoAtlasEditDefaultValues,
  getMongoAtlasEditPayload,
  mongoAtlasCreateFormSchema,
  mongoAtlasEditFormSchema
} from "./providerDefinitions/mongoAtlasContract";
import {
  getMongoDbCreateDefaultValues,
  getMongoDbCreatePayload,
  getMongoDbEditDefaultValues,
  getMongoDbEditPayload,
  mongoDbCreateFormSchema,
  mongoDbEditFormSchema
} from "./providerDefinitions/mongoDbContract";
import {
  getRedisCreateDefaultValues,
  getRedisCreatePayload,
  getRedisEditDefaultValues,
  getRedisEditPayload,
  redisCreateFormSchema,
  redisEditFormSchema
} from "./providerDefinitions/redisContract";
import { createDynamicSecretProviderRegistry, defineDynamicSecretProviderModule } from "./registry";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "./schemas";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";
import { defineDynamicSecretProvider } from "./types";

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };

const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const multiEnvironmentContext: TCreateDynamicSecretProviderFormContext = {
  ...createContext,
  environments: [environment, { ...environment, id: "prod-id", name: "Production", slug: "prod" }],
  isSingleEnvironmentMode: false
};

const editContext = (
  provider: DynamicSecretProviders,
  inputs: unknown,
  options: {
    metadata?: { key: string; value: string }[];
    usernameTemplate?: string | null;
  } = {}
) =>
  ({
    projectSlug: "project",
    secretPath: "/folder",
    environment: "dev",
    dynamicSecret: {
      id: "dynamic-secret-id",
      name: "existing-secret",
      type: provider,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: options.usernameTemplate ?? null,
      metadata: options.metadata,
      inputs
    }
  }) as TEditDynamicSecretProviderFormContext;

const getIssuePaths = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) => (result.success ? [] : (result.error?.issues.map(({ path }) => path) ?? []));

const getValidAwsElastiCacheCreateValues = () => {
  const values = getAwsElastiCacheCreateDefaultValues(createContext);
  values.name = "elasticache";
  Object.assign(values.inputs, {
    clusterName: "redis-cluster",
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    region: "us-east-1"
  });
  return values;
};

const getValidAwsMemoryDbCreateValues = () => {
  const values = getAwsMemoryDbCreateDefaultValues(createContext);
  values.name = "memorydb";
  Object.assign(values.inputs, {
    clusterName: "memory-cluster",
    region: "us-east-1",
    auth: {
      type: AwsMemoryDbAuthType.IAM,
      accessKeyId: "access-key",
      secretAccessKey: "secret-key"
    }
  });
  return values;
};

const getValidRedisCreateValues = () => {
  const values = getRedisCreateDefaultValues(createContext);
  values.name = "redis";
  Object.assign(values.inputs, {
    host: "REDIS.EXAMPLE.COM",
    password: "secret",
    sslRejectUnauthorized: false
  });
  return values;
};

const getValidMongoDbCreateValues = () => {
  const values = getMongoDbCreateDefaultValues(createContext);
  values.name = "mongodb";
  Object.assign(values.inputs, {
    host: "MONGO.EXAMPLE.COM",
    database: "app",
    username: "admin",
    password: "secret",
    ca: "certificate",
    sslRejectUnauthorized: false,
    roles: [{ roleName: "readWrite" }, { roleName: "dbAdmin" }]
  });
  return values;
};

const getValidMongoAtlasCreateValues = () => {
  const values = getMongoAtlasCreateDefaultValues(createContext);
  values.name = "atlas";
  Object.assign(values.inputs, {
    adminPublicKey: "public-key",
    adminPrivateKey: "private-key",
    groupId: "0123456789abcdef01234567",
    roles: [{ databaseName: "app", collectionName: "users", roleName: "readWrite" }],
    scopes: [{ name: "cluster-id", type: "CLUSTER" }]
  });
  return values;
};

const getValidCouchbaseCreateValues = () => {
  const values = getCouchbaseCreateDefaultValues(createContext);
  values.name = "couchbase";
  Object.assign(values.inputs, {
    orgId: "org",
    projectId: "project",
    clusterId: "cluster",
    auth: { apiKey: "secret" }
  });
  return values;
};

const awsElastiCacheContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsElastiCache,
  label: "AWS ElastiCache",
  create: {
    schema: awsElastiCacheCreateFormSchema,
    getDefaultValues: getAwsElastiCacheCreateDefaultValues,
    toPayload: getAwsElastiCacheCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsElastiCacheEditFormSchema,
    getDefaultValues: getAwsElastiCacheEditDefaultValues,
    toPayload: getAwsElastiCacheEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const awsMemoryDbContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsMemoryDb,
  label: "AWS MemoryDB",
  create: {
    schema: awsMemoryDbCreateFormSchema,
    getDefaultValues: getAwsMemoryDbCreateDefaultValues,
    toPayload: getAwsMemoryDbCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsMemoryDbEditFormSchema,
    getDefaultValues: getAwsMemoryDbEditDefaultValues,
    toPayload: getAwsMemoryDbEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const redisContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Redis,
  label: "Redis",
  create: {
    schema: redisCreateFormSchema,
    getDefaultValues: getRedisCreateDefaultValues,
    toPayload: getRedisCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: redisEditFormSchema,
    getDefaultValues: getRedisEditDefaultValues,
    toPayload: getRedisEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const mongoAtlasContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.MongoAtlas,
  label: "MongoDB Atlas",
  create: {
    schema: mongoAtlasCreateFormSchema,
    getDefaultValues: getMongoAtlasCreateDefaultValues,
    toPayload: getMongoAtlasCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: mongoAtlasEditFormSchema,
    getDefaultValues: getMongoAtlasEditDefaultValues,
    toPayload: getMongoAtlasEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const mongoDbContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.MongoDB,
  label: "MongoDB",
  create: {
    schema: mongoDbCreateFormSchema,
    getDefaultValues: getMongoDbCreateDefaultValues,
    toPayload: getMongoDbCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: mongoDbEditFormSchema,
    getDefaultValues: getMongoDbEditDefaultValues,
    toPayload: getMongoDbEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const couchbaseContractDefinition = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Couchbase,
  label: "Couchbase",
  create: {
    schema: couchbaseCreateFormSchema,
    getDefaultValues: getCouchbaseCreateDefaultValues,
    toPayload: getCouchbaseCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: couchbaseEditFormSchema,
    getDefaultValues: getCouchbaseEditDefaultValues,
    toPayload: getCouchbaseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

const managedStoreContractModule = defineDynamicSecretProviderModule({
  id: "managed-stores-contract",
  definitions: [
    redisContractDefinition,
    awsElastiCacheContractDefinition,
    awsMemoryDbContractDefinition,
    mongoAtlasContractDefinition,
    mongoDbContractDefinition,
    couchbaseContractDefinition
  ]
});

describe("managed-store provider registration", () => {
  it("registers all six providers with create and edit parity in picker order", () => {
    const registry = createDynamicSecretProviderRegistry(managedStoreContractModule);

    assert.deepEqual(registry.providers, MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS);
    assert.equal(registry.definitions.length, 6);
    registry.definitions.forEach((definition) => {
      assert.ok(definition.create.schema);
      assert.ok(definition.edit.schema);
      assert.equal(typeof definition.create.getDefaultValues, "function");
      assert.equal(typeof definition.create.toPayload, "function");
      assert.equal(typeof definition.edit.getDefaultValues, "function");
      assert.equal(typeof definition.edit.toPayload, "function");
    });
    assert.equal(registry.getDocsSlug(DynamicSecretProviders.MongoAtlas), "mongo-atlas");
  });

  it("keeps environment selection visible for multi-environment create", () => {
    const defaultFactories = [
      getAwsElastiCacheCreateDefaultValues,
      getAwsMemoryDbCreateDefaultValues,
      getRedisCreateDefaultValues,
      getMongoDbCreateDefaultValues,
      getMongoAtlasCreateDefaultValues,
      getCouchbaseCreateDefaultValues
    ];

    defaultFactories.forEach((getDefaultValues) => {
      assert.equal(getDefaultValues(multiEnvironmentContext).environment, undefined);
      assert.deepEqual(getDefaultValues(createContext).environment, environment);
    });
  });
});

describe("managed-store provider defaults and validation", () => {
  it("preserves AWS statement, IAM, and TTL defaults", () => {
    const elastiCache = getAwsElastiCacheCreateDefaultValues(createContext);
    const memoryDb = getAwsMemoryDbCreateDefaultValues(createContext);

    assert.equal(elastiCache.defaultTTL, "1h");
    assert.equal(elastiCache.maxTTL, "24h");
    assert.match(elastiCache.inputs.creationStatement, /AccessString/);
    assert.match(elastiCache.inputs.revocationStatement, /UserId/);
    assert.equal(memoryDb.inputs.auth.type, AwsMemoryDbAuthType.IAM);
    assert.match(memoryDb.inputs.creationStatement, /AuthenticationMode/);
    assert.match(memoryDb.inputs.revocationStatement, /UserName/);
  });

  it("preserves Redis, MongoDB, Atlas, and Couchbase defaults", () => {
    const redis = getRedisCreateDefaultValues(createContext);
    const mongoDb = getMongoDbCreateDefaultValues(createContext);
    const atlas = getMongoAtlasCreateDefaultValues(createContext);
    const couchbase = getCouchbaseCreateDefaultValues(createContext);

    assert.equal(redis.inputs.port, 6379);
    assert.equal(typeof redis.inputs.port, "number");
    assert.equal(redis.inputs.sslRejectUnauthorized, true);
    assert.match(redis.inputs.creationStatement, /ACL SETUSER/);
    assert.equal(mongoDb.inputs.port, 27017);
    assert.equal(typeof mongoDb.inputs.port, "number");
    assert.equal(mongoDb.inputs.database, "default");
    assert.deepEqual(mongoDb.inputs.roles, [{ roleName: "readWrite" }]);
    assert.deepEqual(atlas.inputs.roles, [{ databaseName: "", roleName: "" }]);
    assert.deepEqual(atlas.inputs.scopes, []);
    assert.equal(couchbase.inputs.buckets, "*");
    assert.deepEqual(couchbase.inputs.roles, ["read"]);
    assert.equal(couchbase.inputs.passwordRequirements?.length, 12);
    assert.equal(typeof couchbase.inputs.passwordRequirements?.length, "number");
  });

  it("reports provider-specific required field paths", () => {
    const redisValues = getValidRedisCreateValues();
    const mongoDbValues = getValidMongoDbCreateValues();
    const atlasValues = getValidMongoAtlasCreateValues();

    const invalidRedis = redisCreateFormSchema.safeParse({
      ...redisValues,
      inputs: { ...redisValues.inputs, host: "", creationStatement: "" }
    });
    const invalidMongoDb = mongoDbCreateFormSchema.safeParse({
      ...mongoDbValues,
      inputs: { ...mongoDbValues.inputs, password: "", roles: [] }
    });
    const invalidAtlas = mongoAtlasCreateFormSchema.safeParse({
      ...atlasValues,
      inputs: { ...atlasValues.inputs, groupId: "", scopes: [{ name: "", type: "" }] }
    });

    assert.deepEqual(getIssuePaths(invalidRedis), [
      ["inputs", "host"],
      ["inputs", "creationStatement"]
    ]);
    assert.deepEqual(getIssuePaths(invalidMongoDb), [
      ["inputs", "password"],
      ["inputs", "roles"]
    ]);
    assert.deepEqual(getIssuePaths(invalidAtlas), [
      ["inputs", "groupId"],
      ["inputs", "scopes", 0, "name"],
      ["inputs", "scopes", 0, "type"]
    ]);
  });

  it("validates AWS cluster credentials in both managed-store branches", () => {
    const elastiCacheValues = getValidAwsElastiCacheCreateValues();
    const memoryDbValues = getValidAwsMemoryDbCreateValues();
    const invalidElastiCache = awsElastiCacheCreateFormSchema.safeParse({
      ...elastiCacheValues,
      inputs: {
        ...elastiCacheValues.inputs,
        clusterName: "",
        accessKeyId: "",
        secretAccessKey: ""
      }
    });
    const invalidMemoryDb = awsMemoryDbCreateFormSchema.safeParse({
      ...memoryDbValues,
      inputs: {
        ...memoryDbValues.inputs,
        clusterName: "",
        region: "",
        auth: {
          type: AwsMemoryDbAuthType.IAM,
          accessKeyId: "",
          secretAccessKey: ""
        }
      }
    });

    assert.deepEqual(getIssuePaths(invalidElastiCache), [
      ["inputs", "clusterName"],
      ["inputs", "accessKeyId"],
      ["inputs", "secretAccessKey"]
    ]);
    assert.deepEqual(getIssuePaths(invalidMemoryDb), [
      ["inputs", "clusterName"],
      ["inputs", "region"],
      ["inputs", "auth", "accessKeyId"],
      ["inputs", "auth", "secretAccessKey"]
    ]);
  });

  it("keeps Couchbase password values numeric and validates every requirement", () => {
    const values = getValidCouchbaseCreateValues();
    const validResult = couchbaseCreateFormSchema.safeParse(values);
    assert.equal(validResult.success, true);
    if (validResult.success) {
      const requirements = validResult.data.inputs.passwordRequirements;
      assert.equal(typeof requirements?.length, "number");
      assert.equal(typeof requirements?.required.lowercase, "number");
      assert.equal(typeof requirements?.required.uppercase, "number");
      assert.equal(typeof requirements?.required.digits, "number");
      assert.equal(typeof requirements?.required.symbols, "number");
    }

    const stringLength = couchbaseCreateFormSchema.safeParse({
      ...values,
      inputs: {
        ...values.inputs,
        passwordRequirements: { ...values.inputs.passwordRequirements, length: "12" }
      }
    });
    const excessiveRequirements = couchbaseCreateFormSchema.safeParse({
      ...values,
      inputs: {
        ...values.inputs,
        passwordRequirements: {
          length: 8,
          required: { lowercase: 3, uppercase: 3, digits: 3, symbols: 3 },
          allowedSymbols: "!@#"
        }
      }
    });
    const forbiddenSymbols = couchbaseCreateFormSchema.safeParse({
      ...values,
      inputs: {
        ...values.inputs,
        passwordRequirements: {
          ...values.inputs.passwordRequirements,
          allowedSymbols: "!@#&"
        }
      }
    });

    assert.deepEqual(getIssuePaths(stringLength), [["inputs", "passwordRequirements", "length"]]);
    assert.deepEqual(getIssuePaths(excessiveRequirements), [["inputs", "passwordRequirements"]]);
    assert.deepEqual(getIssuePaths(forbiddenSymbols), [
      ["inputs", "passwordRequirements", "allowedSymbols"]
    ]);
  });

  it("keeps Couchbase edit partial while validating metadata keys", () => {
    const partialEdit = couchbaseEditFormSchema.safeParse({
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: null,
      usernameTemplate: null,
      inputs: { auth: { apiKey: "********" } },
      metadata: [{ key: "owner", value: "platform" }]
    });
    const invalidMetadata = couchbaseEditFormSchema.safeParse({
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: null,
      inputs: {},
      metadata: [{ key: "", value: "platform" }]
    });

    assert.equal(partialEdit.success, true);
    assert.deepEqual(getIssuePaths(invalidMetadata), [["metadata", 0, "key"]]);
  });
});

describe("managed-store create payload adapters", () => {
  it("adapts all provider payloads without sending the default username template", () => {
    const payloads = [
      getAwsElastiCacheCreatePayload(getValidAwsElastiCacheCreateValues(), createContext),
      getAwsMemoryDbCreatePayload(getValidAwsMemoryDbCreateValues(), createContext),
      getRedisCreatePayload(getValidRedisCreateValues(), createContext),
      getMongoAtlasCreatePayload(getValidMongoAtlasCreateValues(), createContext),
      getMongoDbCreatePayload(getValidMongoDbCreateValues(), createContext),
      getCouchbaseCreatePayload(getValidCouchbaseCreateValues(), createContext)
    ];

    assert.deepEqual(
      payloads.map(({ provider }) => provider.type),
      [
        DynamicSecretProviders.AwsElastiCache,
        DynamicSecretProviders.AwsMemoryDb,
        DynamicSecretProviders.Redis,
        DynamicSecretProviders.MongoAtlas,
        DynamicSecretProviders.MongoDB,
        DynamicSecretProviders.Couchbase
      ]
    );
    payloads.forEach((payload) => {
      assert.equal(payload.projectSlug, "project");
      assert.equal(payload.path, "/folder");
      assert.equal(payload.environmentSlug, "dev");
      assert.equal(payload.usernameTemplate, undefined);
    });
  });

  it("preserves Redis statements and TLS fields without adding gateway properties", () => {
    const payload = getRedisCreatePayload(getValidRedisCreateValues(), createContext);

    assert.equal(payload.provider.inputs.host, "redis.example.com");
    assert.equal(payload.provider.inputs.port, 6379);
    assert.equal(typeof payload.provider.inputs.port, "number");
    assert.equal(
      (
        payload.provider.inputs as typeof payload.provider.inputs & {
          sslRejectUnauthorized: boolean;
        }
      ).sslRejectUnauthorized,
      false
    );
    assert.match(payload.provider.inputs.creationStatement, /ACL SETUSER/);
    assert.equal("gatewayId" in payload.provider.inputs, false);
    assert.equal("gatewayPoolId" in payload.provider.inputs, false);
  });

  it("flattens MongoDB roles, preserves TLS, and omits a cleared port", () => {
    const values = getValidMongoDbCreateValues();
    values.inputs.port = 0;
    const payload = getMongoDbCreatePayload(values, createContext);

    assert.equal(payload.provider.inputs.host, "mongo.example.com");
    assert.equal(payload.provider.inputs.port, undefined);
    assert.deepEqual(payload.provider.inputs.roles, ["readWrite", "dbAdmin"]);
    assert.equal(
      (
        payload.provider.inputs as typeof payload.provider.inputs & {
          sslRejectUnauthorized: boolean;
        }
      ).sslRejectUnauthorized,
      false
    );
    assert.equal("gatewayId" in payload.provider.inputs, false);
  });

  it("preserves MongoDB Atlas roles and provider-specific scopes", () => {
    const payload = getMongoAtlasCreatePayload(getValidMongoAtlasCreateValues(), createContext);

    assert.deepEqual(payload.provider.inputs.roles, [
      { databaseName: "app", collectionName: "users", roleName: "readWrite" }
    ]);
    assert.deepEqual(payload.provider.inputs.scopes, [{ name: "cluster-id", type: "CLUSTER" }]);
  });

  it("keeps Couchbase simple and advanced bucket payloads distinct", () => {
    const simpleValues = getValidCouchbaseCreateValues();
    const simplePayload = getCouchbaseCreatePayload(simpleValues, createContext);
    assert.equal(simplePayload.provider.inputs.buckets, "*");
    assert.equal("useAdvancedBuckets" in simplePayload.provider.inputs, false);

    const advancedValues = getValidCouchbaseCreateValues();
    advancedValues.inputs.useAdvancedBuckets = true;
    advancedValues.inputs.buckets = [
      {
        name: "inventory",
        scopes: [{ name: "default", collections: ["items", "suppliers"] }]
      }
    ];
    const advancedPayload = getCouchbaseCreatePayload(advancedValues, createContext);

    assert.deepEqual(advancedPayload.provider.inputs.buckets, advancedValues.inputs.buckets);
    assert.equal(advancedPayload.provider.inputs.passwordRequirements?.length, 12);
    assert.equal(typeof advancedPayload.provider.inputs.passwordRequirements?.length, "number");
  });
});

describe("managed-store edit hydration and payload adapters", () => {
  it("preserves every masked provider credential through edit submission", () => {
    const elastiCacheContext = editContext(DynamicSecretProviders.AwsElastiCache, {
      clusterName: "redis-cluster",
      accessKeyId: "access-key",
      secretAccessKey: "********",
      region: "us-east-1",
      creationStatement: "create",
      revocationStatement: "revoke"
    });
    const memoryDbContext = editContext(DynamicSecretProviders.AwsMemoryDb, {
      clusterName: "memory-cluster",
      region: "us-east-1",
      auth: {
        type: AwsMemoryDbAuthType.IAM,
        accessKeyId: "access-key",
        secretAccessKey: "********"
      },
      creationStatement: "create",
      revocationStatement: "revoke"
    });
    const redisContext = editContext(DynamicSecretProviders.Redis, {
      host: "redis.example.com",
      port: 6379,
      username: "default",
      password: "********",
      creationStatement: "create",
      revocationStatement: "revoke",
      sslRejectUnauthorized: true
    });
    const mongoDbContext = editContext(DynamicSecretProviders.MongoDB, {
      host: "mongo.example.com",
      port: 27017,
      database: "app",
      username: "admin",
      password: "********",
      roles: ["readWrite"],
      sslRejectUnauthorized: true
    });
    const atlasContext = editContext(DynamicSecretProviders.MongoAtlas, {
      adminPublicKey: "public-key",
      adminPrivateKey: "********",
      groupId: "0123456789abcdef01234567",
      roles: [{ databaseName: "app", roleName: "readWrite" }],
      scopes: []
    });
    const couchbaseContext = editContext(DynamicSecretProviders.Couchbase, {
      url: "https://cloudapi.cloud.couchbase.com",
      orgId: "org",
      projectId: "project",
      clusterId: "cluster",
      roles: ["read"],
      buckets: "*",
      passwordRequirements: {
        length: 12,
        required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 1 }
      },
      auth: { apiKey: "********" }
    });

    const elastiCache = getAwsElastiCacheEditDefaultValues(elastiCacheContext);
    const memoryDb = getAwsMemoryDbEditDefaultValues(memoryDbContext);
    const redis = getRedisEditDefaultValues(redisContext);
    const mongoDb = getMongoDbEditDefaultValues(mongoDbContext);
    const atlas = getMongoAtlasEditDefaultValues(atlasContext);
    const couchbase = getCouchbaseEditDefaultValues(couchbaseContext);

    assert.equal(elastiCache.inputs.secretAccessKey, "********");
    assert.equal(memoryDb.inputs.auth?.secretAccessKey, "********");
    assert.equal(redis.inputs.password, "********");
    assert.equal(mongoDb.inputs.password, "********");
    assert.equal(atlas.inputs.adminPrivateKey, "********");
    assert.equal(couchbase.inputs.auth?.apiKey, "********");
    assert.equal(
      (
        getAwsElastiCacheEditPayload(elastiCache, elastiCacheContext).data.inputs as {
          secretAccessKey: string;
        }
      ).secretAccessKey,
      "********"
    );
    assert.equal(
      (
        getAwsMemoryDbEditPayload(memoryDb, memoryDbContext).data.inputs as {
          auth: { secretAccessKey: string };
        }
      ).auth.secretAccessKey,
      "********"
    );
    assert.equal(
      (getRedisEditPayload(redis, redisContext).data.inputs as { password: string }).password,
      "********"
    );
    assert.equal(
      (getMongoDbEditPayload(mongoDb, mongoDbContext).data.inputs as { password: string }).password,
      "********"
    );
    assert.equal(
      (getMongoAtlasEditPayload(atlas, atlasContext).data.inputs as { adminPrivateKey: string })
        .adminPrivateKey,
      "********"
    );
    assert.equal(
      (
        getCouchbaseEditPayload(couchbase, couchbaseContext).data.inputs as {
          auth: { apiKey: string };
        }
      ).auth.apiKey,
      "********"
    );
  });

  it("hydrates and flattens MongoDB role values on edit", () => {
    const context = editContext(DynamicSecretProviders.MongoDB, {
      host: "mongo.example.com",
      password: "********",
      roles: ["readWrite", "dbAdmin"]
    });
    const values = getMongoDbEditDefaultValues(context);
    values.name = "renamed-secret";
    values.maxTTL = null;
    values.usernameTemplate = DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE;

    assert.deepEqual(values.inputs.roles, [{ roleName: "readWrite" }, { roleName: "dbAdmin" }]);
    const payload = getMongoDbEditPayload(values, context);
    assert.deepEqual((payload.data.inputs as { roles: string[] }).roles, ["readWrite", "dbAdmin"]);
    assert.equal(payload.data.newName, "renamed-secret");
    assert.equal(payload.data.maxTTL, undefined);
    assert.equal(payload.data.usernameTemplate, null);
  });

  it("hydrates Couchbase advanced buckets and preserves edit-only metadata", () => {
    const buckets = [{ name: "inventory", scopes: [{ name: "default", collections: ["items"] }] }];
    const context = editContext(
      DynamicSecretProviders.Couchbase,
      {
        url: "https://cloudapi.cloud.couchbase.com",
        orgId: "org",
        projectId: "project",
        clusterId: "cluster",
        roles: ["read"],
        buckets,
        auth: { apiKey: "********" }
      },
      { metadata: [{ key: "owner", value: "platform" }] }
    );
    const values = getCouchbaseEditDefaultValues(context);
    values.name = "renamed-secret";
    values.usernameTemplate = DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE;

    assert.equal(values.inputs.useAdvancedBuckets, true);
    assert.deepEqual(values.metadata, [{ key: "owner", value: "platform" }]);
    const payload = getCouchbaseEditPayload(values, context);
    assert.deepEqual((payload.data.inputs as { buckets: unknown }).buckets, buckets);
    assert.deepEqual(payload.data.metadata, [{ key: "owner", value: "platform" }]);
    assert.equal(payload.data.newName, "renamed-secret");
    assert.equal(payload.data.usernameTemplate, undefined);
    assert.equal("useAdvancedBuckets" in (payload.data.inputs as object), false);
  });
});
