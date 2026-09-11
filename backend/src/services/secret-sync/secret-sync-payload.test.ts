import {
  createSecretSyncPayload,
  dedupeEntriesByDestinationKey,
  findFlattenConflicts,
  TSecretPayload
} from "./secret-sync-payload";

const secret = (key: string, path: string, value = "v"): TSecretPayload => ({ key, path, value });

describe("createSecretSyncPayload", () => {
  test("secrets includes every secret, including ones that share a name", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/"), secret("DB_URL", "/api")], {
      environment: "dev"
    });

    expect(payload.secrets).toHaveLength(2);
  });

  test("flatten() returns one entry per secret when names are unique", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/", "one"), secret("API_KEY", "/api", "two")], {
      environment: "dev"
    });

    expect(payload.flatten()).toEqual({
      DB_URL: { value: "one", id: undefined, comment: undefined, secretMetadata: undefined },
      API_KEY: { value: "two", id: undefined, comment: undefined, secretMetadata: undefined }
    });
  });

  test("flatten() throws naming both folders when a name appears twice", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev"
    });

    expect(() => payload.flatten()).toThrow(/"DB_URL" in \/backend and \/backend\/api/);
  });

  test("flatten() reports every conflict in one throw, capped at five with a remainder count", () => {
    const secrets = Array.from({ length: 7 }, (_, i) => [secret(`K${i}`, "/"), secret(`K${i}`, "/api")]).flat();
    const payload = createSecretSyncPayload(secrets, { environment: "dev" });

    let message = "";
    try {
      payload.flatten();
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain("K0");
    expect(message).toContain("K4");
    expect(message).not.toContain("K5");
    expect(message).toContain("and 2 more");
  });

  test("flatten() applies the key schema to destination keys", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(Object.keys(payload.flatten())).toEqual(["dev_DB_URL"]);
  });

  test("flatten({ applySchema: false }) ignores the key schema", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(Object.keys(payload.flatten({ applySchema: false }))).toEqual(["DB_URL"]);
  });

  test("flatten({ applySchema: false }) still rejects a raw-key collision", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(() => payload.flatten({ applySchema: false })).toThrow(/"DB_URL" in \/backend and \/backend\/api/);
  });

  test("flatten() does not treat a name that only resembles a schema-prefixed one as a conflict", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/"), secret("dev_DB_URL", "/api")], {
      environment: "dev",
      keySchema: "{{secretKey}}"
    });

    expect(() => payload.flatten()).not.toThrow();
  });

  test("findConflicts() reports the same collisions as flatten() throws, without throwing", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev"
    });

    expect(payload.findConflicts()).toEqual([{ key: "DB_URL", paths: ["/backend", "/backend/api"] }]);
  });

  test("findConflicts() returns an empty array when there are no conflicts", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/")], { environment: "dev" });

    expect(payload.findConflicts()).toEqual([]);
  });

  test("findConflicts({ applySchema: false }) reports raw-key collisions instead of schema-applied ones", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(payload.findConflicts({ applySchema: false })).toEqual([
      { key: "DB_URL", paths: ["/backend", "/backend/api"] }
    ]);
  });
});

describe("findFlattenConflicts", () => {
  test("returns every conflict, uncapped, unlike flatten()'s thrown message", () => {
    const secrets = Array.from({ length: 7 }, (_, i) => [secret(`K${i}`, "/"), secret(`K${i}`, "/api")]).flat();

    const conflicts = findFlattenConflicts({ secrets, environment: "dev" });

    expect(conflicts).toHaveLength(7);
    expect(conflicts.map((c) => c.key).sort()).toEqual(["K0", "K1", "K2", "K3", "K4", "K5", "K6"]);
  });

  test("reports the destination key and every path it appears in", () => {
    const conflicts = findFlattenConflicts({
      secrets: [secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")],
      environment: "dev"
    });

    expect(conflicts).toEqual([{ key: "DB_URL", paths: ["/backend", "/backend/api"] }]);
  });

  test("returns an empty array when there are no conflicts", () => {
    expect(findFlattenConflicts({ secrets: [secret("DB_URL", "/")], environment: "dev" })).toEqual([]);
  });

  test("applySchema: false reports raw-key collisions instead of schema-applied ones", () => {
    const conflicts = findFlattenConflicts(
      {
        secrets: [secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")],
        environment: "dev",
        keySchema: "{{environment}}_{{secretKey}}"
      },
      { applySchema: false }
    );

    expect(conflicts).toEqual([{ key: "DB_URL", paths: ["/backend", "/backend/api"] }]);
  });
});

describe("dedupeEntriesByDestinationKey", () => {
  test("keeps one entry per destination key when two folders share a name", () => {
    const deduped = dedupeEntriesByDestinationKey([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev"
    });

    expect(deduped).toHaveLength(1);
  });

  test("leaves distinct names untouched", () => {
    const deduped = dedupeEntriesByDestinationKey([secret("DB_URL", "/"), secret("API_KEY", "/api")], {
      environment: "dev"
    });

    expect(deduped.map((entry) => entry.key).sort()).toEqual(["API_KEY", "DB_URL"]);
  });

  test("dedupes by the schema-applied destination key, not the raw name", () => {
    const deduped = dedupeEntriesByDestinationKey([secret("DB_URL", "/"), secret("dev_DB_URL", "/api")], {
      environment: "dev",
      keySchema: "{{secretKey}}"
    });

    expect(deduped).toHaveLength(2);
  });

  test("the deduped result never conflicts when flattened", () => {
    const entries = [secret("DB_URL", "/backend", "one"), secret("DB_URL", "/backend/api", "two")];
    const deduped = dedupeEntriesByDestinationKey(entries, { environment: "dev" });
    const payload = createSecretSyncPayload(deduped, { environment: "dev" });

    expect(() => payload.flatten()).not.toThrow();
  });
});
