import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  getCassandraCreateDefaultValues,
  getCassandraCreatePayload,
  getCassandraEditDefaultValues,
  getCassandraEditPayload
} from "./providerDefinitions/cassandraContract";
import {
  getElasticSearchCreateDefaultValues,
  getElasticSearchCreatePayload,
  getElasticSearchEditDefaultValues,
  getElasticSearchEditPayload
} from "./providerDefinitions/elasticSearchContract";
import {
  getIbmApiConnectCreateDefaultValues,
  getIbmApiConnectCreatePayload,
  getIbmApiConnectEditDefaultValues,
  getIbmApiConnectEditPayload,
  ibmApiConnectCreateFormSchema
} from "./providerDefinitions/ibmApiConnectContract";
import {
  getMilvusCreateDefaultValues,
  getMilvusCreatePayload,
  getMilvusEditDefaultValues,
  getMilvusEditPayload
} from "./providerDefinitions/milvusContract";
import {
  getRabbitMqCreateDefaultValues,
  getRabbitMqCreatePayload,
  getRabbitMqEditDefaultValues,
  getRabbitMqEditPayload
} from "./providerDefinitions/rabbitMqContract";
import {
  getTotpCreateDefaultValues,
  getTotpCreatePayload,
  getTotpEditDefaultValues,
  getTotpEditPayload,
  TotpAlgorithm,
  TotpConfigType,
  totpCreateFormSchema
} from "./providerDefinitions/totpContract";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };

const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const editContext: TEditDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-totp",
    type: DynamicSecretProviders.Totp,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaultTTL: "1m",
    maxTTL: "24h",
    inputs: {
      configType: TotpConfigType.MANUAL,
      secret: "********",
      period: 30,
      algorithm: TotpAlgorithm.SHA1,
      digits: 6
    }
  }
};

describe("TOTP dynamic-secret provider contract", () => {
  it("preserves create defaults and validates both configuration modes", () => {
    const defaults = getTotpCreateDefaultValues(createContext);
    assert.equal(defaults.defaultTTL, "1m");
    assert.equal(defaults.maxTTL, "24h");
    assert.deepEqual(defaults.environment, environment);
    assert.equal(defaults.inputs.configType, TotpConfigType.URL);

    assert.equal(
      totpCreateFormSchema.safeParse({
        ...defaults,
        name: "totp-url",
        inputs: {
          configType: TotpConfigType.URL,
          url: "otpauth://totp/example?secret=ABC123"
        }
      }).success,
      true
    );
    assert.equal(
      totpCreateFormSchema.safeParse({
        ...defaults,
        name: "totp-manual",
        inputs: {
          configType: TotpConfigType.MANUAL,
          secret: "ABC 123",
          period: 30,
          algorithm: TotpAlgorithm.SHA256,
          digits: 6
        }
      }).success,
      true
    );
  });

  it("rejects a URL without an embedded secret", () => {
    const result = totpCreateFormSchema.safeParse({
      ...getTotpCreateDefaultValues(createContext),
      name: "totp-url",
      inputs: { configType: TotpConfigType.URL, url: "otpauth://totp/example" }
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, "OTP URL must contain secret field");
      assert.deepEqual(result.error.issues[0]?.path, ["inputs", "url"]);
    }
  });

  it("preserves exact create and edit payload behavior, including masked hydration", () => {
    const createValues = {
      ...getTotpCreateDefaultValues(createContext),
      name: "totp-secret",
      inputs: {
        configType: TotpConfigType.MANUAL as const,
        secret: "ABC 123",
        period: 30,
        algorithm: TotpAlgorithm.SHA1,
        digits: 6
      }
    };
    const createPayload = getTotpCreatePayload(createValues, createContext);
    assert.equal(createPayload.provider.type, DynamicSecretProviders.Totp);
    assert.equal(createPayload.environmentSlug, "dev");
    assert.equal((createPayload.provider.inputs as { secret: string }).secret, "ABC123");

    const editDefaults = getTotpEditDefaultValues(editContext);
    assert.equal((editDefaults.inputs as { secret: string }).secret, "********");
    const editPayload = getTotpEditPayload({ ...editDefaults, name: "renamed-totp" }, editContext);
    assert.equal(editPayload.name, "existing-totp");
    assert.equal(editPayload.data.newName, "renamed-totp");
    assert.equal((editPayload.data.inputs as { secret: string }).secret, "********");
    assert.equal(editPayload.data.defaultTTL, undefined);
    assert.equal(editPayload.data.maxTTL, undefined);
  });
});

