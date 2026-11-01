import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

// The route that updates an identity's org membership takes no isActive, so the service is driven
// directly: it is the same path a future route would take, and it owns the revoke and restore hooks
// that keep cached token verdicts honest.
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createProjectGroup, deleteGroups } from "e2e-test/testUtils/groups";
import { createIdentityActor } from "e2e-test/testUtils/identities";

type TMembershipIdentityService = {
  updateMembership: (dto: unknown) => Promise<unknown>;
};

const membershipIdentity = () =>
  (globalThis as unknown as { testServices: { membershipIdentity: TMembershipIdentityService } }).testServices
    .membershipIdentity;

const setActive = async (orgId: string, identityId: string, isActive: boolean) => {
  await membershipIdentity().updateMembership({
    permission: {
      type: ActorType.USER,
      id: seedData1.id,
      authMethod: AuthMethod.EMAIL,
      orgId,
      rootOrgId: orgId,
      parentOrgId: orgId
    },
    scopeData: { scope: AccessScope.Organization, orgId },
    selector: { identityId },
    data: { isActive, roles: [{ role: OrgMembershipRole.Member, isTemporary: false }] }
  });
};

const details = (token: string) =>
  testServer.inject({
    method: "GET",
    url: "/api/v1/identities/details",
    headers: { authorization: `Bearer ${token}` }
  });

describe("Machine identity org membership deactivation", () => {
  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("identity-deactivation"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("an identity's token is refused while its org membership is deactivated and accepted again once reactivated", async () => {
    const identity = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    expect((await details(identity.authToken)).statusCode).toBe(200);

    await setActive(orgId, identity.identityId, false);

    // Deactivation writes the same org revocation marker as removal, so a token issued before it is
    // refused with the removal message; the inactive message is only reached on the cold path.
    const refused = await details(identity.authToken);
    expect(refused.statusCode).toBe(401);
    expect(refused.json().message).toBe("Failed to authorize: Identity is not a member of the organization");

    await setActive(orgId, identity.identityId, true);

    expect((await details(identity.authToken)).statusCode).toBe(200);
  });

  test("an identity whose org membership is deactivated cannot be added to a project", async () => {
    const identity = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    const active = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    await setActive(orgId, identity.identityId, false);
    const addToProject = (identityId: string) =>
      testServer.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/memberships/identities/${identityId}`,
        headers: { authorization: `Bearer ${authToken}` },
        body: { roles: [{ role: ProjectMembershipRole.Viewer }] }
      });

    expect((await addToProject(active.identityId)).statusCode).toBe(200);
    const res = await addToProject(identity.identityId);

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(
      `Machine identity '${identity.identityId}' is not an active member of this organization`
    );
    const members = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/memberships/identities`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(
      (members.json().identityMemberships as { identityId: string }[]).some((m) => m.identityId === identity.identityId)
    ).toBe(false);
  });

  test("an identity whose org membership is deactivated gets no access through a group", async () => {
    const identity = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    const group = await createProjectGroup({ orgId, projectId, userIds: [] });
    await testDb(TableName.IdentityGroupMembership).insert({ identityId: identity.identityId, groupId: group.id });
    const readProject = () =>
      testServer.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${identity.authToken}` }
      });

    try {
      expect((await readProject()).statusCode).toBe(200);

      await setActive(orgId, identity.identityId, false);

      const refused = await readProject();
      expect(refused.statusCode).toBe(401);
      expect(refused.json().message).toBe("Failed to authorize: Identity is not a member of the organization");
    } finally {
      await deleteGroups([group.id]);
    }
  });
});
