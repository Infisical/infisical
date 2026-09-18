import { seedData1 } from "@app/db/seed-data";

const createFolder = async (dto: { path: string; name: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: dto.name,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const deleteFolder = async (dto: { path: string; id: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

describe("Secret Folder Router", async () => {
  vi.setConfig({ testTimeout: 10_000 });

  test.each([
    { name: "folder1", path: "/" }, // one in root
    { name: "folder1", path: "/level1/level2" }, // then create a deep one creating intermediate ones
    { name: "folder2", path: "/" },
    { name: "folder3", path: "/level1/level2" }
  ])("Create folder $name in $path", async ({ name, path }) => {
    const createdFolder = await createFolder({ path, name });
    // check for default environments
    expect(createdFolder).toEqual(
      expect.objectContaining({
        name,
        id: expect.any(String)
      })
    );
    await deleteFolder({ path, id: createdFolder.id });
  });

  test.each([
    {
      path: "/",
      expected: {
        folders: [{ name: "folder4" }, { name: "level2" }, { name: "folder5" }],
        length: 3
      }
    },
    { path: "/level1/level2", expected: { folders: [{ name: "folder1" }], length: 1 } }
  ])("Get folders $path", async ({ path, expected }) => {
    const newFolders = await Promise.all(expected.folders.map(({ name }) => createFolder({ name, path })));

    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("folders");
    expect(payload.folders.length >= expected.folders.length).toBeTruthy();
    expect(payload).toEqual({
      folders: expect.arrayContaining(expected.folders.map((el) => expect.objectContaining(el)))
    });

    await Promise.all(newFolders.map(({ id }) => deleteFolder({ path, id })));
  });

  test("Update a deep folder", async () => {
    const newFolder = await createFolder({ name: "folder-updated", path: "/level1/level2" });
    expect(newFolder).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "folder-updated"
      })
    );

    const resUpdatedFolders = await testServer.inject({
      method: "GET",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/level1/level2"
      }
    });

    expect(resUpdatedFolders.statusCode).toBe(200);
    const updatedFolderList = JSON.parse(resUpdatedFolders.payload);
    expect(updatedFolderList).toHaveProperty("folders");
    expect(updatedFolderList.folders[0].name).toEqual("folder-updated");

    await deleteFolder({ path: "/level1/level2", id: newFolder.id });
  });

  test("Delete a deep folder", async () => {
    const newFolder = await createFolder({ name: "folder-updated", path: "/level1/level2" });
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/folders/${newFolder.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/level1/level2"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("folder");
    expect(payload.folder).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "folder-updated"
      })
    );

    const resUpdatedFolders = await testServer.inject({
      method: "GET",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/level1/level2"
      }
    });

    expect(resUpdatedFolders.statusCode).toBe(200);
    const updatedFolderList = JSON.parse(resUpdatedFolders.payload);
    expect(updatedFolderList).toHaveProperty("folders");
    expect(updatedFolderList.folders.length).toEqual(0);
  });
  test("Creating a duplicate folder should return a 400 error", async () => {
    const newFolder = await createFolder({ name: "folder-duplicate", path: "/level1/level2" });

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        name: "folder-duplicate",
        path: "/level1/level2"
      }
    });
    expect(res.statusCode).toBe(400);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("error");
    await deleteFolder({ path: "/level1/level2", id: newFolder.id });
  });

  const listFolderNames = async (path: string) => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path
      }
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.payload).folders as { id: string; name: string }[]).map((folder) => folder.name);
  };

  // Concurrent creates of the same folder race on the create-folder lock. The lock keeps them from all inserting:
  // exactly one request wins and the rest observe the committed row and are rejected, so no duplicate siblings.
  test.each([
    { name: "concurrent-shallow", path: "/" },
    { name: "concurrent-deep", path: "/conc-level1/conc-level2" }
  ])("Concurrent creation of $name in $path collapses to a single folder", async ({ name, path }) => {
    const CONCURRENCY = 10;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        testServer.inject({
          method: "POST",
          url: `/api/v1/folders`,
          headers: {
            authorization: `Bearer ${jwtAuthToken}`
          },
          body: {
            workspaceId: seedData1.project.id,
            environment: seedData1.environment.slug,
            name,
            path
          }
        })
      )
    );

    const created = responses.filter((res) => res.statusCode === 200);
    const rejected = responses.filter((res) => res.statusCode === 400);

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENCY - 1);

    // the folder exists exactly once at its path, and every rejection is the "already exists" conflict
    const namesAtPath = await listFolderNames(path);
    expect(namesAtPath.filter((folderName) => folderName === name)).toHaveLength(1);
    rejected.forEach((res) => expect(JSON.parse(res.payload)).toHaveProperty("error"));

    const createdFolder = created[0].json().folder as { id: string };
    await deleteFolder({ path, id: createdFolder.id });
  });
});
