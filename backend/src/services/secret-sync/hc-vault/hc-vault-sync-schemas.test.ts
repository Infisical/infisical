import { CreateHCVaultSyncSchema, HCVaultSyncSchema, UpdateHCVaultSyncSchema } from "./hc-vault-sync-schemas";

const createDestinationConfig = CreateHCVaultSyncSchema.shape.destinationConfig;
const updateDestinationConfig = UpdateHCVaultSyncSchema.shape.destinationConfig;
const responseDestinationConfig = HCVaultSyncSchema.shape.destinationConfig;

const issueMessages = (result: ReturnType<typeof createDestinationConfig.safeParse>) =>
  result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

describe("HashiCorp Vault sync destination config", () => {
  test("accepts a nested path and trims its outer slashes", () => {
    const result = createDestinationConfig.safeParse({ mount: "apps/kv", path: "/team/app.v1/db/" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ mount: "apps/kv", path: "team/app.v1/db" });
  });

  test.each(["..", "../other", "app/../../b", "app/./db", "app/."])("refuses the path '%s'", (path) => {
    const result = createDestinationConfig.safeParse({ mount: "kv", path });

    expect(issueMessages(result)).toContain("path: Path cannot contain '.' or '..' segments.");
  });

  test.each(["app/%2e%2e/other", "app%2F..%2Fother"])("refuses the percent-encoded path '%s'", (path) => {
    expect(createDestinationConfig.safeParse({ mount: "kv", path }).success).toBe(false);
  });

  test.each(["..", "kv/..", "../other", "kv/.", "%2e%2e", "kv/%2E%2e", "kv%2f..%2fother"])(
    "refuses the mount '%s'",
    (mount) => {
      const result = createDestinationConfig.safeParse({ mount, path: "app" });

      expect(issueMessages(result)).toContain("mount: Secrets Engine Mount cannot contain '.' or '..' segments.");
    }
  );

  test("applies the same checks on update and still allows omitting the config", () => {
    expect(updateDestinationConfig.safeParse(undefined).success).toBe(true);
    expect(updateDestinationConfig.safeParse({ mount: "kv", path: "app/../../b" }).success).toBe(false);
    expect(updateDestinationConfig.safeParse({ mount: "kv/..", path: "app" }).success).toBe(false);
    expect(updateDestinationConfig.safeParse({ mount: "kv", path: "app/db" }).success).toBe(true);
  });

  test("still parses a stored config with a dot segment in the response schema", () => {
    expect(responseDestinationConfig.safeParse({ mount: "kv/..", path: "app/.." }).success).toBe(true);
  });
});
