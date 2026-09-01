import { buildVaultFolderImportPlan } from "./vault";

describe("buildVaultFolderImportPlan", () => {
  test("strips the mount and nests the remaining segments under the destination path", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "kv",
      secretsPerPath: [{ vaultSecretPath: "kv/app/prod/db", secrets: { DB_USER: "admin", DB_PORT: 5432 } }]
    });

    expect(plan).toEqual([
      {
        folderPath: "/imports/app/prod/db",
        vaultSecretPath: "kv/app/prod/db",
        secrets: [
          { secretKey: "DB_USER", secretValue: "admin" },
          { secretKey: "DB_PORT", secretValue: "5432" }
        ]
      }
    ]);
  });

  test("strips every segment of a nested mount", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "apps/kv",
      secretsPerPath: [{ vaultSecretPath: "apps/kv/prod/db", secrets: { DB_USER: "admin" } }]
    });

    expect(plan).toEqual([
      {
        folderPath: "/imports/prod/db",
        vaultSecretPath: "apps/kv/prod/db",
        secrets: [{ secretKey: "DB_USER", secretValue: "admin" }]
      }
    ]);
  });

  test("accepts a mount path carrying the trailing slash vault reports", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "apps/kv/",
      secretsPerPath: [{ vaultSecretPath: "apps/kv/prod/db", secrets: {} }]
    });

    expect(plan[0].folderPath).toBe("/imports/prod/db");
  });

  test("treats the project root as the destination path", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/",
      mountPath: "kv",
      secretsPerPath: [{ vaultSecretPath: "kv/db", secrets: { KEY: "value" } }]
    });

    expect(plan[0].folderPath).toBe("/db");
  });

  test("gives every vault path its own folder within the one mount", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "kv",
      secretsPerPath: [
        { vaultSecretPath: "kv/app/db", secrets: { DB_USER: "admin" } },
        { vaultSecretPath: "kv/app/db/replica", secrets: { DB_USER: "reader" } }
      ]
    });

    expect(plan).toEqual([
      {
        folderPath: "/imports/app/db",
        vaultSecretPath: "kv/app/db",
        secrets: [{ secretKey: "DB_USER", secretValue: "admin" }]
      },
      {
        folderPath: "/imports/app/db/replica",
        vaultSecretPath: "kv/app/db/replica",
        secrets: [{ secretKey: "DB_USER", secretValue: "reader" }]
      }
    ]);
  });

  test("keeps the same key in sibling folders", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "kv",
      secretsPerPath: [
        { vaultSecretPath: "kv/app/web", secrets: { PORT: "8080" } },
        { vaultSecretPath: "kv/app/api", secrets: { PORT: "9090" } }
      ]
    });

    expect(plan.map((unit) => unit.folderPath)).toEqual(["/imports/app/web", "/imports/app/api"]);
  });

  test("rejects vault segments that cannot become folder names", () => {
    expect(() =>
      buildVaultFolderImportPlan({
        secretPath: "/imports",
        mountPath: "kv",
        secretsPerPath: [
          { vaultSecretPath: "kv/my.app/db", secrets: {} },
          { vaultSecretPath: "kv/my app/db", secrets: {} },
          { vaultSecretPath: "kv/fine/db", secrets: {} }
        ]
      })
    ).toThrowError(/'kv\/my\.app\/db', 'kv\/my app\/db'/);
  });

  test("rejects a request that selects paths from more than one secrets engine", () => {
    expect(() =>
      buildVaultFolderImportPlan({
        secretPath: "/imports",
        mountPath: "kv",
        secretsPerPath: [
          { vaultSecretPath: "kv/new-path", secrets: { DB_USER: "admin" } },
          { vaultSecretPath: "kv-2/new-path", secrets: { DB_USER: "root" } }
        ]
      })
    ).toThrowError(/not inside the 'kv' secrets engine: 'kv-2\/new-path'/);
  });

  test("tells sibling nested mounts apart", () => {
    expect(() =>
      buildVaultFolderImportPlan({
        secretPath: "/imports",
        mountPath: "apps/kv1",
        secretsPerPath: [
          { vaultSecretPath: "apps/kv1/db", secrets: { DB_USER: "admin" } },
          { vaultSecretPath: "apps/kv2/db", secrets: { DB_USER: "root" } }
        ]
      })
    ).toThrowError(/not inside the 'apps\/kv1' secrets engine: 'apps\/kv2\/db'/);
  });

  test("accepts a nested mount whose leading segment matches another engine", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "apps/kv2",
      secretsPerPath: [{ vaultSecretPath: "apps/kv2/db", secrets: { DB_USER: "root" } }]
    });

    expect(plan[0].folderPath).toBe("/imports/db");
  });

  test("rejects a vault path holding only a mount", () => {
    expect(() =>
      buildVaultFolderImportPlan({
        secretPath: "/imports",
        mountPath: "kv",
        secretsPerPath: [{ vaultSecretPath: "kv", secrets: { KEY: "value" } }]
      })
    ).toThrowError(/only a mount/);
  });

  test("rejects a vault path holding only a nested mount", () => {
    expect(() =>
      buildVaultFolderImportPlan({
        secretPath: "/imports",
        mountPath: "apps/kv",
        secretsPerPath: [{ vaultSecretPath: "apps/kv", secrets: { KEY: "value" } }]
      })
    ).toThrowError(/only a mount/);
  });

  // TODO: CHECK THIS
  test("keeps the folder for an empty vault entry but plans no secrets", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "kv",
      secretsPerPath: [{ vaultSecretPath: "kv/app/empty", secrets: {} }]
    });

    expect(plan).toEqual([{ folderPath: "/imports/app/empty", vaultSecretPath: "kv/app/empty", secrets: [] }]);
  });

  test("stringifies non-string vault values", () => {
    const plan = buildVaultFolderImportPlan({
      secretPath: "/imports",
      mountPath: "kv",
      secretsPerPath: [
        {
          vaultSecretPath: "kv/app/types",
          secrets: { NULLED: null, FLAG: true, NESTED: { a: 1 }, LIST: [1, "two"] }
        }
      ]
    });

    expect(plan[0].secrets).toEqual([
      { secretKey: "NULLED", secretValue: "" },
      { secretKey: "FLAG", secretValue: "true" },
      { secretKey: "NESTED", secretValue: '{"a":1}' },
      { secretKey: "LIST", secretValue: '[1,"two"]' }
    ]);
  });
});
