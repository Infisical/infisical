import { BadRequestError } from "@app/lib/errors";

import { getVaultKvSecretUrl, resolveKvMount, resolveVaultSecretPathWithinMount } from "./hc-vault-connection-fns";
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

  test("accepts a legacy 'generic' engine as kv version 1", () => {
    expect(resolveKvMount("legacy", [kvMount({ path: "legacy/", type: "generic", version: null })])).toEqual({
      mountSegments: ["legacy"],
      mountUrlPath: "legacy",
      kvVersion: "1"
    });
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

  test.each(["kv/..", "../kv", "kv/.", "%2e%2e", "kv/%2E%2e"])("refuses the dot segment in mount '%s'", (mountPath) => {
    expect(() => resolveKvMount(mountPath, [kvMount()])).toThrowError(BadRequestError);
    expect(() => resolveKvMount(mountPath, [kvMount()])).toThrowError(/cannot contain '\.' or '\.\.' path segments/);
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

  test.each([
    "kv/../other",
    "kv/app/../../b",
    "kv/app/./db",
    "kv/app/..",
    "kv/%2e%2e/%2e%2e/other",
    "kv/.%2e/.%2E/other",
    "kv/app%2f..%2f..%2fother",
    "kv\\..\\..\\other"
  ])("refuses the dot segment in '%s'", (secretPath) => {
    expect(() => resolveVaultSecretPathWithinMount(secretPath, ["kv"])).toThrowError(BadRequestError);
    expect(() => resolveVaultSecretPathWithinMount(secretPath, ["kv"])).toThrowError(
      /cannot contain '\.' or '\.\.' path segments/
    );
  });

  test.each(["kv/..#x", "kv/..?x", "kv/.. ", "kv/app/..#"])(
    "refuses a dot segment that ends at a query, fragment or trailing whitespace in %j",
    (secretPath) => {
      expect(() => resolveVaultSecretPathWithinMount(secretPath, ["kv"])).toThrowError(BadRequestError);
    }
  );

  test("keeps dots that are part of a segment name", () => {
    expect(resolveVaultSecretPathWithinMount("kv/app.v1/.env", ["kv"])).toBe("app.v1/.env");
  });

  test("throws when the path points at the engine itself", () => {
    expect(() => resolveVaultSecretPathWithinMount("apps/kv", ["apps", "kv"])).toThrowError(
      /points at the 'apps\/kv' secrets engine itself/
    );
  });
});

describe("getVaultKvSecretUrl", () => {
  const INSTANCE_URL = "https://vault.example.com";
  const kvV2 = { mountSegments: ["kv"], mountUrlPath: "kv", kvVersion: "2" as const };
  const kvV1 = { mountSegments: ["kv"], mountUrlPath: "kv", kvVersion: "1" as const };

  test("reads KV v2 secrets under the data prefix and KV v1 secrets directly", () => {
    expect(getVaultKvSecretUrl(INSTANCE_URL, kvV2, "kv/team/app")).toBe(
      "https://vault.example.com/v1/kv/data/team/app"
    );
    expect(getVaultKvSecretUrl(INSTANCE_URL, kvV1, "kv/team/app")).toBe("https://vault.example.com/v1/kv/team/app");
  });

  test.each(["kv/team app", "kv/caf\u00e9", "kv/a%23b", "kv/a%3Fb"])("accepts %j", (secretPath) => {
    expect(getVaultKvSecretUrl(INSTANCE_URL, kvV1, secretPath)).toBe(`https://vault.example.com/v1/${secretPath}`);
  });

  test.each(["kv/app#x", "kv/app?x", "kv/app ", "kv/a\\b", "kv/a\tb"])("refuses %j", (secretPath) => {
    expect(() => getVaultKvSecretUrl(INSTANCE_URL, kvV2, secretPath)).toThrowError(BadRequestError);
    expect(() => getVaultKvSecretUrl(INSTANCE_URL, kvV2, secretPath)).toThrowError(/cannot contain '\?', '#'/);
  });
});
