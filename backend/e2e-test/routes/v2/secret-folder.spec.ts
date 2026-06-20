import { createSecretV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const createFolder = async (dto: { path: string; name: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: dto.name,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const deleteFolder = async (dto: { path: string; id: string; forceDelete?: boolean }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.project.id,
      environment: seedData1.environment.slug,
      path: dto.path,
      forceDelete: dto.forceDelete ?? false
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
      url: `/api/v2/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        projectId: seedData1.project.id,
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

    await Promise.all(newFolders.map(({ id }) => deleteFolder({ path, id, forceDelete: true })));
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
      url: `/api/v2/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        projectId: seedData1.project.id,
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
      url: `/api/v2/folders/${newFolder.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId: seedData1.project.id,
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
      url: `/api/v2/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      query: {
        projectId: seedData1.project.id,
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
      url: `/api/v2/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId: seedData1.project.id,
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
});

const createFolderInEnv = async (dto: { path: string; name: string; environment: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.projectV3.id,
      environment: dto.environment,
      name: dto.name,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder as { id: string; name: string };
};

const getFolders = async (dto: { path: string; environment: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v2/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    query: {
      projectId: seedData1.projectV3.id,
      environment: dto.environment,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folders as { id: string; name: string }[];
};

const deleteFolderInEnv = async (dto: { path: string; id: string; environment: string; forceDelete?: boolean }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.projectV3.id,
      environment: dto.environment,
      path: dto.path,
      forceDelete: dto.forceDelete ?? false
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const moveFolder = async (dto: { folderId: string; destinationEnvironment: string; destinationPath: string }) =>
  testServer.inject({
    method: "POST",
    url: `/api/v2/folders/move`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.projectV3.id,
      folderId: dto.folderId,
      destinationEnvironment: dto.destinationEnvironment,
      destinationPath: dto.destinationPath
    }
  });

describe("Secret Folder Move Router", async () => {
  const sourceEnv = seedData1.environment.slug; // "dev"
  const crossEnv = "staging";

  const addSecret = (secretPath: string, key: string, environment = sourceEnv) =>
    createSecretV2({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: environment,
      secretPath,
      key,
      value: `${key}-value`,
      authToken: jwtAuthToken
    });

  const secretKeysAt = async (secretPath: string, environment: string) => {
    const { secrets } = await getSecretsV2({
      workspaceId: seedData1.projectV3.id,
      environmentSlug: environment,
      secretPath,
      authToken: jwtAuthToken
    });
    return secrets.map((secret) => secret.secretKey);
  };

  const createSecretApprovalPolicy = async (dto: { name: string; secretPath: string }) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/secret-approvals`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.projectV3.id,
        environment: sourceEnv,
        name: dto.name,
        secretPath: dto.secretPath,
        approvers: [{ id: seedData1.id, type: ApproverType.User }],
        approvals: 1
      }
    });
    expect(res.statusCode).toBe(200);
    return res.json().approval as { id: string };
  };

  const deleteSecretApprovalPolicy = async (id: string) => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/secret-approvals/${id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(200);
  };

  test("Move a folder subtree (secrets at every level) within the same environment", async () => {
    // build /move-src -> /level1 -> /level2 with a secret at each level
    const srcRoot = await createFolderInEnv({ path: "/", name: "move-src", environment: sourceEnv });
    await createFolderInEnv({ path: "/move-src", name: "level1", environment: sourceEnv });
    await createFolderInEnv({ path: "/move-src/level1", name: "level2", environment: sourceEnv });
    const destParent = await createFolderInEnv({ path: "/", name: "move-dest", environment: sourceEnv });

    await addSecret("/move-src", "ROOT_SECRET");
    await addSecret("/move-src/level1", "L1_SECRET");
    await addSecret("/move-src/level1/level2", "L2_SECRET");

    const res = await moveFolder({
      folderId: srcRoot.id,
      destinationEnvironment: sourceEnv,
      destinationPath: "/move-dest"
    });
    expect(res.statusCode).toBe(200);

    // every secret now lives under the destination subtree
    expect(await secretKeysAt("/move-dest/move-src", sourceEnv)).toContain("ROOT_SECRET");
    expect(await secretKeysAt("/move-dest/move-src/level1", sourceEnv)).toContain("L1_SECRET");
    expect(await secretKeysAt("/move-dest/move-src/level1/level2", sourceEnv)).toContain("L2_SECRET");

    // the source folder is gone (cascade removed the whole subtree)
    const rootFolders = await getFolders({ path: "/", environment: sourceEnv });
    expect(rootFolders.map((folder) => folder.name)).not.toContain("move-src");

    await deleteFolderInEnv({ path: "/", id: destParent.id, environment: sourceEnv, forceDelete: true });
  }, 10_000);

  test("Move a folder to a different environment", async () => {
    const srcRoot = await createFolderInEnv({ path: "/", name: "move-cross", environment: sourceEnv });
    await addSecret("/move-cross", "CROSS_SECRET");

    const res = await moveFolder({
      folderId: srcRoot.id,
      destinationEnvironment: crossEnv,
      destinationPath: "/"
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.sourceEnvironment).toBe(sourceEnv);
    expect(payload.destinationEnvironment).toBe(crossEnv);

    // secret present in the destination environment
    expect(await secretKeysAt("/move-cross", crossEnv)).toContain("CROSS_SECRET");

    // source environment no longer has the folder
    const sourceRootFolders = await getFolders({ path: "/", environment: sourceEnv });
    expect(sourceRootFolders.map((folder) => folder.name)).not.toContain("move-cross");

    const movedFolder = (await getFolders({ path: "/", environment: crossEnv })).find(
      (folder) => folder.name === "move-cross"
    );
    expect(movedFolder).toBeDefined();
    await deleteFolderInEnv({ path: "/", id: movedFolder!.id, environment: crossEnv, forceDelete: true });
  }, 10_000);

  test("Moving a folder onto a path that already has a folder of the same name fails", async () => {
    const srcRoot = await createFolderInEnv({ path: "/", name: "move-conflict", environment: sourceEnv });
    const destParent = await createFolderInEnv({ path: "/", name: "move-conflict-dest", environment: sourceEnv });
    // a folder named "move-conflict" already exists under the destination parent
    await createFolderInEnv({ path: "/move-conflict-dest", name: "move-conflict", environment: sourceEnv });

    const res = await moveFolder({
      folderId: srcRoot.id,
      destinationEnvironment: sourceEnv,
      destinationPath: "/move-conflict-dest"
    });
    expect(res.statusCode).toBe(400);

    // the source folder is untouched because the move was rejected up front
    const rootFolders = await getFolders({ path: "/", environment: sourceEnv });
    expect(rootFolders.map((folder) => folder.name)).toContain("move-conflict");

    await deleteFolderInEnv({ path: "/", id: srcRoot.id, environment: sourceEnv, forceDelete: true });
    await deleteFolderInEnv({ path: "/", id: destParent.id, environment: sourceEnv, forceDelete: true });
  }, 10_000);

  test("Blocks moving a folder whose subtree is governed by a source approval policy", async () => {
    // /policy-src/protected is covered by a source approval policy. Folders governed by a secret approval policy
    // cannot be moved, so the whole move is rejected up front and the source subtree is left untouched.
    const srcRoot = await createFolderInEnv({ path: "/", name: "policy-src", environment: sourceEnv });
    await createFolderInEnv({ path: "/policy-src", name: "protected", environment: sourceEnv });
    const destParent = await createFolderInEnv({ path: "/", name: "policy-dest", environment: sourceEnv });

    await addSecret("/policy-src", "ROOT_SECRET");
    await addSecret("/policy-src/protected", "PROTECTED_SECRET");

    const policy = await createSecretApprovalPolicy({
      name: "move-protected-policy",
      secretPath: "/policy-src/protected"
    });

    const res = await moveFolder({
      folderId: srcRoot.id,
      destinationEnvironment: sourceEnv,
      destinationPath: "/policy-dest"
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("secret approval policy");

    // the source subtree and its secrets are untouched because the move was rejected up front
    const rootFolders = await getFolders({ path: "/", environment: sourceEnv });
    expect(rootFolders.map((folder) => folder.name)).toContain("policy-src");
    expect(await secretKeysAt("/policy-src", sourceEnv)).toContain("ROOT_SECRET");
    expect(await secretKeysAt("/policy-src/protected", sourceEnv)).toContain("PROTECTED_SECRET");

    // nothing was copied to the destination
    expect(await getFolders({ path: "/policy-dest", environment: sourceEnv })).toHaveLength(0);

    // cleanup: removing the policy first so $checkFolderPolicy no longer blocks the source tree delete
    await deleteSecretApprovalPolicy(policy.id);
    await deleteFolderInEnv({ path: "/", id: srcRoot.id, environment: sourceEnv, forceDelete: true });
    await deleteFolderInEnv({ path: "/", id: destParent.id, environment: sourceEnv, forceDelete: true });
  }, 10_000);

  test("Blocks moving a folder when the destination path is governed by an approval policy", async () => {
    // /move-into-policy holds only static secrets and is freely movable, but the destination it would land at
    // (/policy-dest-guard/move-into-policy) is covered by an approval policy. Moving into a policy-governed path
    // would create the folder's secrets there directly, bypassing the policy, so the move is rejected up front.
    const srcRoot = await createFolderInEnv({ path: "/", name: "move-into-policy", environment: sourceEnv });
    await addSecret("/move-into-policy", "ROOT_SECRET");
    const destParent = await createFolderInEnv({ path: "/", name: "policy-dest-guard", environment: sourceEnv });

    const policy = await createSecretApprovalPolicy({
      name: "move-dest-protected-policy",
      secretPath: "/policy-dest-guard/move-into-policy"
    });

    const res = await moveFolder({
      folderId: srcRoot.id,
      destinationEnvironment: sourceEnv,
      destinationPath: "/policy-dest-guard"
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("secret approval policy");

    // the source subtree and its secret are untouched because the move was rejected up front
    const rootFolders = await getFolders({ path: "/", environment: sourceEnv });
    expect(rootFolders.map((folder) => folder.name)).toContain("move-into-policy");
    expect(await secretKeysAt("/move-into-policy", sourceEnv)).toContain("ROOT_SECRET");

    // nothing was copied to the destination
    expect(await getFolders({ path: "/policy-dest-guard", environment: sourceEnv })).toHaveLength(0);

    await deleteSecretApprovalPolicy(policy.id);
    await deleteFolderInEnv({ path: "/", id: srcRoot.id, environment: sourceEnv, forceDelete: true });
    await deleteFolderInEnv({ path: "/", id: destParent.id, environment: sourceEnv, forceDelete: true });
  }, 10_000);
});
