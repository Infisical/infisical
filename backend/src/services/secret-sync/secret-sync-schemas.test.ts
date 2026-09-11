import { SecretSync, SecretSyncInitialSyncBehavior } from "./secret-sync-enums";
import { BaseSecretSyncSchema } from "./secret-sync-schemas";

const schema = BaseSecretSyncSchema(SecretSync.Render, { canImportSecrets: true }).shape.syncOptions;

describe("BaseSyncOptionsSchema recursive", () => {
  test("defaults to absent, which means non-recursive", () => {
    const result = schema.safeParse({ initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination });

    expect(result.success).toBe(true);
    expect(result.success && result.data.recursive).toBeUndefined();
  });

  test("accepts recursive with the overwrite behavior", () => {
    const result = schema.safeParse({
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: true
    });

    expect(result.success).toBe(true);
  });

  test("rejects recursive combined with importing from the destination", () => {
    const result = schema.safeParse({
      initialSyncBehavior: SecretSyncInitialSyncBehavior.ImportPrioritizeSource,
      recursive: true
    });

    expect(result.success).toBe(false);
  });
});
