import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAwsElastiCacheCreateDefaultValues,
  getAwsMemoryDbCreateDefaultValues,
  getAwsMemoryDbEditDefaultValues
} from "./providerDefinitions/awsManagedStoresContract";
import {
  getCouchbaseCreateDefaultValues,
  getCouchbaseCreatePayload,
  getCouchbaseEditDefaultValues
} from "./providerDefinitions/couchbaseContract";
import {
  getMongoDbCreateDefaultValues,
  getMongoDbCreatePayload,
  getMongoDbEditDefaultValues,
  getMongoDbEditPayload
} from "./providerDefinitions/mongoDbContract";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const environment = { id: "env", name: "Development", slug: "dev", position: 1 };
const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/",
  environments: [environment],
  isSingleEnvironmentMode: true
};
const editContext = (inputs: unknown, metadata?: { key: string; value: string }[]) =>
  ({
    projectSlug: "project",
    secretPath: "/",
    environment: "dev",
    dynamicSecret: {
      name: "existing",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: null,
      inputs,
      metadata
    }
  }) as TEditDynamicSecretProviderFormContext;
describe("managed store provider contracts", () => {
  it("preserves AWS defaults and masked edit hydration", () => {
    const elastic = getAwsElastiCacheCreateDefaultValues(createContext);
    const memory = getAwsMemoryDbCreateDefaultValues(createContext);
    assert.match(elastic.inputs.creationStatement, /AccessString/);
    assert.match(memory.inputs.creationStatement, /AuthenticationMode/);
    const edit = getAwsMemoryDbEditDefaultValues(
      editContext({ auth: { type: "iam", accessKeyId: "id", secretAccessKey: "********" } })
    );
    assert.equal(edit.inputs.auth?.secretAccessKey, "********");
  });
  it("adapts MongoDB role objects and retains masked passwords", () => {
    const values = getMongoDbCreateDefaultValues(createContext);
    Object.assign(values, { name: "mongo" });
    Object.assign(values.inputs, {
      host: "mongo.example.com",
      database: "db",
      username: "admin",
      password: "secret"
    });
    assert.deepEqual(getMongoDbCreatePayload(values, createContext).provider.inputs.roles, [
      "readWrite"
    ]);
    const context = editContext({ host: "mongo", password: "********", roles: ["readWrite"] });
    const hydrated = getMongoDbEditDefaultValues(context);
    assert.deepEqual(hydrated.inputs.roles, [{ roleName: "readWrite" }]);
    assert.equal(
      (getMongoDbEditPayload(hydrated, context).data.inputs as { password?: string }).password,
      "********"
    );
  });
  it("keeps Couchbase simple and advanced bucket payloads distinct", () => {
    const simple = getCouchbaseCreateDefaultValues(createContext);
    simple.name = "couchbase";
    Object.assign(simple.inputs, {
      orgId: "org",
      projectId: "project",
      clusterId: "cluster",
      auth: { apiKey: "secret" }
    });
    assert.equal(getCouchbaseCreatePayload(simple, createContext).provider.inputs.buckets, "*");
    simple.inputs.useAdvancedBuckets = true;
    simple.inputs.buckets = [
      { name: "inventory", scopes: [{ name: "default", collections: ["items"] }] }
    ];
    assert.ok(
      Array.isArray(getCouchbaseCreatePayload(simple, createContext).provider.inputs.buckets)
    );
  });
  it("hydrates Couchbase advanced mode and edit-only metadata without unmasking", () => {
    const context = editContext(
      {
        url: "https://cloudapi.cloud.couchbase.com",
        orgId: "org",
        projectId: "project",
        clusterId: "cluster",
        roles: ["read"],
        buckets: [{ name: "bucket" }],
        auth: { apiKey: "********" }
      },
      [{ key: "owner", value: "platform" }]
    );
    const hydrated = getCouchbaseEditDefaultValues(context);
    assert.equal(hydrated.inputs.useAdvancedBuckets, true);
    assert.equal(hydrated.inputs.auth.apiKey, "********");
    assert.deepEqual(hydrated.metadata, [{ key: "owner", value: "platform" }]);
  });
});
