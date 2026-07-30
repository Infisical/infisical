import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import {
  createSecretV2,
  deleteSecretV2,
  getSecretByNameV2,
  getSecretsV2,
  waitForReplicatedSecret
} from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

describe("Secret expansion", () => {
  const projectId = seedData1.projectV3.id;

  const createdSecrets: Parameters<typeof deleteSecretV2>[0][] = [];
  const createdImports: Parameters<typeof deleteSecretImport>[0][] = [];

  const createTrackedSecret = async (dto: Parameters<typeof createSecretV2>[0]) => {
    const secret = await createSecretV2(dto);
    createdSecrets.push(dto);
    return secret;
  };

  const createTrackedImport = async (dto: Parameters<typeof createSecretImport>[0]) => {
    const secretImport = await createSecretImport(dto);
    createdImports.push({ ...dto, id: secretImport.id });
    return secretImport;
  };

  afterEach(async () => {
    const imports = createdImports.splice(0);
    const secrets = createdSecrets.splice(0);
    await Promise.all(imports.map((el) => deleteSecretImport(el)));
    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

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

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

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
  });

  test("Local secret reference with empty value", async () => {
    const secrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "EMPTY",
        value: ""
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "TEST",
        // eslint-disable-next-line
        value: "hello ${EMPTY}"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });
    expect(expandedSecret.secretValue).toBe("hello ");

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
          secretValue: "hello "
        })
      ])
    );
  });

  test("Local secret reference to non-existent secret keeps literal reference", async () => {
    const secrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "TEST",
        // eslint-disable-next-line
        value: "hello ${NON_EXISTENT_SECRET}"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });
    // eslint-disable-next-line
    expect(expandedSecret.secretValue).toBe("hello ${NON_EXISTENT_SECRET}");

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
          // eslint-disable-next-line
          secretValue: "hello ${NON_EXISTENT_SECRET}"
        })
      ])
    );
  });

  test("Local secret reference with repeated non-existent secret keeps literal references", async () => {
    const secrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "TEST",
        // eslint-disable-next-line
        value: "${MISSING} ${MISSING}"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });
    // eslint-disable-next-line
    expect(expandedSecret.secretValue).toBe("${MISSING} ${MISSING}");

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
          // eslint-disable-next-line
          secretValue: "${MISSING} ${MISSING}"
        })
      ])
    );
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

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

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

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createTrackedSecret(secret);
    }

    await createTrackedImport({
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

      for (const secret of secrets) {
        // eslint-disable-next-line no-await-in-loop
        await createTrackedSecret(secret);
      }

      await createTrackedImport({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        importEnv: "prod",
        importPath: "/deep/nested",
        isReplication: true
      });

      await waitForReplicatedSecret({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_2",
        value: "secret reference testing"
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
    },
    { timeout: 60_000 }
  );
});
