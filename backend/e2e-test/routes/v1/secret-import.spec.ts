import { seedData1 } from "@app/db/seed-data";

describe("Secret Folder Router", async () => {
  test.each([
    { importEnv: "dev", importPath: "/" }, // one in root
    { importEnv: "staging", importPath: "/" } // then create a deep one creating intermediate ones
  ])("Create secret import $importEnv with path $importPath", async ({ importPath, importEnv }) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/secret-imports`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/",
        import: {
          environment: importEnv,
          path: importPath
        }
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("secretImport");
    // check for default environments
    expect(payload.secretImport).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath: expect.any(String),
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: expect.any(String),
          id: expect.any(String)
        })
      })
    );
  });

  let testSecretImportId = "";
  test("Get secret imports", async () => {
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
    testSecretImportId = payload.secretImports[0].id;
    expect(payload.secretImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          importPath: expect.any(String),
          importEnv: expect.objectContaining({
            name: expect.any(String),
            slug: expect.any(String),
            id: expect.any(String)
          })
        })
      ])
    );
  });

  test("Update secret import position", async () => {
    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-imports/${testSecretImportId}`,
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

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("secretImport");
    // check for default environments
    expect(payload.secretImport).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath: expect.any(String),
        position: 2,
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: expect.any(String),
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
    expect(secretImportList.secretImports[1].id).toEqual(testSecretImportId);
  });

  test("Delete secret import position", async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/secret-imports/${testSecretImportId}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("secretImport");
    // check for default environments
    expect(payload.secretImport).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        importPath: expect.any(String),
        importEnv: expect.objectContaining({
          name: expect.any(String),
          slug: expect.any(String),
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
  });
});