describe("Cassandra dynamic-secret provider contract", () => {
  it("preserves defaults and exact create payload", () => {
    const values = {
      ...getCassandraCreateDefaultValues(createContext),
      name: "cassandra-secret",
      inputs: {
        ...getCassandraCreateDefaultValues(createContext).inputs,
        host: "CASSANDRA.EXAMPLE.COM",
        username: "admin",
        password: "password"
      }
    };
    const payload = getCassandraCreatePayload(values, createContext);
    assert.equal(payload.provider.type, DynamicSecretProviders.Cassandra);
    assert.equal(payload.provider.inputs.host, "cassandra.example.com");
    assert.equal(payload.provider.inputs.port, 9042);
    assert.equal(payload.environmentSlug, "dev");
    assert.equal(payload.usernameTemplate, undefined);
  });

  it("hydrates masked credentials and keeps edit nullability semantics", () => {
    const context: TEditDynamicSecretProviderFormContext = {
      ...editContext,
      dynamicSecret: {
        ...editContext.dynamicSecret,
        type: DynamicSecretProviders.Cassandra,
        name: "existing-cassandra",
        defaultTTL: "1h",
        maxTTL: "24h",
        usernameTemplate: null,
        inputs: {
          host: "cassandra.example.com",
          port: 9042,
          localDataCenter: "datacenter1",
          username: "admin",
          password: "********",
          creationStatement: "CREATE ROLE '{{username}}'",
          revocationStatement: "DROP ROLE '{{username}}'",
          renewStatement: "",
          sslRejectUnauthorized: true
        }
      }
    };
    const defaults = getCassandraEditDefaultValues(context);
    assert.equal(defaults.inputs.password, "********");
    const payload = getCassandraEditPayload(
      { ...defaults, name: "renamed-cassandra", usernameTemplate: "{{randomUsername}}" },
      context
    );
    assert.equal(payload.name, "existing-cassandra");
    assert.equal(payload.data.newName, "renamed-cassandra");
    assert.equal((payload.data.inputs as { password: string }).password, "********");
    assert.equal(payload.data.usernameTemplate, null);
  });
});

describe("RabbitMQ dynamic-secret provider contract", () => {
  it("preserves virtual-host defaults and create payload", () => {
    const defaults = getRabbitMqCreateDefaultValues(createContext);
    assert.equal(defaults.inputs.port, 15672);
    assert.deepEqual(defaults.inputs.virtualHost, {
      name: "/",
      permissions: { read: ".*", write: ".*", configure: ".*" }
    });
    const payload = getRabbitMqCreatePayload(
      {
        ...defaults,
        name: "rabbitmq-secret",
        inputs: {
          ...defaults.inputs,
          host: "https://rabbitmq.example.com",
          username: "admin",
          password: "password",
          tags: [" management "]
        }
      },
      createContext
    );
    assert.deepEqual(payload.provider.inputs.tags, ["management"]);
    assert.equal(payload.usernameTemplate, undefined);
  });

  it("passes masked edit credentials through unchanged", () => {
    const context: TEditDynamicSecretProviderFormContext = {
      ...editContext,
      dynamicSecret: {
        ...editContext.dynamicSecret,
        name: "existing-rabbitmq",
        type: DynamicSecretProviders.RabbitMq,
        inputs: {
          host: "https://rabbitmq.example.com",
          port: 15672,
          username: "admin",
          password: "********",
          tags: ["management"],
          virtualHost: {
            name: "/",
            permissions: { read: ".*", write: ".*", configure: ".*" }
          },
          sslRejectUnauthorized: true
        }
      }
    };
    const defaults = getRabbitMqEditDefaultValues(context);
    assert.equal(defaults.inputs.password, "********");
    const payload = getRabbitMqEditPayload(defaults, context);
    assert.equal((payload.data.inputs as { password: string }).password, "********");
    assert.equal(payload.data.newName, undefined);
    assert.equal(payload.data.usernameTemplate, null);
  });
});

