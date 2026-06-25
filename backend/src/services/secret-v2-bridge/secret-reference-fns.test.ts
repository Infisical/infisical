import { describe, expect, it, vi } from "vitest";

import { expandSecretReferencesFactory } from "./secret-reference-fns";

const makeFactory = (secrets: Record<string, string>, knownEnvironments: string[] = ["dev"]) => {
  return expandSecretReferencesFactory({
    projectId: "test-project",
    decryptSecretValue: (val) => (val ? val.toString("utf-8") : ""),
    secretDAL: {
      findByFolderId: vi.fn().mockResolvedValue(
        Object.entries(secrets).map(([key, value]) => ({
          key,
          encryptedValue: Buffer.from(value),
          userId: null,
          tags: []
        }))
      )
    },
    folderDAL: {
      findBySecretPath: vi.fn().mockImplementation((_projectId: string, environment: string) => {
        if (knownEnvironments.includes(environment)) return Promise.resolve({ id: `folder-${environment}` });
        return Promise.resolve(null);
      })
    },
    canExpandValue: () => true
  });
};

describe("expandSecretReferencesFactory", () => {
  it("resolves a simple local reference", async () => {
    const { expandSecretReferences } = makeFactory({ MY_SECRET: "hello" });
    const result = await expandSecretReferences({
      value: "${MY_SECRET}",
      secretPath: "/",
      environment: "dev",
      secretKey: "CONSUMER"
    });
    expect(result).toBe("hello");
  });

  it("resolves a local key containing a dot when no matching environment exists", async () => {
    // Regression test for: secret references fail when key name contains a dot
    // ${MY.SECRET} was incorrectly parsed as env=MY, key=SECRET instead of local key MY.SECRET
    const { expandSecretReferences } = makeFactory({ "MY.SECRET": "dot-value" });
    const result = await expandSecretReferences({
      value: "${MY.SECRET}",
      secretPath: "/",
      environment: "dev",
      secretKey: "CONSUMER"
    });
    expect(result).toBe("dot-value");
  });

  it("resolves a local key with multiple dots when no matching environment exists", async () => {
    const { expandSecretReferences } = makeFactory({ "DB.HOST.PRIMARY": "db.example.com" });
    const result = await expandSecretReferences({
      value: "host=${DB.HOST.PRIMARY}",
      secretPath: "/",
      environment: "dev",
      secretKey: "CONSUMER"
    });
    expect(result).toBe("host=db.example.com");
  });

  it("resolves a cross-environment reference when the environment exists", async () => {
    const { expandSecretReferences } = makeFactory({ PROD_KEY: "prod-value" }, ["dev", "prod"]);
    const result = await expandSecretReferences({
      value: "${prod.PROD_KEY}",
      secretPath: "/",
      environment: "dev",
      secretKey: "CONSUMER"
    });
    expect(result).toBe("prod-value");
  });

  it("leaves the interpolation syntax unchanged when neither cross-env nor local key is found", async () => {
    const { expandSecretReferences } = makeFactory({});
    const result = await expandSecretReferences({
      value: "${NONEXISTENT.KEY}",
      secretPath: "/",
      environment: "dev",
      secretKey: "CONSUMER"
    });
    expect(result).toBe("${NONEXISTENT.KEY}");
  });
});
