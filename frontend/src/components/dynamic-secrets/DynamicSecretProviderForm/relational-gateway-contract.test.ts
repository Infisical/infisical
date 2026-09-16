import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  getVerticaCreateDefaultValues,
  getVerticaCreatePayload,
  getVerticaEditDefaultValues,
  getVerticaEditPayload,
  verticaCreateFormSchema
} from "./providerDefinitions/verticaContract";
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

const getEditContext = (inputs: unknown) =>
  ({
    projectSlug: "project",
    secretPath: "/folder",
    environment: "dev",
    dynamicSecret: {
      name: "vertica-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: null,
      inputs
    }
  }) as TEditDynamicSecretProviderFormContext;

describe("relational gateway dynamic-secret contracts", () => {
  it("retains Vertica defaults and validates required connection fields", () => {
    const values = getVerticaCreateDefaultValues(createContext);
    assert.equal(values.inputs.port, 5433);
    assert.equal(values.inputs.passwordRequirements?.length, 48);
    assert.match(values.inputs.creationStatement, /CREATE USER/);
    assert.equal(verticaCreateFormSchema.safeParse(values).success, false);
  });

  it("builds the Vertica create DTO without inventing cleared gateways", () => {
    const values = getVerticaCreateDefaultValues(createContext);
    Object.assign(values, { name: "vertica-secret" });
    Object.assign(values.inputs, {
      host: "vertica.example.com",
      database: "analytics",
      username: "admin",
      password: "secret"
    });

    const payload = getVerticaCreatePayload(values, createContext);
    assert.equal(payload.provider.type, DynamicSecretProviders.Vertica);
    assert.equal(payload.environmentSlug, "dev");
    assert.equal(payload.usernameTemplate, undefined);
    assert.equal((payload.provider.inputs as { gatewayId?: string }).gatewayId, undefined);
  });

  it("passes masked edit credentials through and clears both gateway selectors with null", () => {
    const context = getEditContext({
      host: "vertica.example.com",
      port: 5433,
      database: "analytics",
      username: "admin",
      password: "********",
      creationStatement: "create",
      revocationStatement: "revoke"
    });
    const values = getVerticaEditDefaultValues(context);
    const payload = getVerticaEditPayload(values, context);
    const inputs = payload.data.inputs as {
      password?: string;
      gatewayId?: string | null;
      gatewayPoolId?: string | null;
    };

    assert.equal(values.inputs.password, "********");
    assert.equal(inputs.password, "********");
    assert.equal(inputs.gatewayId, null);
    assert.equal(inputs.gatewayPoolId, null);
    assert.equal(payload.data.usernameTemplate, null);
  });
});
