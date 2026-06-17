import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

import { createFolder, deleteFolder } from "../../testUtils/folders";

const createRawSecret = async (dto: { path: string; key: string; value: string; type?: SecretType }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: dto.type || SecretType.Shared,
      secretPath: dto.path,
      secretValue: dto.value
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().secret as { id: string; secretKey: string };
};

// counts every secrets_v2 row (shared + personal overrides) for a given key in a folder
const countSecretRows = async (folderId: string, key: string): Promise<number> => {
  // @ts-expect-error testDb is injected as a global by the knex test environment
  const rows = await globalThis.testDb("secrets_v2").where({ folderId, key });
  return rows.length;
};

describe("Move secrets with personal overrides", async () => {
  let destFolderId = "";
  const destPath = "/move-personal-override-dest";

  beforeAll(async () => {
    const folder = await createFolder({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      name: "move-personal-override-dest",
      authToken: jwtAuthToken
    });
    destFolderId = folder.id;
  });

  afterAll(async () => {
    await deleteFolder({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      id: destFolderId,
      authToken: jwtAuthToken
    });
  });

  test("removes the personal override from the source folder after moving the shared secret", async () => {
    const key = "MOVE_OVERRIDE_SEC";

    await createRawSecret({ path: "/", key, value: "shared-value" });
    await createRawSecret({ path: "/", key, value: "personal-value", type: SecretType.Personal });

    // @ts-expect-error testDb is injected as a global by the knex test environment
    const sharedRow = await globalThis
      .testDb("secrets_v2")
      .where({ key, type: SecretType.Shared })
      .whereNull("userId")
      .first();

    const sourceFolderId = sharedRow.folderId as string;

    // the source folder holds both the shared secret and the personal override
    expect(await countSecretRows(sourceFolderId, key)).toBe(2);

    const moveRes = await testServer.inject({
      method: "POST",
      url: `/api/v4/secrets/move`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId: seedData1.projectV3.id,
        sourceEnvironment: seedData1.environment.slug,
        sourceSecretPath: "/",
        destinationEnvironment: seedData1.environment.slug,
        destinationSecretPath: destPath,
        secretIds: [sharedRow.id]
      }
    });
    expect(moveRes.statusCode).toBe(200);

    // the source folder must retain neither the shared secret nor its orphaned personal override
    expect(await countSecretRows(sourceFolderId, key)).toBe(0);
    // the shared secret should now live in the destination folder
    expect(await countSecretRows(destFolderId, key)).toBe(1);
  });
});
