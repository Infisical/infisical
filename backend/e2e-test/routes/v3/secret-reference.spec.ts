import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import { createSecretV2, deleteSecretV2, getSecretByNameV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

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
    const secrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "HELLO",
        value: "world"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "TEST",
        // eslint-disable-next-line
        value: "hello ${HELLO}"
      }
    ];

    await Promise.all(secrets.map((el) => createSecretV2(el)));

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });
    expect(expandedSecret.secretValue).toBe("hello world");

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

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

  test("Cross environment secret reference", async () => {
    const secrets = [
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep",
        authToken: jwtAuthToken,
        key: "DEEP_KEY_1",
        value: "testing"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_1",
        value: "reference"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_2",
        // eslint-disable-next-line
        value: "secret ${NESTED_KEY_1}"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "KEY",
        // eslint-disable-next-line
        value: "hello ${prod.deep.DEEP_KEY_1} ${prod.deep.nested.NESTED_KEY_2}"
      }
    ];

    await Promise.all(secrets.map((el) => createSecretV2(el)));

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "KEY"
    });
    expect(expandedSecret.secretValue).toBe("hello testing secret reference");

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretKey: "KEY",
          secretValue: "hello testing secret reference"
        })
      ])
    );

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

  test("Non replicated secret import secret expansion on local reference and nested reference", async () => {
    const secrets = [
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep",
        authToken: jwtAuthToken,
        key: "DEEP_KEY_1",
        value: "testing"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_1",
        value: "reference"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_2",
        // eslint-disable-next-line
        value: "secret ${NESTED_KEY_1} ${prod.deep.DEEP_KEY_1}"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "KEY",
        // eslint-disable-next-line
        value: "hello world"
      }
    ];

    await Promise.all(secrets.map((el) => createSecretV2(el)));
    const secretImportFromProdToDev = await createSecretImport({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      importEnv: "prod",
      importPath: "/deep/nested"
    });

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretPath: "/deep/nested",
          environment: "prod",
          secrets: expect.arrayContaining([
            expect.objectContaining({
              secretKey: "NESTED_KEY_1",
              secretValue: "reference"
            }),
            expect.objectContaining({
              secretKey: "NESTED_KEY_2",
              secretValue: "secret reference testing"
            })
          ])
        })
      ])
    );

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
    await deleteSecretImport({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      authToken: jwtAuthToken,
      id: secretImportFromProdToDev.id,
      secretPath: "/"
    });
  });

  test(
    "Replicated secret import secret expansion on local reference and nested reference",
    async () => {
      const secrets = [
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep",
          authToken: jwtAuthToken,
          key: "DEEP_KEY_1",
          value: "testing"
        },
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep/nested",
          authToken: jwtAuthToken,
          key: "NESTED_KEY_1",
          value: "reference"
        },
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep/nested",
          authToken: jwtAuthToken,
          key: "NESTED_KEY_2",
          // eslint-disable-next-line
          value: "secret ${NESTED_KEY_1} ${prod.deep.DEEP_KEY_1}"
        },
        {
          environmentSlug: seedData1.environment.slug,
          workspaceId: projectId,
          secretPath: "/",
          authToken: jwtAuthToken,
          key: "KEY",
          // eslint-disable-next-line
          value: "hello world"
        }
      ];

      await Promise.all(secrets.map((el) => createSecretV2(el)));
      const secretImportFromProdToDev = await createSecretImport({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        importEnv: "prod",
        importPath: "/deep/nested",
        isReplication: true
      });

      // wait for 5 second for  replication to finish
      await new Promise((resolve) => {
        setTimeout(resolve, 5000); // time to breathe for db
      });

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken
      });
      expect(listSecrets.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretPath: `/__reserve_replication_${secretImportFromProdToDev.id}`,
            environment: seedData1.environment.slug,
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "NESTED_KEY_1",
                secretValue: "reference"
              }),
              expect.objectContaining({
                secretKey: "NESTED_KEY_2",
                secretValue: "secret reference testing"
              })
            ])
          })
        ])
      );

      await Promise.all(secrets.map((el) => deleteSecretV2(el)));
      await deleteSecretImport({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        authToken: jwtAuthToken,
        id: secretImportFromProdToDev.id,
        secretPath: "/"
      });
    },
    { timeout: 10000 }
  );
});
