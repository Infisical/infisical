import { seedData1 } from "@app/db/seed-data";

const createSecretImport = async (importPath: string, importEnv: string) => {
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
  return payload.secretImport;
};

const deleteSecretImport = async (id: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-imports/${id}`,
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
  return payload.secretImport;
};

describe("Secret Import Router", async () => {
  test.each([
    { importEnv: "dev", importPath: "/" }, // one in root
    { importEnv: "staging", importPath: "/" } // then create a deep one creating intermediate ones
  ])("Create secret import $importEnv with path $importPath", async ({ importPath, importEnv }) => {
    // check for default environments
    const payload = await createSecretImport(importPath, importEnv);
    expect(payload).toEqual(
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
    await deleteSecretImport(payload.id);
  });

  test("Get secret imports", async () => {
    const createdImport1 = await createSecretImport("/", "dev");
    const createdImport2 = await createSecretImport("/", "staging");
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
          importPath: expect.any(String),
          importEnv: expect.objectContaining({
            name: expect.any(String),
            slug: expect.any(String),
            id: expect.any(String)
          })
        })
      ])
    );
    await deleteSecretImport(createdImport1.id);
    await deleteSecretImport(createdImport2.id);
  });

  test("Update secret import position", async () => {
    const createdImport1 = await createSecretImport("/", "dev");
    const createdImport2 = await createSecretImport("/", "staging");

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
    expect(secretImportList.secretImports[1].id).toEqual(createdImport1.id);
    expect(secretImportList.secretImports[0].id).toEqual(createdImport2.id);

    await deleteSecretImport(createdImport1.id);
    await deleteSecretImport(createdImport2.id);
  });

  test("Delete secret import position", async () => {
    const createdImport1 = await createSecretImport("/", "dev");
    const createdImport2 = await createSecretImport("/", "staging");
    const deletedImport = await deleteSecretImport(createdImport1.id);
    // check for default environments
    expect(deletedImport).toEqual(
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

    await deleteSecretImport(createdImport2.id);
  });
});