describe("Elasticsearch dynamic-secret provider contract", () => {
  it("preserves auth branches, roles, and masked edit hydration", () => {
    const defaults = getElasticSearchCreateDefaultValues(createContext);
    const createPayload = getElasticSearchCreatePayload(
      {
        ...defaults,
        name: "elasticsearch-secret",
        inputs: {
          ...defaults.inputs,
          host: "elastic.example.com",
          auth: { type: "api-key", apiKeyId: "key-id", apiKey: "secret" }
        }
      },
      createContext
    );
    assert.equal(createPayload.provider.inputs.auth.type, "api-key");
    assert.deepEqual(createPayload.provider.inputs.roles, ["superuser"]);

    const context: TEditDynamicSecretProviderFormContext = {
      ...editContext,
      dynamicSecret: {
        ...editContext.dynamicSecret,
        name: "existing-elasticsearch",
        type: DynamicSecretProviders.ElasticSearch,
        inputs: {
          host: "elastic.example.com",
          port: 443,
          auth: { type: "user", username: "admin", password: "********" },
          roles: ["superuser"]
        }
      }
    };
    const editDefaults = getElasticSearchEditDefaultValues(context);
    assert.equal(
      (editDefaults.inputs.auth as { type: "user"; password: string }).password,
      "********"
    );
    const editPayload = getElasticSearchEditPayload(editDefaults, context);
    assert.equal(
      (editPayload.data.inputs as { auth: { password: string } }).auth.password,
      "********"
    );
  });
});

describe("Milvus dynamic-secret provider contract", () => {
  it("preserves privilege defaults and edit gateway nullability", () => {
    const defaults = getMilvusCreateDefaultValues(createContext);
    const createPayload = getMilvusCreatePayload(
      { ...defaults, name: "milvus-secret", inputs: { ...defaults.inputs, password: "secret" } },
      createContext
    );
    assert.equal(createPayload.provider.inputs.database, "default");
    assert.deepEqual(createPayload.provider.inputs.privileges, []);

    const context: TEditDynamicSecretProviderFormContext = {
      ...editContext,
      dynamicSecret: {
        ...editContext.dynamicSecret,
        name: "existing-milvus",
        type: DynamicSecretProviders.Milvus,
        metadata: [{ key: "owner", value: "platform" }],
        inputs: { ...defaults.inputs, password: "********" }
      }
    };
    const editDefaults = getMilvusEditDefaultValues(context);
    const editPayload = getMilvusEditPayload(editDefaults, context);
    assert.equal((editPayload.data.inputs as { password: string }).password, "********");
    assert.equal((editPayload.data.inputs as { gatewayId: null }).gatewayId, null);
    assert.equal((editPayload.data.inputs as { gatewayPoolId: null }).gatewayPoolId, null);
    assert.deepEqual(editPayload.data.metadata, [{ key: "owner", value: "platform" }]);
  });
});

describe("IBM API Connect dynamic-secret provider contract", () => {
  const validInputs = {
    clientId: "client-id",
    clientSecret: "client-secret",
    instanceUrl: "https://api.example.com",
    apiKey: "api-key",
    orgId: "org-id",
    catalogId: "catalog-id",
    consumerOrgId: "consumer-org-id",
    appId: "app-id"
  };

  it("preserves the provider-specific one-second TTL contract and remote IDs", () => {
    const defaults = getIbmApiConnectCreateDefaultValues(createContext);
    assert.equal(
      ibmApiConnectCreateFormSchema.safeParse({
        ...defaults,
        name: "ibm-secret",
        defaultTTL: "1s",
        maxTTL: "2s",
        inputs: validInputs
      }).success,
      true
    );
    const payload = getIbmApiConnectCreatePayload(
      { ...defaults, name: "ibm-secret", inputs: validInputs },
      createContext
    );
    assert.equal(payload.provider.inputs.orgId, "org-id");
    assert.equal((payload.provider.inputs as typeof validInputs).consumerOrgId, "consumer-org-id");
  });

  it("hydrates and submits masked credentials without replacement", () => {
    const context: TEditDynamicSecretProviderFormContext = {
      ...editContext,
      dynamicSecret: {
        ...editContext.dynamicSecret,
        name: "existing-ibm",
        type: DynamicSecretProviders.IbmApiConnect,
        inputs: { ...validInputs, clientSecret: "********", apiKey: "********" }
      }
    };
    const defaults = getIbmApiConnectEditDefaultValues(context);
    const payload = getIbmApiConnectEditPayload(defaults, context);
    assert.equal((payload.data.inputs as typeof validInputs).clientSecret, "********");
    assert.equal((payload.data.inputs as typeof validInputs).apiKey, "********");
  });
});
