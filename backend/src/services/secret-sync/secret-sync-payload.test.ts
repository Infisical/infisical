import { createSecretSyncPayload, findFlattenConflicts, TSecretPayload } from "./secret-sync-payload";

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

  test("flatten({ disableKeySchema: true }) ignores the key schema", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(Object.keys(payload.flatten({ disableKeySchema: true }))).toEqual(["DB_URL"]);
  });

  test("flatten({ disableKeySchema: true }) still rejects a raw-key collision", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(() => payload.flatten({ disableKeySchema: true })).toThrow(/"DB_URL" in \/backend and \/backend\/api/);
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

  test("findConflicts({ disableKeySchema: true }) reports raw-key collisions instead of schema-applied ones", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}"
    });

    expect(payload.findConflicts({ disableKeySchema: true })).toEqual([
      { key: "DB_URL", paths: ["/backend", "/backend/api"] }
    ]);
  });

  test("tolerateConflicts() returns a payload whose flatten() no longer throws", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev"
    });

    expect(() => payload.flatten()).toThrow(/"DB_URL" in \/backend and \/backend\/api/);

    const deduped = payload.tolerateConflicts();

    expect(() => deduped.flatten()).not.toThrow();
    expect(Object.keys(deduped.flatten())).toEqual(["DB_URL"]);
  });

  test("tolerateConflicts() leaves a payload with no conflicts unchanged", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/"), secret("API_KEY", "/api")], {
      environment: "dev"
    });

    expect(payload.tolerateConflicts().secrets).toHaveLength(2);
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

  test("disableKeySchema: true reports raw-key collisions instead of schema-applied ones", () => {
    const conflicts = findFlattenConflicts(
      {
        secrets: [secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")],
        environment: "dev",
        keySchema: "{{environment}}_{{secretKey}}"
      },
      { disableKeySchema: true }
    );

    expect(conflicts).toEqual([{ key: "DB_URL", paths: ["/backend", "/backend/api"] }]);
  });
});

describe("tolerateConflicts", () => {
  test("flatten() keeps the first secret for a name used in two folders", () => {
    const payload = createSecretSyncPayload(
      [secret("DB_URL", "/backend", "one"), secret("DB_URL", "/backend/api", "two")],
      { environment: "dev" }
    ).tolerateConflicts();

    expect(payload.flatten().DB_URL.value).toBe("one");
  });

  test("dedupes by the schema-applied destination key, not the raw name", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/"), secret("dev_DB_URL", "/api")], {
      environment: "dev",
      keySchema: "{{secretKey}}"
    }).tolerateConflicts();

    expect(Object.keys(payload.flatten()).sort()).toEqual(["DB_URL", "dev_DB_URL"]);
  });

  test("keeps every secret, so mirror() still names a same-named secret in each folder", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend"), secret("DB_URL", "/backend/api")], {
      environment: "dev",
      sourcePath: "/backend"
    }).tolerateConflicts();

    expect(payload.secrets).toHaveLength(2);
    expect(Object.keys(payload.mirror()).sort()).toEqual(["DB_URL", "api/DB_URL"]);
  });
});

describe("mirror", () => {
  test("keys each secret by its folder relative to the source path", () => {
    const payload = createSecretSyncPayload(
      [secret("A", "/backend"), secret("B", "/backend/api"), secret("C", "/backend/api/payments")],
      { environment: "dev", sourcePath: "/backend" }
    );

    expect(Object.keys(payload.mirror()).sort()).toEqual(["A", "api/B", "api/payments/C"]);
  });

  test("keeps same-named secrets in different folders apart instead of throwing", () => {
    const payload = createSecretSyncPayload(
      [secret("DB_URL", "/backend", "one"), secret("DB_URL", "/backend/api", "two")],
      { environment: "dev", sourcePath: "/backend" }
    );

    const map = payload.mirror();

    expect(map.DB_URL.value).toBe("one");
    expect(map["api/DB_URL"].value).toBe("two");
  });

  test("applies the key schema to the last segment only", () => {
    const payload = createSecretSyncPayload([secret("DB_URL", "/backend/api")], {
      environment: "dev",
      keySchema: "{{environment}}_{{secretKey}}",
      sourcePath: "/backend"
    });

    expect(Object.keys(payload.mirror())).toEqual(["api/dev_DB_URL"]);
  });

  test("keeps every folder when the source path is the root", () => {
    const payload = createSecretSyncPayload([secret("A", "/"), secret("B", "/api/payments")], { environment: "dev" });

    expect(Object.keys(payload.mirror()).sort()).toEqual(["A", "api/payments/B"]);
  });

  test("ignores a trailing slash on the source path", () => {
    const payload = createSecretSyncPayload([secret("B", "/backend/api")], {
      environment: "dev",
      sourcePath: "/backend/"
    });

    expect(Object.keys(payload.mirror())).toEqual(["api/B"]);
  });
});
