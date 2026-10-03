import { randomUUID } from "node:crypto";

import { selectOrg } from "./auth";

// Full isolation per test: a fresh org and project rather than a fresh project inside the shared
// seeded org. Org-scoped state (roles, membership) can't leak between tests either this way, not
// just project-scoped state. Cheaper alternatives exist (see secret-sync.spec.ts's beforeEach,
// which only creates a fresh project under the shared seeded org) but this is the one to reach for
// by default going forward.
export const createIsolatedOrgAndProject = async (namePrefix: string) => {
  const name = `${namePrefix}-${randomUUID().slice(0, 8)}`;

  const orgRes = await testServer.inject({
    method: "POST",
    url: "/api/v2/organizations",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { name }
  });
  expect(orgRes.statusCode).toBe(200);
  const orgId = orgRes.json().organization.id as string;

  // The org creation token is scoped to whatever org it already carried; project creation reads
  // its org from the token too (project-router.ts), so a token scoped to the new org is required
  // before anything project-shaped can be created in it.
  const selectOrgRes = await selectOrg(jwtAuthToken, orgId);
  expect(selectOrgRes.statusCode).toBe(200);
  const authToken = selectOrgRes.payload.token as string;

  const projectRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: { authorization: `Bearer ${authToken}` },
    body: { projectName: name }
  });
  expect(projectRes.statusCode).toBe(200);
  const projectId = projectRes.json().project.id as string;

  // Hard-deletes the org row; every project/environment/secret/webhook underneath it is reaped by
  // FK cascade (org-service.ts:deleteOrganizationById), so there's nothing else to tear down.
  // Asserted so a silent cleanup failure surfaces here rather than as leaked org-scoped state in a
  // later suite.
  const cleanup = async () => {
    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${orgId}`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(deleteRes.statusCode).toBe(200);
  };

  return { orgId, projectId, authToken, cleanup };
};
