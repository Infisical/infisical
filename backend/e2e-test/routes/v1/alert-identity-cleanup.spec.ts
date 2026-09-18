import { OrgMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const RESOURCE_TYPE = "identity.authentication";
const EVENT_TYPE = "identity.authentication.expiry";

const createOrgIdentity = async (name: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    body: { name, role: OrgMembershipRole.Admin, organizationId: seedData1.organization.id },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json().identity as { id: string; name: string };
};

const createProjectIdentity = async (name: string, projectId: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/identities`,
    body: { name, roles: [{ role: "admin" }] },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json().identity as { id: string; name: string };
};

const createAlert = async (opts: { identityId: string; name: string; projectId?: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/alerts",
    body: {
      name: opts.name,
      resourceType: RESOURCE_TYPE,
      resourceId: opts.identityId,
      eventType: EVENT_TYPE,
      condition: { alertBefore: "30d" },
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      channels: [
        {
          name: `${opts.name}-email`,
          channelType: "email",
          config: {},
          recipients: [{ principalType: "user", principalId: seedData1.id }]
        }
      ]
    },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json().alert as { id: string; channels: { id: string }[] };
};

const alertRows = async (identityId: string) =>
  testDb("alerts").where({ resourceType: RESOURCE_TYPE, resourceId: identityId }).select("id", "orgId", "projectId");

describe("Alert cleanup on identity deletion", async () => {
  test("hard delete via the org identity route (identity-v2) reaps the identity's alerts", async () => {
    const identity = await createOrgIdentity("alert-cleanup-v2");
    const alert = await createAlert({ identityId: identity.id, name: "v2-hard-delete" });

    expect(await alertRows(identity.id)).toHaveLength(1);

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/organization/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(res.statusCode).toBe(200);

    expect(await alertRows(identity.id)).toEqual([]);
    // The channel and its membership must go with the alert, not linger as orphans.
    expect(await testDb("alert_channels").where({ id: alert.channels[0].id })).toEqual([]);
    expect(await testDb("alert_channel_memberships").where({ alertId: alert.id })).toEqual([]);
  });

  test("hard delete via the legacy v1 identity route reaps the identity's alerts", async () => {
    const identity = await createOrgIdentity("alert-cleanup-v1");
    await createAlert({ identityId: identity.id, name: "v1-hard-delete" });

    expect(await alertRows(identity.id)).toHaveLength(1);

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(res.statusCode).toBe(200);

    expect(await alertRows(identity.id)).toEqual([]);
  });

  test("hard delete reaps the identity's alerts in other orgs too", async () => {
    const identity = await createOrgIdentity("alert-cleanup-cross-org");
    await createAlert({ identityId: identity.id, name: "cross-org-home" });

    // A second org watching the same identity. Inserted directly: there is no API for creating an
    // alert in an org the caller's token is not scoped to.
    const [otherOrg] = await testDb("organizations")
      .insert({ name: "alert-cleanup-other-org", slug: "alert-cleanup-other-org" })
      .returning("id");
    await testDb("alerts").insert({
      name: "cross-org-foreign",
      resourceType: RESOURCE_TYPE,
      resourceId: identity.id,
      eventType: EVENT_TYPE,
      triggerType: "scheduled",
      orgId: otherOrg.id,
      createdByActorId: seedData1.id,
      createdByActorType: "user"
    });

    expect(await alertRows(identity.id)).toHaveLength(2);

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/organization/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(res.statusCode).toBe(200);

    expect(await alertRows(identity.id)).toEqual([]);

    await testDb("organizations").where({ id: otherOrg.id }).delete();
  });

  test("removing a project membership reaps the project alert and spares the org alert", async () => {
    const identity = await createOrgIdentity("alert-cleanup-membership");
    const orgAlert = await createAlert({ identityId: identity.id, name: "membership-org-scoped" });

    const addRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities/${identity.id}`,
      body: { roles: [{ role: "admin" }] },
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(addRes.statusCode).toBe(200);

    const projectAlert = await createAlert({
      identityId: identity.id,
      name: "membership-project-scoped",
      projectId: seedData1.project.id
    });

    expect(await alertRows(identity.id)).toHaveLength(2);

    const removeRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(removeRes.statusCode).toBe(200);

    const remaining = await alertRows(identity.id);
    expect(remaining.map((a) => a.id)).toEqual([orgAlert.id]);
    expect(remaining.map((a) => a.id)).not.toContain(projectAlert.id);

    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/organization/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
  });

  test("deleting a project-scoped identity reaps its project alert", async () => {
    const identity = await createProjectIdentity("alert-cleanup-project-identity", seedData1.project.id);
    await createAlert({
      identityId: identity.id,
      name: "project-identity-scoped",
      projectId: seedData1.project.id
    });

    expect(await alertRows(identity.id)).toHaveLength(1);

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${seedData1.project.id}/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(res.statusCode).toBe(200);

    expect(await alertRows(identity.id)).toEqual([]);
  });
});
