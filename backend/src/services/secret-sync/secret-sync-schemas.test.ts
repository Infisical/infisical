import { SecretSync, SecretSyncInitialSyncBehavior } from "./secret-sync-enums";
import { BaseSecretSyncSchema, KeySchemaSchema } from "./secret-sync-schemas";

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

  // See RECURSIVE_SYNC_REFINEMENT.
  test("rejects recursive combined with importing from the destination", () => {
    const result = schema.safeParse({
      initialSyncBehavior: SecretSyncInitialSyncBehavior.ImportPrioritizeSource,
      recursive: true
    });

    expect(result.success).toBe(false);
  });
});

describe("KeySchemaSchema", () => {
  test("accepts a schema with the required secretKey placeholder", () => {
    expect(KeySchemaSchema.safeParse("prefix/{{secretKey}}").success).toBe(true);
  });

  test("accepts the optional environment placeholder alongside secretKey", () => {
    expect(KeySchemaSchema.safeParse("{{environment}}/{{secretKey}}").success).toBe(true);
  });

  test("rejects a value missing the secretKey placeholder", () => {
    expect(KeySchemaSchema.safeParse("prefix/no-placeholder").success).toBe(false);
  });

  // The regression this guards: this string used to reach handlebars.compile() unvalidated on
  // the recursive-conflicts preview route, which throws a raw, uncaught Error the moment the
  // compiled template is invoked (getKeyWithSchema in secret-sync-payload.ts).
  test("rejects a syntactically invalid Handlebars template", () => {
    expect(KeySchemaSchema.safeParse("{{").success).toBe(false);
  });

  test("rejects disallowed characters outside the placeholders", () => {
    expect(KeySchemaSchema.safeParse("{{secretKey}}!").success).toBe(false);
  });

  test("is optional", () => {
    expect(KeySchemaSchema.safeParse(undefined).success).toBe(true);
  });
});
