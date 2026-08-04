import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  getRedisCreateDefaultValues,
  getRedisCreatePayload,
  getRedisEditDefaultValues,
  getRedisEditPayload,
  redisCreateFormSchema
} from "./providerDefinitions/redisContract";
import {
  getSapAseCreateDefaultValues,
  getSapAseCreatePayload,
  getSapAseEditDefaultValues,
  getSapAseEditPayload,
  sapAseCreateFormSchema,
  sapAseEditFormSchema
} from "./providerDefinitions/sapAseContract";
import {
  getSapHanaCreateDefaultValues,
  getSapHanaCreatePayload,
  getSapHanaEditDefaultValues,
  sapHanaCreateFormSchema
} from "./providerDefinitions/sapHanaContract";
import {
  getSnowflakeCreateDefaultValues,
  getSnowflakeCreatePayload,
  getSnowflakeEditDefaultValues,
  snowflakeCreateFormSchema
} from "./providerDefinitions/snowflakeContract";
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

const getEditContext = (
  inputs: unknown,
  overrides: Partial<TEditDynamicSecretProviderFormContext["dynamicSecret"]> = {}
) =>
  ({
    projectSlug: "project",
    secretPath: "/folder",
    environment: "dev",
    dynamicSecret: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: null,
      inputs,
      ...overrides
    }
  }) as TEditDynamicSecretProviderFormContext;

describe("simple SQL dynamic-secret contracts", () => {
  it("preserves provider-specific defaults and validates required connection inputs", () => {
    const redis = getRedisCreateDefaultValues(createContext);
    const sapHana = getSapHanaCreateDefaultValues(createContext);
    const sapAse = getSapAseCreateDefaultValues(createContext);
    const snowflake = getSnowflakeCreateDefaultValues(createContext);

    assert.equal(redis.inputs.port, 6379);
    assert.equal(redis.inputs.username, "default");
    assert.equal(redis.inputs.sslRejectUnauthorized, true);
    assert.equal(sapHana.inputs.port, 443);
    assert.equal(sapHana.inputs.sslRejectUnauthorized, true);
    assert.equal(sapAse.inputs.port, 5000);
    assert.equal(sapAse.inputs.database, "master");
    assert.match(snowflake.inputs.creationStatement, /DAYS_TO_EXPIRY/);

    assert.equal(redisCreateFormSchema.safeParse(redis).success, false);
    assert.equal(sapHanaCreateFormSchema.safeParse(sapHana).success, false);
    assert.equal(sapAseCreateFormSchema.safeParse(sapAse).success, false);
    assert.equal(snowflakeCreateFormSchema.safeParse(snowflake).success, false);
  });

  it("builds create payloads with exact provider discriminators and username normalization", () => {
    const redisValues = getRedisCreateDefaultValues(createContext);
    Object.assign(redisValues.inputs, { host: "redis.example.com", password: "secret" });
    const sapHanaValues = getSapHanaCreateDefaultValues(createContext);
    Object.assign(sapHanaValues.inputs, {
      host: "hana.example.com",
      username: "admin",
      password: "secret"
    });
    const sapAseValues = getSapAseCreateDefaultValues(createContext);
    Object.assign(sapAseValues.inputs, {
      host: "ase.example.com",
      username: "admin",
      password: "secret"
    });
    const snowflakeValues = getSnowflakeCreateDefaultValues(createContext);
    Object.assign(snowflakeValues.inputs, {
      accountId: "account",
      orgId: "organization",
      username: "admin",
      password: "token"
    });

    redisValues.name = "redis-secret";
    sapHanaValues.name = "hana-secret";
    sapAseValues.name = "ase-secret";
    snowflakeValues.name = "snowflake-secret";

    const redisPayload = getRedisCreatePayload(redisValues, createContext);
    const sapHanaPayload = getSapHanaCreatePayload(sapHanaValues, createContext);
    const sapAsePayload = getSapAseCreatePayload(sapAseValues, createContext);
    const snowflakePayload = getSnowflakeCreatePayload(snowflakeValues, createContext);

    assert.equal(redisPayload.provider.type, DynamicSecretProviders.Redis);
    assert.equal(sapHanaPayload.provider.type, DynamicSecretProviders.SapHana);
    assert.equal(sapAsePayload.provider.type, DynamicSecretProviders.SapAse);
    assert.equal(snowflakePayload.provider.type, DynamicSecretProviders.Snowflake);
    assert.equal(redisPayload.environmentSlug, "dev");
    assert.equal(redisPayload.usernameTemplate, undefined);
  });

  it("retains masked edit secrets and existing rename/null semantics", () => {
    const maskedRedis = {
      host: "redis.example.com",
      port: 6379,
      username: "default",
      password: "********",
      creationStatement: "create",
      revocationStatement: "revoke",
      sslRejectUnauthorized: true
    };
    const redisContext = getEditContext(maskedRedis);
    const redisValues = getRedisEditDefaultValues(redisContext);
    const redisPayload = getRedisEditPayload(
      { ...redisValues, name: "renamed-secret" },
      redisContext
    );

    assert.equal(redisValues.inputs.password, "********");
    assert.equal(redisPayload.data.newName, "renamed-secret");
    assert.equal(redisPayload.data.usernameTemplate, null);
    assert.equal((redisPayload.data.inputs as { password?: string }).password, "********");

    const hanaValues = getSapHanaEditDefaultValues(
      getEditContext({ host: "hana.example.com", password: "********" })
    );
    const snowflakeValues = getSnowflakeEditDefaultValues(
      getEditContext({ accountId: "account", password: "********" })
    );
    assert.equal(hanaValues.inputs.password, "********");
    assert.equal(snowflakeValues.inputs.password, "********");
  });

  it("preserves the SAP ASE create/edit CA asymmetry", () => {
    const createValues = getSapAseCreateDefaultValues(createContext);
    assert.equal("ca" in createValues.inputs, false);

    const editContext = getEditContext({
      host: "ase.example.com",
      port: 5000,
      database: "master",
      username: "admin",
      password: "********",
      creationStatement: "create",
      revocationStatement: "revoke",
      ca: "********"
    });
    const editValues = getSapAseEditDefaultValues(editContext);
    assert.equal(editValues.inputs.ca, "********");
    assert.equal(sapAseEditFormSchema.safeParse(editValues).success, true);

    const payload = getSapAseEditPayload(editValues, editContext);
    assert.equal((payload.data.inputs as { ca?: string }).ca, "********");
  });
});
