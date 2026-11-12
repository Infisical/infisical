import { ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

import { addIdentityToProject, createIdentityActor } from "../../testUtils/identities";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { createSecretV2, getSecretByNameV2 } from "../../testUtils/secrets";

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

const deleteProject = async (projectId: string, hardDelete?: boolean) => {
  return testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    ...(hardDelete ? { query: { hardDelete: "true" } } : {})
  });
};

const restoreProject = async (projectId: string) => {
  return testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/restore`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

const permanentlyDeleteProject = async (projectId: string) => {
  return testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/deleted/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

const listDeletedProjects = async (): Promise<{ id: string; deleteAfter: string }[]> => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/projects/deleted",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).projects;
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

const updateProject = async (projectId: string, body: Record<string, unknown>) => {
  return testServer.inject({
    method: "PATCH",
    url: `/api/v1/projects/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body
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

  test("hardDelete skips the grace period and frees the slug right away", async () => {
    const slug = "e2e-slug-reuse-test";
    const first = await createProject("e2e-slug-reuse-1", slug);
    expect(first.slug).toBe(slug);

    expect((await deleteProject(first.id, true)).statusCode).toBe(200);

    expect((await listDeletedProjects()).some((p) => p.id === first.id)).toBe(false);
    // 400 while it awaits the cleanup worker, 404 once the worker has removed it
    expect([400, 404]).toContain((await restoreProject(first.id)).statusCode);

    // recreating with the same slug must succeed (slug was tombstoned on delete)
    const second = await createProject("e2e-slug-reuse-2", slug);
    expect(second.slug).toBe(slug);
    expect(second.id).not.toBe(first.id);

    await deleteProject(second.id, true);
  });

  test("keeps the slug reserved until the deleted project is permanently deleted", async () => {
    const slug = "e2e-slug-reserved-test";
    const first = await createProject("e2e-slug-reserved-1", slug);
    expect((await deleteProject(first.id)).statusCode).toBe(200);

    const blockedRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: { projectName: "e2e-slug-reserved-2", slug }
    });
    expect(blockedRes.statusCode).toBe(400);
    expect(JSON.parse(blockedRes.payload).message).toContain("pending-deletion");

    const other = await createProject("e2e-slug-reserved-other");
    const renameRes = await updateProject(other.id, { slug });
    expect(renameRes.statusCode).toBe(400);
    expect(JSON.parse(renameRes.payload).message).toContain("pending-deletion");
    await deleteProject(other.id, true);

    expect((await permanentlyDeleteProject(first.id)).statusCode).toBe(200);
    expect((await listDeletedProjects()).some((p) => p.id === first.id)).toBe(false);

    const second = await createProject("e2e-slug-reserved-2", slug);
    expect(second.slug).toBe(slug);

    await deleteProject(second.id, true);
  });

  test("only org admins can list, restore or permanently delete deleted projects", async () => {
    const project = await createProject("e2e-deleted-access");
    expect((await deleteProject(project.id)).statusCode).toBe(200);
    const { authToken } = await createIdentityActor({ orgId: seedData1.organization.id, authToken: jwtAuthToken });

    const responses = await Promise.all(
      [
        { method: "GET" as const, url: "/api/v1/projects/deleted" },
        { method: "POST" as const, url: `/api/v1/projects/${project.id}/restore` },
        { method: "DELETE" as const, url: `/api/v1/projects/deleted/${project.id}` }
      ].map((req) => testServer.inject({ ...req, headers: { authorization: `Bearer ${authToken}` } }))
    );
    expect(responses.map((res) => res.statusCode)).toEqual([403, 403, 403]);

    expect((await permanentlyDeleteProject(project.id)).statusCode).toBe(200);
  });

  test("refuses to delete a project that shares secrets with another project", async () => {
    const orgId = seedData1.organization.id;
    const headers = { authorization: `Bearer ${jwtAuthToken}` };
    const restoreLicense = overrideLicenseFeatures({ crossProjectSecretSharing: true });
    const org = await testDb(TableName.Organization).where({ id: orgId }).first();
    await testDb(TableName.Organization).where({ id: orgId }).update({ allowCrossProjectSecretSharing: true });
    try {
      const source = await createProject("e2e-share-source");
      const target = await createProject("e2e-share-target");
      const grantRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/project-folder-grants",
        headers,
        body: { sourceProjectId: source.id, environment: "dev", secretPath: "/", targetProjectId: target.id }
      });
      expect(grantRes.statusCode).toBe(200);

      const blockedRes = await deleteProject(source.id);
      expect(blockedRes.statusCode).toBe(400);
      expect(JSON.parse(blockedRes.payload).message).toContain(target.name);

      // with sharing off the grant is ignored, so it no longer blocks the delete
      await testDb(TableName.Organization).where({ id: orgId }).update({ allowCrossProjectSecretSharing: false });
      expect((await deleteProject(source.id, true)).statusCode).toBe(200);

      await deleteProject(target.id, true);
    } finally {
      await testDb(TableName.Organization)
        .where({ id: orgId })
        .update({ allowCrossProjectSecretSharing: Boolean(org?.allowCrossProjectSecretSharing) });
      restoreLicense();
    }
  });

  test("refuses to restore a project when the plan's project limit is reached", async () => {
    const project = await createProject("e2e-restore-limit");
    expect((await deleteProject(project.id)).statusCode).toBe(200);

    // the seeded project alone fills a one-project limit
    const restoreLicense = overrideLicenseFeatures({ workspaceLimit: 1 });
    try {
      const res = await restoreProject(project.id);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("project limit");
    } finally {
      restoreLicense();
    }

    expect((await permanentlyDeleteProject(project.id)).statusCode).toBe(200);
  });

  test("cannot delete an already-deleted project", async () => {
    const project = await createProject("e2e-double-delete");
    expect((await deleteProject(project.id)).statusCode).toBe(200);

    // second delete resolves the project via the soft-delete-filtered read → not found
    expect((await deleteProject(project.id)).statusCode).toBe(404);
  });

  test("restores a secret manager project within its grace period", async () => {
    const project = await createProject("e2e-restore");
    await createSecretV2({
      workspaceId: project.id,
      environmentSlug: "dev",
      secretPath: "/",
      key: "E2E_RESTORE_PROBE",
      value: "kept",
      authToken: jwtAuthToken
    });
    expect((await deleteProject(project.id)).statusCode).toBe(200);

    const deleted = (await listDeletedProjects()).find((p) => p.id === project.id);
    expect(new Date(deleted?.deleteAfter ?? 0).getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000);

    const restoreRes = await restoreProject(project.id);
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.payload).project.slug).toBe(project.slug);
    expect((await getProject(project.id)).statusCode).toBe(200);
    expect((await listDeletedProjects()).some((p) => p.id === project.id)).toBe(false);
    const secret = await getSecretByNameV2({
      workspaceId: project.id,
      environmentSlug: "dev",
      secretPath: "/",
      key: "E2E_RESTORE_PROBE",
      authToken: jwtAuthToken
    });
    expect(secret.secretValue).toBe("kept");

    await deleteProject(project.id, true);
  });
});

