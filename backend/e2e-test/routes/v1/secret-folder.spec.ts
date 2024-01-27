import { seedData1 } from "@app/db/seed-data";

describe("Secret Folder Router", async () => {
  test.each([
    { name: "folder1", path: "/" }, // one in root
    { name: "folder1", path: "/level1/level2" }, // then create a deep one creating intermediate ones
    { name: "folder2", path: "/" },
    { name: "folder1", path: "/level1/level2" } // this should not create folder return same thing
  ])("Create folder $name in $path", async ({ name, path }) => {
    const res = await testServer.inject({
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
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("folder");
    // check for default environments
    expect(payload).toEqual({
      folder: expect.objectContaining({
        name,
        id: expect.any(String)
      })
    });
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
    expect(payload.folders.length).toBe(expected.length);
    expect(payload).toEqual({ folders: expected.folders.map((el) => expect.objectContaining(el)) });
  });

  let toBeDeleteFolderId = "";
  test("Update a deep folder", async () => {
    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/folders/folder1`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        name: "folder-updated",
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
    toBeDeleteFolderId = payload.folder.id;

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
    expect(updatedFolderList.folders.length).toEqual(1);
    expect(updatedFolderList.folders[0].name).toEqual("folder-updated");
  });

  test("Delete a deep folder", async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/folders/${toBeDeleteFolderId}`,
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
