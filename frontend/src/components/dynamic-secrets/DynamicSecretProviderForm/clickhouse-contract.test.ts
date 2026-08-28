import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  clickHouseCreateFormSchema,
  getClickHouseCreateDefaultValues,
  getClickHouseCreatePayload,
  getClickHouseEditDefaultValues,
  getClickHouseEditPayload
} from "./providerDefinitions/clickHouseContract";
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

describe("ClickHouse dynamic-secret provider contract", () => {
  it("preserves create defaults, metadata, and exact payload", () => {
    const defaults = getClickHouseCreateDefaultValues(createContext);
    assert.equal(defaults.inputs.port, 8123);
    assert.equal(typeof defaults.inputs.port, "number");
    assert.equal(defaults.inputs.database, "default");
    assert.deepEqual(defaults.inputs.passwordRequirements?.required, {
      lowercase: 1,
      uppercase: 1,
      digits: 1,
      symbols: 1
    });

    const values = {
      ...defaults,
      name: "clickhouse-secret",
      metadata: [{ key: "owner", value: "platform" }],
      inputs: {
        ...defaults.inputs,
        host: "clickhouse.example.com",
        username: "admin",
        password: "password"
      }
    };
    assert.equal(clickHouseCreateFormSchema.safeParse(values).success, true);
    const payload = getClickHouseCreatePayload(values, createContext);
    assert.equal(payload.provider.type, DynamicSecretProviders.Clickhouse);
    assert.equal(payload.provider.inputs.port, 8123);
    assert.equal(typeof payload.provider.inputs.port, "number");
    assert.equal(payload.environmentSlug, "dev");
    assert.deepEqual(payload.metadata, [{ key: "owner", value: "platform" }]);
    assert.equal(payload.usernameTemplate, undefined);
  });

  it("rejects the browser string regression for numeric inputs", () => {
    const defaults = getClickHouseCreateDefaultValues(createContext);
    const result = clickHouseCreateFormSchema.safeParse({
      ...defaults,
      name: "clickhouse-secret",
      inputs: {
        ...defaults.inputs,
        host: "clickhouse.example.com",
        port: "8123",
        username: "admin",
        password: "password"
      }
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(result.error.issues[0]?.path, ["inputs", "port"]);
    }
  });

  it("preserves password-policy messages", () => {
    const defaults = getClickHouseCreateDefaultValues(createContext);
    const result = clickHouseCreateFormSchema.safeParse({
      ...defaults,
      name: "clickhouse-secret",
      inputs: {
        ...defaults.inputs,
        host: "clickhouse.example.com",
        username: "admin",
        password: "password",
        passwordRequirements: {
          ...defaults.inputs.passwordRequirements,
          length: 2
        }
      }
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(
        result.error.issues[0]?.message,
        "Sum of required characters cannot exceed the total length"
      );
    }
  });

  it("hydrates masked credentials and normalizes cleared edit gateways to null", () => {
    const context: TEditDynamicSecretProviderFormContext = {
      projectSlug: "project",
      secretPath: "/folder",
      environment: "dev",
      dynamicSecret: {
        id: "dynamic-secret-id",
        name: "existing-clickhouse",
        type: DynamicSecretProviders.Clickhouse,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        defaultTTL: "1h",
        maxTTL: "24h",
        usernameTemplate: null,
        metadata: [{ key: "owner", value: "platform" }],
        inputs: {
          host: "clickhouse.example.com",
          port: 8123,
          database: "default",
          username: "admin",
          password: "********",
          ca: "********",
          creationStatement: "CREATE USER '{{username}}'",
          revocationStatement: "DROP USER '{{username}}'"
        }
      }
    };
    const defaults = getClickHouseEditDefaultValues(context);
    assert.equal(defaults.inputs.password, "********");
    assert.equal(defaults.inputs.ca, "********");
    const payload = getClickHouseEditPayload({ ...defaults, name: "renamed-clickhouse" }, context);
    assert.equal(payload.data.newName, "renamed-clickhouse");
    assert.equal((payload.data.inputs as { password: string }).password, "********");
    assert.equal((payload.data.inputs as { ca: string }).ca, "********");
    assert.equal((payload.data.inputs as { gatewayId: null }).gatewayId, null);
    assert.equal((payload.data.inputs as { gatewayPoolId: null }).gatewayPoolId, null);
    assert.equal(payload.data.usernameTemplate, null);
    assert.deepEqual(payload.data.metadata, [{ key: "owner", value: "platform" }]);
  });
});