describe("Project update (audit logs retention)", async () => {
  test("leaves other fields updatable", async () => {
    const project = await createProject("e2e-retention-other-fields");

    const res = await updateProject(project.id, { name: "e2e-retention-renamed" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).project.name).toBe("e2e-retention-renamed");

    await deleteProject(project.id);
  });
});

describe("Project read (secret manager KMS key)", async () => {
  test("returns kmsSecretManagerKeyId so API clients can confirm which key encrypts the project", async () => {
    const project = await createProject("e2e-read-kms-key");
    // the secret manager key is created lazily on first secret write
    await createSecretV2({
      workspaceId: project.id,
      environmentSlug: "dev",
      secretPath: "/",
      key: "E2E_KMS_KEY_PROBE",
      value: "value",
      authToken: jwtAuthToken
    });
    const kmsKeyId = (await testDb(TableName.Project).where({ id: project.id }).first())?.kmsSecretManagerKeyId;
    expect(kmsKeyId).toBeTruthy();

    const res = await getProject(project.id);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).project.kmsSecretManagerKeyId).toBe(kmsKeyId);

    const deprecatedRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/workspace/${project.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(deprecatedRes.statusCode).toBe(200);
    expect(JSON.parse(deprecatedRes.payload).workspace.kmsSecretManagerKeyId).toBe(kmsKeyId);

    await deleteProject(project.id);
  });
});

