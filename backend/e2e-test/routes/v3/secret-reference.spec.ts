import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretV2, deleteSecretV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

describe("Secret expansion", () => {
  const projectId = seedData1.projectV3.id;

  beforeAll(async () => {
    const prodRootFolder = await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/",
      name: "deep"
    });

    await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/deep",
      name: "nested"
    });

    return async () => {
      await deleteFolder({
        authToken: jwtAuthToken,
        secretPath: "/",
        id: prodRootFolder.id,
        workspaceId: projectId,
        environmentSlug: "prod"
      });
    };
  });

  test("Local secret reference", async () => {
    await createSecretV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "HELLO",
      value: "world"
    });

    await createSecretV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST",
      // eslint-disable-next-line
      value: "hello ${HELLO}"
    });
    //
    // const expandedSecret = await getSecretByNameV2({
    //   environmentSlug: seedData1.environment.slug,
    //   workspaceId: projectId,
    //   secretPath: "/",
    //   authToken: jwtAuthToken,
    //   key: "TEST"
    // });
    // expect(expandedSecret.secretValue).toBe("hello world");

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretKey: "TEST",
          secretValue: "hello world"
        })
      ])
    );

    await deleteSecretV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });

    await deleteSecretV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "HELLO"
    });
  });
});
