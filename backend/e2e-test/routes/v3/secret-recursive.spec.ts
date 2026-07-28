import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretV2, deleteSecretV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

describe("Secret Recursive Testing", async () => {
  const projectId = seedData1.projectV3.id;
  const folderAndSecretNames = [
    { name: "deep1", path: "/", expectedSecretCount: 4 },
    { name: "deep21", path: "/deep1", expectedSecretCount: 2 },
    { name: "deep3", path: "/deep1/deep2", expectedSecretCount: 1 },
    { name: "deep22", path: "/deep2", expectedSecretCount: 1 }
  ];

  // Top-level folder of every fixture path. Deleting these cascades to their
  // descendants, so they're the only ids cleanup needs.
  //
  // Some are created *implicitly*: `createFolder` auto-creates missing parents,
  // so asking for folder "deep22" at path "/deep2" also creates "/deep2" — and
  // that id is never returned to us. Deriving roots from the fixture paths
  // (rather than only recording folders created at "/") is what stops those
  // from being orphaned in the shared project's prod environment, where this
  // very spec asserts on exact recursive secret counts.
  const rootFolderNames = [
    ...new Set(folderAndSecretNames.map(({ name, path }) => (path === "/" ? name : path.split("/").filter(Boolean)[0])))
  ];

  beforeAll(async () => {
    const rootFolderIds: string[] = [];

    // Create the implicit roots up front so cleanup has an id for each. Roots a
    // fixture entry already creates at "/" are skipped — creating them twice
    // would fail on the duplicate name.
    const explicitRootNames = new Set(folderAndSecretNames.filter(({ path }) => path === "/").map(({ name }) => name));
    for (const name of rootFolderNames.filter((n) => !explicitRootNames.has(n))) {
      // eslint-disable-next-line no-await-in-loop
      const createdRoot = await createFolder({
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/",
        name
      });
      rootFolderIds.push(createdRoot.id);
    }

    for (const folder of folderAndSecretNames) {
      // eslint-disable-next-line no-await-in-loop
      const createdFolder = await createFolder({
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: folder.path,
        name: folder.name
      });

      if (folder.path === "/") {
        rootFolderIds.push(createdFolder.id);
      }
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        secretPath: folder.path,
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        key: folder.name,
        value: folder.name
      });
    }

    return async () => {
      await Promise.all(
        rootFolderIds.map((id) =>
          deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id,
            workspaceId: projectId,
            environmentSlug: "prod"
          })
        )
      );

      // Secrets living at "/" aren't covered by any folder delete above.
      await Promise.all(
        folderAndSecretNames
          .filter(({ path }) => path === "/")
          .map(({ name }) =>
            deleteSecretV2({
              authToken: jwtAuthToken,
              secretPath: "/",
              workspaceId: projectId,
              environmentSlug: "prod",
              key: name
            })
          )
      );
    };
  });

  test.each(folderAndSecretNames)("$path recursive secret fetching", async ({ path, expectedSecretCount }) => {
    const secrets = await getSecretsV2({
      authToken: jwtAuthToken,
      secretPath: path,
      workspaceId: projectId,
      environmentSlug: "prod",
      recursive: true
    });

    expect(secrets.secrets.length).toEqual(expectedSecretCount);
    expect(secrets.secrets.sort((a, b) => a.secretKey.localeCompare(b.secretKey))).toEqual(
      folderAndSecretNames
        .filter((el) => el.path.startsWith(path))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((el) =>
          expect.objectContaining({
            secretKey: el.name,
            secretValue: el.name
          })
        )
    );
  });
});
