import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  azureSqlCreateFormSchema,
  getAzureSqlCreateDefaultValues,
  getAzureSqlCreatePayload,
  getAzureSqlEditDefaultValues,
  getAzureSqlEditPayload,
  normalizeAzureSqlGatewayValueForMode
} from "./providerDefinitions/azureSqlDatabaseContract";
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
const inputs = {
  host: "sql.example.com",
  port: 1433,
  database: "application",
  username: "admin",
  password: "masked-or-new-password",
  masterCreationStatement: "create login",
  creationStatement: "create user",
  revocationStatement: "drop user",
  renewStatement: "",
  sslEnabled: true,
  sslRejectUnauthorized: true,
  ca: "certificate",
  gatewayId: "gateway",
  gatewayPoolId: "pool",
  passwordRequirements: {
    length: 12,
    required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 1 },
    allowedSymbols: "-_"
  }
};
const editContext: TEditDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "azure-sql",
    type: DynamicSecretProviders.AzureSqlDatabase,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL: "1h",
    maxTTL: "24h",
    usernameTemplate: null,
    metadata: [{ key: "owner", value: "platform" }],
    inputs: {
      ...inputs,
      password: "********",
      ca: "********",
      gatewayId: null,
      gatewayPoolId: null
    }
  }
};

describe("Azure SQL Database provider contract", () => {
  it("hydrates defaults and preserves masked edit values", () => {
    const create = getAzureSqlCreateDefaultValues(createContext);
    assert.equal(create.inputs.port, 1433);
    assert.equal(create.inputs.passwordRequirements?.length, 48);
    assert.deepEqual(create.environment, environment);

    const edit = getAzureSqlEditDefaultValues(editContext);
    assert.equal(edit.inputs.password, "********");
    assert.equal(edit.inputs.ca, "********");
    assert.equal(edit.inputs.gatewayId, null);
    assert.deepEqual(edit.metadata, [{ key: "owner", value: "platform" }]);
  });

  it("validates password requirement totals against the configured length", () => {
    const defaults = getAzureSqlCreateDefaultValues(createContext);
    const parsed = azureSqlCreateFormSchema.safeParse({
      ...defaults,
      name: "azure-sql",
      inputs: {
        ...inputs,
        passwordRequirements: {
          length: 2,
          required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 }
        }
      }
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(
        parsed.error.issues.at(-1)?.message,
        "Sum of required characters cannot exceed the total length"
      );
    }
  });

  it("adds the master database and preserves metadata/template create semantics", () => {
    const defaults = getAzureSqlCreateDefaultValues(createContext);
    const payload = getAzureSqlCreatePayload(
      { ...defaults, name: "azure-sql", metadata: [{ key: "owner", value: "platform" }], inputs },
      createContext
    );
    assert.equal(payload.provider.inputs.masterDatabase, "master");
    assert.equal(payload.usernameTemplate, undefined);
    assert.deepEqual(payload.metadata, [{ key: "owner", value: "platform" }]);
  });

  it("keeps edit gateway nulls, rename behavior, and masked secrets", () => {
    const values = getAzureSqlEditDefaultValues(editContext);
    const payload = getAzureSqlEditPayload({ ...values, name: "renamed-azure-sql" }, editContext);
    const payloadInputs = payload.data.inputs as {
      masterDatabase: string;
      password: string;
      ca: string;
      gatewayId: null;
      gatewayPoolId: null;
    };
    assert.equal(payloadInputs.masterDatabase, "master");
    assert.equal(payloadInputs.password, "********");
    assert.equal(payloadInputs.ca, "********");
    assert.equal(payloadInputs.gatewayId, null);
    assert.equal(payloadInputs.gatewayPoolId, null);
    assert.equal(payload.data.newName, "renamed-azure-sql");
    assert.equal(payload.data.usernameTemplate, null);
  });

  it("normalizes cleared gateway values by mode", () => {
    assert.equal(normalizeAzureSqlGatewayValueForMode("create", null), undefined);
    assert.equal(normalizeAzureSqlGatewayValueForMode("edit", null), null);
  });
});
