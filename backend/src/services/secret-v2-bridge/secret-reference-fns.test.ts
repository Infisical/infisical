import { expandSecretReferencesFactory, getAllSecretReferences } from "./secret-reference-fns";

const makeFolderDAL = (folders: Record<string, string>) => ({
  findBySecretPath: vi.fn().mockImplementation((_projectId: string, env: string, secretPath: string) => {
    const id = folders[`${env}:${secretPath}`];
    return id ? Promise.resolve({ id }) : Promise.resolve(undefined);
  })
});

const makeSecretDAL = (secretsByFolder: Record<string, Array<{ key: string; value: string }>>) => ({
  findByFolderId: vi.fn().mockImplementation(({ folderId }: { folderId: string }) =>
    Promise.resolve(
      (secretsByFolder[folderId] ?? []).map((s) => ({
        key: s.key,
        encryptedValue: Buffer.from(s.value),
        tags: []
      }))
    )
  )
});

const makeFactoryDeps = (overrides?: { canExpandValue?: () => boolean }) => ({
  projectId: "p1",
  decryptSecretValue: (buf?: Buffer | null) => (buf ? buf.toString() : undefined),
  canExpandValue: overrides?.canExpandValue ?? (() => true),
  userId: undefined as string | undefined
});

/* eslint-disable no-template-curly-in-string */
describe("getAllSecretReferences", () => {
  test("classifies single-token references as local", () => {
    const { localReferences, nestedReferences } = getAllSecretReferences("hello ${HELLO}");
    expect(localReferences).toEqual(["HELLO"]);
    expect(nestedReferences).toEqual([]);
  });

  test("classifies multi-token references as nested with env/path/key split", () => {
    const { nestedReferences } = getAllSecretReferences("${prod.deep.nested.KEY}");
    expect(nestedReferences).toEqual([{ environment: "prod", secretPath: "/deep/nested", secretKey: "KEY" }]);
  });
});

describe("expandSecretReferencesFactory", () => {
  /**
   * @see https://github.com/Infisical/infisical/issues/5962
   */
  test("resolves a local secret whose name contains a dot before falling back to env.path.key", async () => {
    const folderDAL = makeFolderDAL({ "dev:/": "folder-dev-root" });
    const secretDAL = makeSecretDAL({
      "folder-dev-root": [
        { key: "Secret.Reference", value: "test" },
        // eslint-disable-next-line no-template-curly-in-string
        { key: "Secret_Test", value: "${Secret.Reference}" }
      ]
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      ...makeFactoryDeps(),
      folderDAL: folderDAL as never,
      secretDAL: secretDAL as never
    });

    const expanded = await expandSecretReferences({
      // eslint-disable-next-line no-template-curly-in-string
      value: "${Secret.Reference}",
      environment: "dev",
      secretPath: "/",
      secretKey: "Secret_Test"
    });

    expect(expanded).toBe("test");
  });

  test("still resolves nested env.path.key references when no local dotted name exists", async () => {
    const folderDAL = makeFolderDAL({
      "dev:/": "folder-dev-root",
      "prod:/": "folder-prod-root"
    });
    const secretDAL = makeSecretDAL({
      "folder-prod-root": [{ key: "API_KEY", value: "prod-secret" }],
      "folder-dev-root": [
        // eslint-disable-next-line no-template-curly-in-string
        { key: "DEV_REF", value: "${prod.API_KEY}" }
      ]
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      ...makeFactoryDeps(),
      folderDAL: folderDAL as never,
      secretDAL: secretDAL as never
    });

    const expanded = await expandSecretReferences({
      // eslint-disable-next-line no-template-curly-in-string
      value: "${prod.API_KEY}",
      environment: "dev",
      secretPath: "/",
      secretKey: "DEV_REF"
    });

    expect(expanded).toBe("prod-secret");
  });

  test("prefers the local dotted match over a coincidental nested env match", async () => {
    // Both interpretations are valid here:
    //   - local secret literally named "prod.API_KEY" in dev
    //   - nested ref to env=prod, secret=API_KEY at root
    // The local match must win to match the issue's expected behavior.
    const folderDAL = makeFolderDAL({
      "dev:/": "folder-dev-root",
      "prod:/": "folder-prod-root"
    });
    const secretDAL = makeSecretDAL({
      "folder-dev-root": [{ key: "prod.API_KEY", value: "local-wins" }],
      "folder-prod-root": [{ key: "API_KEY", value: "nested-loses" }]
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      ...makeFactoryDeps(),
      folderDAL: folderDAL as never,
      secretDAL: secretDAL as never
    });

    const expanded = await expandSecretReferences({
      // eslint-disable-next-line no-template-curly-in-string
      value: "${prod.API_KEY}",
      environment: "dev",
      secretPath: "/",
      secretKey: "consumer"
    });

    expect(expanded).toBe("local-wins");
  });
});
