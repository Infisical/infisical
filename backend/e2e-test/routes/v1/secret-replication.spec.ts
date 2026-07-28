import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import { createSecretV2, deleteSecretV2, getSecretsV2, waitForReplicatedSecret } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

// Source secrets are torn down after the test that created them. Cleanup used
// to sit at the end of each test body, so a failing assertion skipped it and
// left the source secret in place — and since every test here replicates into
// the same shared environments, the leftovers then showed up in later tests'
// assertions as phantom imports.
const createdSecrets: Parameters<typeof deleteSecretV2>[0][] = [];

const createTrackedSecret = async (dto: Parameters<typeof createSecretV2>[0]) => {
  const secret = await createSecretV2(dto);
  createdSecrets.push(dto);
  return secret;
};

afterEach(async () => {
  await Promise.all(createdSecrets.splice(0).map((el) => deleteSecretV2(el)));
});

// dev <- stage <- prod
describe.each([{ secretPath: "/" }, { secretPath: "/deep" }])(
  "Secret replication waterfall pattern testing - %secretPath",
  ({ secretPath: testSuitePath }) => {
    beforeAll(async () => {
      let prodFolder: { id: string };
      let stagingFolder: { id: string };
      let devFolder: { id: string };

      if (testSuitePath !== "/") {
        prodFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: "prod",
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });

        stagingFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: "staging",
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });

        devFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: seedData1.environment.slug,
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });
      }

      const devImportFromStage = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "staging",
        isReplication: true
      });

      const stageImportFromProd = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "prod",
        isReplication: true
      });

      return async () => {
        await deleteSecretImport({
          id: stageImportFromProd.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: "staging",
          secretPath: testSuitePath,
          authToken: jwtAuthToken
        });

        await deleteSecretImport({
          id: devImportFromStage.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: seedData1.environment.slug,
          secretPath: testSuitePath,
          authToken: jwtAuthToken
        });

        if (prodFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: prodFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: "prod"
          });
        }

        if (stagingFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: stagingFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: "staging"
          });
        }

        if (devFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: devFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: seedData1.environment.slug
          });
        }
      };
    });

    test("Check one level imported secret exist", async () => {
      await createTrackedSecret({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      const secret = await waitForReplicatedSecret({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      expect(secret.secretKey).toBe("STAGING_KEY");
      expect(secret.secretValue).toBe("stage-value");

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken
      });

      expect(listSecrets.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "STAGING_KEY",
                secretValue: "stage-value"
              })
            ])
          })
        ])
      );
    });

    test("Check two level imported secret exist", async () => {
      await createTrackedSecret({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      const secret = await waitForReplicatedSecret({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      expect(secret.secretKey).toBe("PROD_KEY");
      expect(secret.secretValue).toBe("prod-value");

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken
      });
      expect(listSecrets.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "PROD_KEY",
                secretValue: "prod-value"
              })
            ])
          })
        ])
      );
    });
  },
  { timeout: 60_000 }
);

// dev <- stage, dev <- prod
describe.each([{ path: "/" }, { path: "/deep" }])(
  "Secret replication 1-N pattern testing - %path",
  ({ path: testSuitePath }) => {
    beforeAll(async () => {
      let prodFolder: { id: string };
      let stagingFolder: { id: string };
      let devFolder: { id: string };

      if (testSuitePath !== "/") {
        prodFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: "prod",
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });

        stagingFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: "staging",
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });

        devFolder = await createFolder({
          authToken: jwtAuthToken,
          environmentSlug: seedData1.environment.slug,
          workspaceId: seedData1.projectV3.id,
          secretPath: "/",
          name: "deep"
        });
      }

      const devImportFromStage = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "staging",
        isReplication: true
      });

      const devImportFromProd = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "prod",
        isReplication: true
      });

      return async () => {
        await deleteSecretImport({
          id: devImportFromProd.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: seedData1.environment.slug,
          secretPath: testSuitePath,
          authToken: jwtAuthToken
        });

        await deleteSecretImport({
          id: devImportFromStage.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: seedData1.environment.slug,
          secretPath: testSuitePath,
          authToken: jwtAuthToken
        });

        if (prodFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: prodFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: "prod"
          });
        }

        if (stagingFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: stagingFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: "staging"
          });
        }

        if (devFolder) {
          await deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: devFolder.id,
            workspaceId: seedData1.projectV3.id,
            environmentSlug: seedData1.environment.slug
          });
        }
      };
    });

    test("Check imported secret exist", async () => {
      await createTrackedSecret({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      await createTrackedSecret({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      const secret = await waitForReplicatedSecret({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });
      await waitForReplicatedSecret({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      expect(secret.secretKey).toBe("STAGING_KEY");
      expect(secret.secretValue).toBe("stage-value");

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken
      });
      expect(listSecrets.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "STAGING_KEY",
                secretValue: "stage-value"
              })
            ])
          }),
          expect.objectContaining({
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "PROD_KEY",
                secretValue: "prod-value"
              })
            ])
          })
        ])
      );
    });
  },
  { timeout: 60_000 }
);
