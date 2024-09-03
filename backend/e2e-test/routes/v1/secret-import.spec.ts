import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import { createSecretV2, deleteSecretV2, getSecretByNameV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

describe("Secret Import Router", async () => {
  test.each([
    { importEnv: "prod", importPath: "/" }, // one in root
    { importEnv: "staging", importPath: "/" } // then create a deep one creating intermediate ones
  ])("Create secret import $importEnv with path $importPath", async ({ importPath, importEnv }) => {
    // check for default environments
    const payload = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath,
      importEnv
    });
    expect(payload).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath,
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: importEnv,
          id: expect.any(String)
        })
      })
    );

    await deleteSecretImport({
      id: payload.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
  });

  test("Get secret imports", async () => {
    const createdImport1 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: "/",
      importEnv: "prod"
    });
    const createdImport2 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: "/",
      importEnv: "staging"
    });
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-imports`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("secretImports");
    expect(payload.secretImports.length).toBe(2);
    expect(payload.secretImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          importPath: "/",
          importEnv: expect.objectContaining({
            name: expect.any(String),
            slug: "prod",
            id: expect.any(String)
          })
        }),
        expect.objectContaining({
          id: expect.any(String),
          importPath: "/",
          importEnv: expect.objectContaining({
            name: expect.any(String),
            slug: "staging",
            id: expect.any(String)
          })
        })
      ])
    );
    await deleteSecretImport({
      id: createdImport1.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    await deleteSecretImport({
      id: createdImport2.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
  });

  test("Update secret import position", async () => {
    const prodImportDetails = { path: "/", envSlug: "prod" };
    const stagingImportDetails = { path: "/", envSlug: "staging" };

    const createdImport1 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: prodImportDetails.path,
      importEnv: prodImportDetails.envSlug
    });
    const createdImport2 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: stagingImportDetails.path,
      importEnv: stagingImportDetails.envSlug
    });

    const updateImportRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-imports/${createdImport1.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/",
        import: {
          position: 2
        }
      }
    });

    expect(updateImportRes.statusCode).toBe(200);
    const payload = JSON.parse(updateImportRes.payload);
    expect(payload).toHaveProperty("secretImport");
    // check for default environments
    expect(payload.secretImport).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath: expect.any(String),
        position: 2,
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: expect.stringMatching(prodImportDetails.envSlug),
          id: expect.any(String)
        })
      })
    );

    const secretImportsListRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-imports`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/"
      }
    });

    expect(secretImportsListRes.statusCode).toBe(200);
    const secretImportList = JSON.parse(secretImportsListRes.payload);
    expect(secretImportList).toHaveProperty("secretImports");
    expect(secretImportList.secretImports[1].id).toEqual(createdImport1.id);
    expect(secretImportList.secretImports[0].id).toEqual(createdImport2.id);

    await deleteSecretImport({
      id: createdImport1.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    await deleteSecretImport({
      id: createdImport2.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
  });

  test("Delete secret import position", async () => {
    const createdImport1 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: "/",
      importEnv: "prod"
    });
    const createdImport2 = await createSecretImport({
      authToken: jwtAuthToken,
      secretPath: "/",
      environmentSlug: seedData1.environment.slug,
      workspaceId: seedData1.project.id,
      importPath: "/",
      importEnv: "staging"
    });
    const deletedImport = await deleteSecretImport({
      id: createdImport1.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });

    // check for default environments
    expect(deletedImport).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath: "/",
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: "prod",
          id: expect.any(String)
        })
      })
    );

    const secretImportsListRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-imports`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/"
      }
    });

    expect(secretImportsListRes.statusCode).toBe(200);
    const secretImportList = JSON.parse(secretImportsListRes.payload);
    expect(secretImportList).toHaveProperty("secretImports");
    expect(secretImportList.secretImports.length).toEqual(1);
    expect(secretImportList.secretImports[0].position).toEqual(1);

    await deleteSecretImport({
      id: createdImport2.id,
      workspaceId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      secretPath: "/",
      authToken: jwtAuthToken
    });
  });
});

// dev <- stage <- prod
describe.each([{ path: "/" }, { path: "/deep" }])(
  "Secret import waterfall pattern testing - %path",
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
        importEnv: "staging"
      });

      const stageImportFromProd = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "prod"
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
      await createSecretV2({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      const secret = await getSecretByNameV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
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

      await deleteSecretV2({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
      });
    });

    test("Check two level imported secret exist", async () => {
      await createSecretV2({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      const secret = await getSecretByNameV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY"
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

      await deleteSecretV2({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY"
      });
    });
  }
);

// dev <- stage, dev <- prod
describe.each([{ path: "/" }, { path: "/deep" }])(
  "Secret import multiple destination to one source pattern testing - %path",
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
        importEnv: "staging"
      });

      const devImportFromProd = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: "prod"
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
      await createSecretV2({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      await createSecretV2({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      const secret = await getSecretByNameV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
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

      await deleteSecretV2({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
      });
      await deleteSecretV2({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY"
      });
    });
  }
);

// dev -> stage, prod
describe.each([{ path: "/" }, { path: "/deep" }])(
  "Secret import one source to multiple destination pattern testing - %path",
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

      const stageImportFromDev = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: seedData1.environment.slug
      });

      const prodImportFromDev = await createSecretImport({
        authToken: jwtAuthToken,
        secretPath: testSuitePath,
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        importPath: testSuitePath,
        importEnv: seedData1.environment.slug
      });

      return async () => {
        await deleteSecretImport({
          id: prodImportFromDev.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: "prod",
          secretPath: testSuitePath,
          authToken: jwtAuthToken
        });

        await deleteSecretImport({
          id: stageImportFromDev.id,
          workspaceId: seedData1.projectV3.id,
          environmentSlug: "staging",
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
      await createSecretV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY",
        value: "stage-value"
      });

      await createSecretV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY",
        value: "prod-value"
      });

      const stagingSecret = await getSecretByNameV2({
        environmentSlug: "staging",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
      });

      expect(stagingSecret.secretKey).toBe("STAGING_KEY");
      expect(stagingSecret.secretValue).toBe("stage-value");

      const prodSecret = await getSecretByNameV2({
        environmentSlug: "prod",
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY"
      });

      expect(prodSecret.secretKey).toBe("PROD_KEY");
      expect(prodSecret.secretValue).toBe("prod-value");

      await deleteSecretV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "STAGING_KEY"
      });
      await deleteSecretV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: seedData1.projectV3.id,
        secretPath: testSuitePath,
        authToken: jwtAuthToken,
        key: "PROD_KEY"
      });
    });
  }
);