describe("Project list pagination", async () => {
  const listAs = async (authToken: string, query = "", url = "/api/v1/projects") =>
    testServer.inject({ method: "GET", url: `${url}${query}`, headers: { authorization: `Bearer ${authToken}` } });

  test("pages an identity's projects by name and reports the full count", async () => {
    const projects = await Promise.all(["e2e-page-b", "e2e-page-c", "e2e-page-a"].map((name) => createProject(name)));
    const { identityId, authToken } = await createIdentityActor({
      orgId: seedData1.organization.id,
      authToken: jwtAuthToken
    });
    for (const project of projects) {
      // eslint-disable-next-line no-await-in-loop
      await addIdentityToProject({
        projectId: project.id,
        identityId,
        role: ProjectMembershipRole.Member,
        authToken: jwtAuthToken
      });
    }

    const names = async (query: string) => {
      const res = await listAs(authToken, query);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { projects: (TProject & { environments: unknown[] })[]; totalCount: number };
      expect(body.totalCount).toBe(3);
      expect(body.projects.every((project) => project.environments.length > 0)).toBe(true);
      return body.projects.map((project) => project.name);
    };

    expect(await names("")).toEqual(["e2e-page-a", "e2e-page-b", "e2e-page-c"]);
    expect(await names("?limit=2")).toEqual(["e2e-page-a", "e2e-page-b"]);
    expect(await names("?limit=2&offset=2")).toEqual(["e2e-page-c"]);
    expect(await names("?offset=1")).toEqual(["e2e-page-b", "e2e-page-c"]);
    expect(await names("?limit=2&offset=5")).toEqual([]);

    const memberships = async (query: string) => {
      const res = await listAs(jwtAuthToken, query, `/api/v1/identities/${identityId}/identity-memberships`);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { identityMemberships: { project: { name: string } }[]; totalCount: number };
      return {
        names: body.identityMemberships.map((membership) => membership.project.name),
        totalCount: body.totalCount
      };
    };
    expect(await memberships("")).toEqual({ names: ["e2e-page-a", "e2e-page-b", "e2e-page-c"], totalCount: 3 });
    expect(await memberships("?limit=2&offset=1")).toEqual({ names: ["e2e-page-b", "e2e-page-c"], totalCount: 3 });
    expect(await memberships("?limit=1&orderDirection=desc")).toEqual({ names: ["e2e-page-c"], totalCount: 3 });
    expect(await memberships("?limit=5&search=PAGE-B")).toEqual({ names: ["e2e-page-b"], totalCount: 1 });
    expect(await memberships("?limit=5&excludeProjectType=secret-manager")).toEqual({ names: [], totalCount: 0 });
    expect(
      (await listAs(jwtAuthToken, "?limit=101", `/api/v1/identities/${identityId}/identity-memberships`)).statusCode
    ).toBe(422);

    await Promise.all(projects.map((project) => deleteProject(project.id, true)));
  });

  test("pages a user's projects on the deprecated route too", async () => {
    const all = await listAs(jwtAuthToken, "", "/api/v1/workspace");
    expect(all.statusCode).toBe(200);
    const { workspaces, totalCount } = all.json() as { workspaces: TProject[]; totalCount: number };
    expect(totalCount).toBe(workspaces.length);
    expect(totalCount).toBeGreaterThan(1);

    const page = await listAs(jwtAuthToken, "?limit=1&offset=1", "/api/v1/workspace");
    expect(page.statusCode).toBe(200);
    expect(page.json().totalCount).toBe(totalCount);
    expect((page.json().workspaces as TProject[]).map((workspace) => workspace.id)).toEqual([workspaces[1].id]);
  });

  test("rejects a limit or offset outside the allowed range", async () => {
    const responses = await Promise.all(
      ["?limit=0", "?limit=101", "?limit=abc", "?offset=-1"].map((query) => listAs(jwtAuthToken, query))
    );
    expect(responses.map((res) => res.statusCode)).toEqual([422, 422, 422, 422]);
  });

  test("pages, searches and orders a user's project memberships", async () => {
    const headers = { authorization: `Bearer ${jwtAuthToken}` };
    const orgId = seedData1.organization.id;
    const projects = await Promise.all(["e2e-upm-b", "E2E-upm-c", "e2e-upm-a"].map((name) => createProject(name)));

    const membersRes = await testServer.inject({
      method: "GET",
      url: `/api/v2/organizations/${orgId}/memberships`,
      headers
    });
    expect(membersRes.statusCode).toBe(200);
    const membershipId = (membersRes.json().users as { id: string; user: { id: string } }[]).find(
      (member) => member.user.id === seedData1.id
    )?.id;
    expect(membershipId).toBeTruthy();

    const list = async (query: string) => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/organizations/${orgId}/memberships/${membershipId}/project-memberships${query}`,
        headers
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { memberships: { project: { name: string }; roles: unknown[] }[]; totalCount: number };
      expect(body.memberships.every((membership) => membership.roles.length > 0)).toBe(true);
      return { names: body.memberships.map((membership) => membership.project.name), totalCount: body.totalCount };
    };

    const all = await list("");
    expect(all.totalCount).toBe(all.names.length);
    expect(all.names).toEqual(expect.arrayContaining(["e2e-upm-a", "e2e-upm-b", "E2E-upm-c"]));

    expect(await list("?search=E2E-UPM&limit=2")).toEqual({ names: ["e2e-upm-a", "e2e-upm-b"], totalCount: 3 });
    expect(await list("?search=e2e-upm&limit=2&offset=2")).toEqual({ names: ["E2E-upm-c"], totalCount: 3 });
    expect(await list("?search=e2e-upm&limit=2&orderDirection=desc")).toEqual({
      names: ["E2E-upm-c", "e2e-upm-b"],
      totalCount: 3
    });
    expect(await list("?search=e2e-upm&excludeProjectType=secret-manager&limit=2")).toEqual({
      names: [],
      totalCount: 0
    });
    expect(await list("?search=e2e_upm%25&limit=2")).toEqual({ names: [], totalCount: 0 });

    const invalid = await testServer.inject({
      method: "GET",
      url: `/api/v2/organizations/${orgId}/memberships/${membershipId}/project-memberships?limit=101`,
      headers
    });
    expect(invalid.statusCode).toBe(422);

    await Promise.all(projects.map((project) => deleteProject(project.id, true)));
  });
});
