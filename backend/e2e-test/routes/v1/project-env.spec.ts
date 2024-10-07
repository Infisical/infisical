import { seedData1 } from "@app/db/seed-data";
import { DEFAULT_PROJECT_ENVS } from "@app/db/seeds/3-project";

const createProjectEnvironment = async (name: string, slug: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/workspace/${seedData1.project.id}/environments`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      name,
      slug
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("environment");
  return payload.environment;
};

const deleteProjectEnvironment = async (envId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/workspace/${seedData1.project.id}/environments/${envId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("environment");
  return payload.environment;
};

describe("Project Environment Router", async () => {
  test("Get default environments", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/workspace/${seedData1.project.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("workspace");
    // check for default environments
    expect(payload).toEqual({
      workspace: expect.objectContaining({
        name: seedData1.project.name,
        id: seedData1.project.id,
        slug: seedData1.project.slug,
        environments: expect.arrayContaining([
          expect.objectContaining(DEFAULT_PROJECT_ENVS[0]),
          expect.objectContaining(DEFAULT_PROJECT_ENVS[1]),
          expect.objectContaining(DEFAULT_PROJECT_ENVS[2])
        ])
      })
    });
    // ensure only two default environments exist
    expect(payload.workspace.environments.length).toBe(3);
  });

  const mockProjectEnv = { name: "temp", slug: "temp" }; // id will be filled in create op
  test("Create environment", async () => {
    const newEnvironment = await createProjectEnvironment(mockProjectEnv.name, mockProjectEnv.slug);
    expect(newEnvironment).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: mockProjectEnv.name,
        slug: mockProjectEnv.slug,
        projectId: seedData1.project.id,
        position: DEFAULT_PROJECT_ENVS.length + 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    await deleteProjectEnvironment(newEnvironment.id);
  });

  test("Update environment", async () => {
    const newEnvironment = await createProjectEnvironment(mockProjectEnv.name, mockProjectEnv.slug);
    const updatedName = { name: "temp#2", slug: "temp2" };
    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/workspace/${seedData1.project.id}/environments/${newEnvironment.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        name: updatedName.name,
        slug: updatedName.slug,
        position: 1
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("environment");
    expect(payload.environment).toEqual(
      expect.objectContaining({
        id: newEnvironment.id,
        name: updatedName.name,
        slug: updatedName.slug,
        projectId: seedData1.project.id,
        position: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    await deleteProjectEnvironment(newEnvironment.id);
  });

  test("Delete environment", async () => {
    const newEnvironment = await createProjectEnvironment(mockProjectEnv.name, mockProjectEnv.slug);
    const deletedProjectEnvironment = await deleteProjectEnvironment(newEnvironment.id);
    expect(deletedProjectEnvironment).toEqual(
      expect.objectContaining({
        id: deletedProjectEnvironment.id,
        name: mockProjectEnv.name,
        slug: mockProjectEnv.slug,
        position: 5,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
  });
});
