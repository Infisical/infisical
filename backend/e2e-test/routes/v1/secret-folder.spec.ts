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
  test.each([
    { name: "folder1", path: "/" }, // one in root
    { name: "folder1", path: "/level1/level2" }, // then create a deep one creating intermediate ones
    { name: "folder2", path: "/" },
    { name: "folder1", path: "/level1/level2" } // this should not create folder return same thing
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
        folders: [{ name: "folder1" }, { name: "level1" }, { name: "folder2" }],
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
});
