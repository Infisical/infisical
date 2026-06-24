type TProject = { id: string; name: string; slug: string };

const createProject = async (projectName: string, slug?: string): Promise<TProject> => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectName,
      ...(slug ? { slug } : {})
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("project");
  return payload.project as TProject;
};

const deleteProject = async (projectId: string) => {
  return testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

const getProject = async (projectId: string) => {
  return testServer.inject({
    method: "GET",
    url: `/api/v1/projects/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

const listProjects = async (): Promise<TProject[]> => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/projects",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload).projects as TProject[]) ?? [];
};

const getProjectsBySlugs = async (slugs: string[]) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/projects/slugs",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: { slugs }
  });

describe("Project deletion (soft-delete + async cleanup)", async () => {
  test("DELETE soft-deletes a project and removes it from all reads", async () => {
    const project = await createProject("e2e-delete-removed-from-reads");

    // present before delete
    expect((await getProject(project.id)).statusCode).toBe(200);
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(true);

    const delRes = await deleteProject(project.id);
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.payload).project).toEqual(expect.objectContaining({ id: project.id }));

    // gone from every read path immediately (read filters exclude soft-deleted)
    expect((await getProject(project.id)).statusCode).toBe(404);
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(false);
  });

  test("frees the slug so a same-slug project can be recreated immediately", async () => {
    const slug = "e2e-slug-reuse-test";
    const first = await createProject("e2e-slug-reuse-1", slug);
    expect(first.slug).toBe(slug);

    expect((await deleteProject(first.id)).statusCode).toBe(200);

    // recreating with the same slug must succeed (slug was tombstoned on delete)
    const second = await createProject("e2e-slug-reuse-2", slug);
    expect(second.slug).toBe(slug);
    expect(second.id).not.toBe(first.id);

    await deleteProject(second.id);
  });

  test("cannot delete an already-deleted project", async () => {
    const project = await createProject("e2e-double-delete");
    expect((await deleteProject(project.id)).statusCode).toBe(200);

    // second delete resolves the project via the soft-delete-filtered read → not found
    expect((await deleteProject(project.id)).statusCode).toBe(404);
  });
});

describe("Get projects by slugs (batch)", async () => {
  test("returns all matching projects and an empty errors array", async () => {
    const a = await createProject("e2e-batch-a", "e2e-batch-a");
    const b = await createProject("e2e-batch-b", "e2e-batch-b");

    const res = await getProjectsBySlugs([a.slug, b.slug]);
    expect(res.statusCode).toBe(200);
    const { projects, errors } = JSON.parse(res.payload);
    expect(errors).toEqual([]);
    expect((projects as TProject[]).map((p) => p.slug).sort()).toEqual([a.slug, b.slug].sort());
    // shape parity with the single-slug endpoint
    expect(projects[0]).toHaveProperty("environments");

    await deleteProject(a.id);
    await deleteProject(b.id);
  });

  test("puts unresolved slugs into the errors array", async () => {
    const a = await createProject("e2e-batch-err", "e2e-batch-err");

    const res = await getProjectsBySlugs([a.slug, "does-not-exist-slug"]);
    expect(res.statusCode).toBe(200);
    const { projects, errors } = JSON.parse(res.payload);
    expect((projects as TProject[]).map((p) => p.slug)).toEqual([a.slug]);
    expect(errors).toEqual([expect.objectContaining({ slug: "does-not-exist-slug" })]);

    await deleteProject(a.id);
  });

  test("dedupes repeated slugs", async () => {
    const a = await createProject("e2e-batch-dedup", "e2e-batch-dedup");

    const { projects } = JSON.parse((await getProjectsBySlugs([a.slug, a.slug])).payload);
    expect(projects).toHaveLength(1);

    await deleteProject(a.id);
  });

  test("rejects an empty slugs array", async () => {
    expect((await getProjectsBySlugs([])).statusCode).toBe(422);
  });
});
