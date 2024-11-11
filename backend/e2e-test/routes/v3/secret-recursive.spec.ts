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

  beforeAll(async () => {
    const rootFolderIds: string[] = [];
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

      await deleteSecretV2({
        authToken: jwtAuthToken,
        secretPath: "/",
        workspaceId: projectId,
        environmentSlug: "prod",
        key: folderAndSecretNames[0].name
      });
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
