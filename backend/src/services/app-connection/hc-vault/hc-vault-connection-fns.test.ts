import { BadRequestError } from "@app/lib/errors";

import { resolveKvMount, resolveVaultSecretPathWithinMount } from "./hc-vault-connection-fns";
import { THCVaultMount } from "./hc-vault-connection-types";

const kvMount = (overrides: Partial<THCVaultMount> = {}): THCVaultMount => ({
  path: "kv/",
  type: "kv",
  version: "2",
  ...overrides
});

describe("resolveKvMount", () => {
  test("resolves the declared engine and reports its kv version", () => {
    const result = resolveKvMount("kv", [kvMount()]);

    expect(result).toEqual({
      mountSegments: ["kv"],
      mountUrlPath: "kv",
      kvVersion: "2"
    });
  });

  test("treats a kv v1 engine as version 1", () => {
    expect(resolveKvMount("kv", [kvMount({ version: null })]).kvVersion).toBe("1");
  });

  test("resolves a nested engine without matching its parent segment", () => {
    const appsKvMount = kvMount({ path: "apps/kv/" });
    const result = resolveKvMount("apps/kv", [kvMount({ path: "apps/" }), appsKvMount]);

    expect(result.mountSegments).toEqual(["apps", "kv"]);
    expect(result.mountUrlPath).toBe("apps/kv");
  });

  test("accepts the declared engine with the trailing slash vault reports", () => {
    expect(resolveKvMount("apps/kv/", [kvMount({ path: "apps/kv/" })]).mountUrlPath).toBe("apps/kv");
  });

  test("does not resolve a sibling engine sharing the leading segment", () => {
    expect(() => resolveKvMount("apps/kv1", [kvMount({ path: "apps/kv2/" })])).toThrowError(
      /Secrets engine 'apps\/kv1' was not found/
    );
  });

  test("rejects an engine that does not hold secrets", () => {
    expect(() => resolveKvMount("db", [kvMount({ path: "db/", type: "database" })])).toThrowError(BadRequestError);
    expect(() => resolveKvMount("db", [kvMount({ path: "db/", type: "database" })])).toThrowError(
      /is a 'database' engine\. Only KV secrets engines/
    );
  });

  test("URI-encodes each segment of the mount path without escaping the separator", () => {
    const result = resolveKvMount("team#1/kv", [kvMount({ path: "team#1/kv/" })]);

    expect(result.mountUrlPath).toBe("team%231/kv");
  });
});

describe("resolveVaultSecretPathWithinMount", () => {
  test("returns the path inside the engine", () => {
    expect(resolveVaultSecretPathWithinMount("kv/app/db", ["kv"])).toBe("app/db");
  });

  test("strips every segment of a nested engine", () => {
    expect(resolveVaultSecretPathWithinMount("apps/kv/prod/db", ["apps", "kv"])).toBe("prod/db");
  });

  test("throws when the path sits outside the engine", () => {
    expect(() => resolveVaultSecretPathWithinMount("other/app/db", ["kv"])).toThrowError(BadRequestError);
    expect(() => resolveVaultSecretPathWithinMount("other/app/db", ["kv"])).toThrowError(
      /Vault path 'other\/app\/db' is not inside the 'kv' secrets engine/
    );
  });

  test("throws when the path points at the engine itself", () => {
    expect(() => resolveVaultSecretPathWithinMount("apps/kv", ["apps", "kv"])).toThrowError(
      /points at the 'apps\/kv' secrets engine itself/
    );
  });
});
