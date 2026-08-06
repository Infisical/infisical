import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

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
  getSapHanaEditPayload,
  sapHanaCreateFormSchema
} from "./providerDefinitions/sapHanaContract";
import {
  getSnowflakeCreateDefaultValues,
  getSnowflakeCreatePayload,
  getSnowflakeEditDefaultValues,
  getSnowflakeEditPayload,
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
    const sapHana = getSapHanaCreateDefaultValues(createContext);
    const sapAse = getSapAseCreateDefaultValues(createContext);
    const snowflake = getSnowflakeCreateDefaultValues(createContext);

    assert.equal(sapHana.inputs.port, 443);
    assert.equal(sapHana.inputs.sslRejectUnauthorized, true);
    assert.match(sapHana.inputs.creationStatement, /CREATE USER/);
    assert.match(sapHana.inputs.revocationStatement, /DROP USER/);
    assert.match(sapHana.inputs.renewStatement ?? "", /ALTER USER/);
    assert.equal(sapAse.inputs.port, 5000);
    assert.equal(sapAse.inputs.database, "master");
    assert.match(sapAse.inputs.creationStatement, /sp_addlogin/);
    assert.match(sapAse.inputs.revocationStatement, /sp_droplogin/);
    assert.match(snowflake.inputs.creationStatement, /DAYS_TO_EXPIRY/);
    assert.match(snowflake.inputs.revocationStatement, /DROP USER/);
    assert.match(snowflake.inputs.renewStatement ?? "", /ALTER USER/);

    assert.equal(sapHanaCreateFormSchema.safeParse(sapHana).success, false);
    assert.equal(sapAseCreateFormSchema.safeParse(sapAse).success, false);
    assert.equal(snowflakeCreateFormSchema.safeParse(snowflake).success, false);
  });

  it("builds create payloads with exact provider discriminators and username normalization", () => {
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

    sapHanaValues.name = "hana-secret";
    sapAseValues.name = "ase-secret";
    snowflakeValues.name = "snowflake-secret";

    const sapHanaPayload = getSapHanaCreatePayload(sapHanaValues, createContext);
    const sapAsePayload = getSapAseCreatePayload(sapAseValues, createContext);
    const snowflakePayload = getSnowflakeCreatePayload(snowflakeValues, createContext);

    assert.equal(sapHanaPayload.provider.type, DynamicSecretProviders.SapHana);
    assert.equal(sapAsePayload.provider.type, DynamicSecretProviders.SapAse);
    assert.equal(snowflakePayload.provider.type, DynamicSecretProviders.Snowflake);
    assert.equal(sapHanaPayload.environmentSlug, "dev");
    assert.equal(sapHanaPayload.usernameTemplate, undefined);
  });

  it("retains masked edit secrets and existing rename/template semantics", () => {
    const hanaContext = getEditContext({
      host: "hana.example.com",
      password: "********",
      ca: "********"
    });
    const hanaValues = getSapHanaEditDefaultValues(hanaContext);
    const hanaPayload = getSapHanaEditPayload(
      { ...hanaValues, name: "renamed-hana-secret" },
      hanaContext
    );
    const snowflakeContext = getEditContext({ accountId: "account", password: "********" });
    const snowflakeValues = getSnowflakeEditDefaultValues(snowflakeContext);
    const snowflakePayload = getSnowflakeEditPayload(snowflakeValues, snowflakeContext);

    assert.equal(hanaValues.inputs.password, "********");
    assert.equal(hanaValues.inputs.ca, "********");
    assert.equal(snowflakeValues.inputs.password, "********");
    assert.equal((hanaPayload.data.inputs as { password?: string }).password, "********");
    assert.equal((hanaPayload.data.inputs as { ca?: string }).ca, "********");
    assert.equal((snowflakePayload.data.inputs as { password?: string }).password, "********");
    assert.equal(hanaPayload.data.newName, "renamed-hana-secret");
    assert.equal(hanaPayload.data.usernameTemplate, null);
    assert.equal(snowflakePayload.data.usernameTemplate, null);
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
