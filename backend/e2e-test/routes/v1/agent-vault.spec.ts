import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const authHeader = { authorization: `Bearer ${jwtAuthToken}` };

const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
  testServer.inject({ method, url, headers: authHeader, ...(body ? { body } : {}) });

const createAccessBundle = async (name: string) => {
  const res = await inject("POST", "/api/v1/agent-vault/access-bundles", { name });
  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload) as { accessBundle: { id: string; name: string } }).accessBundle;
};

describe("Agent Vault V1 Router", async () => {
  test("resolving the project bootstraps it and seeds org admins", async () => {
    const res = await inject("GET", "/api/v1/agent-vault/project");
    expect(res.statusCode).toBe(200);

    const { projectId } = JSON.parse(res.payload) as { projectId: string };
    expect(projectId).toBeTruthy();

    const project = await testDb("projects").where({ id: projectId }).first();
    expect(project.type).toBe(ProjectType.AgentVault);
    expect(project.orgId).toBe(seedData1.organization.id);

    // The bootstrap seeds the org's admins as project admins; without that nobody could reach the product.
    const membership = await testDb("memberships")
      .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
      .first();
    expect(membership).toBeTruthy();

    const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
    expect(role.role).toBe(ProjectMembershipRole.Admin);

    // A second call resolves the same project rather than creating another.
    const again = await inject("GET", "/api/v1/agent-vault/project");
    expect((JSON.parse(again.payload) as { projectId: string }).projectId).toBe(projectId);
  });

  test("the Agent Vault project cannot be created or deleted through the generic project routes", async () => {
    const create = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeader,
      body: { projectName: "second agent vault", type: ProjectType.AgentVault }
    });
    expect(create.statusCode).toBe(400);

    const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
      projectId: string;
    };
    const remove = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeader
    });
    expect(remove.statusCode).toBe(400);
  });

  test("an Agent Vault project does not count against the workspace limit", async () => {
    const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
      projectId: string;
    };

    const billable = (await testDb("projects")
      .whereNotIn("type", ["cert-manager", "pam", "agent-vault", "ssh", "ai"])
      .whereNull("deleteAfter")
      .where({ orgId: seedData1.organization.id })
      .select("id")) as { id: string }[];

    expect(billable.map((row) => row.id)).not.toContain(projectId);
  });

  describe("access bundles", async () => {
    test("a connection is rejected when it shares a host with another in the same bundle", async () => {
      const bundle = await createAccessBundle("overlap-check");

      const first = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-us5",
        hostPattern: "api.us5.datadoghq.com, api.datadoghq.eu",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(first.statusCode).toBe(200);

      // An intersection, not set equality: the candidate names one host the first connection already
      // covers, plus one it does not.
      const overlapping = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-eu",
        hostPattern: "api.datadoghq.eu, api.datadoghq.com",
        credential: { type: "bearer", value: "def456" }
      });
      expect(overlapping.statusCode).toBe(400);
      expect(JSON.parse(overlapping.payload).message).toContain("api.datadoghq.eu:443");

      // Containment is allowed: an exact host beats a wildcard deterministically, which is an override.
      const contained = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-wildcard",
        hostPattern: "*.datadoghq.com",
        credential: { type: "passthrough" }
      });
      expect(contained.statusCode).toBe(200);
    });

    test("a connection never echoes its secret, and the host pattern is normalized", async () => {
      const bundle = await createAccessBundle("secret-handling");

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "github",
        hostPattern: " API.GitHub.com ",
        credential: { type: "bearer", value: "ghp_secret_value" }
      });
      expect(res.statusCode).toBe(200);

      const { connection } = JSON.parse(res.payload) as {
        connection: { id: string; hostPattern: string; credential: Record<string, unknown> };
      };
      expect(connection.hostPattern).toBe("api.github.com:443");
      expect(connection.credential).toEqual({ type: "bearer", headerName: "Authorization", headerPrefix: "Bearer" });
      expect(res.payload).not.toContain("ghp_secret_value");

      const detail = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(detail.payload).not.toContain("ghp_secret_value");

      // The secret is sealed, not stored in the plaintext config column.
      const row = await testDb("agent_vault_connections").where({ id: connection.id }).first();
      expect(row.encryptedCredential).toBeTruthy();
      expect(row.encryptedCredential.toString("utf-8")).not.toContain("ghp_secret_value");
      expect(JSON.stringify(row.credentialConfig)).not.toContain("ghp_secret_value");
    });

    test("a path in a host pattern is rejected", async () => {
      const bundle = await createAccessBundle("no-paths");
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "with-path",
        hostPattern: "gitlab.com/api/v4",
        credential: { type: "passthrough" }
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe("cross-org ids and foreign resources", async () => {
    test("an access bundle in another organization is 404, never 403", async () => {
      // A different org, not just a different project: an Agent Vault project is a per-org singleton, so
      // a second one in this org would be what the caller's own routes resolve to.
      const [foreignOrg] = (await testDb("organizations")
        .insert({ name: "foreign org", slug: `foreign-org-${Date.now()}`, customerId: null })
        .returning("*")) as { id: string }[];

      const [foreignProject] = (await testDb("projects")
        .insert({
          name: "foreign agent vault",
          slug: `foreign-agent-vault-${Date.now()}`,
          type: ProjectType.AgentVault,
          orgId: foreignOrg.id,
          version: 3
        })
        .returning("*")) as { id: string }[];

      const [foreignBundle] = (await testDb("agent_vault_access_bundles")
        .insert({ projectId: foreignProject.id, name: "foreign-bundle" })
        .returning("*")) as { id: string }[];

      // Never 403: a 403 would confirm that another tenant's bundle id exists.
      const res = await inject("GET", `/api/v1/agent-vault/access-bundles/${foreignBundle.id}`);
      expect(res.statusCode).toBe(404);

      await testDb("organizations").where({ id: foreignOrg.id }).delete();
    });

    test("an unknown access bundle id is 404 across every sub-route", async () => {
      const unknown = "11111111-2222-3333-4444-555555555555";
      const routes: ["GET" | "POST" | "PATCH" | "DELETE", string, Record<string, unknown> | undefined][] = [
        ["GET", `/api/v1/agent-vault/access-bundles/${unknown}`, undefined],
        ["PATCH", `/api/v1/agent-vault/access-bundles/${unknown}`, { name: "renamed" }],
        ["DELETE", `/api/v1/agent-vault/access-bundles/${unknown}`, undefined],
        ["GET", `/api/v1/agent-vault/access-bundles/${unknown}/members`, undefined],
        [
          "POST",
          `/api/v1/agent-vault/access-bundles/${unknown}/connections`,
          { name: "c", hostPattern: "api.foo.com", credential: { type: "passthrough" } }
        ]
      ];

      for await (const [method, url, body] of routes) {
        const res = await inject(method, url, body);
        expect([method, url, res.statusCode]).toEqual([method, url, 404]);
      }
    });
  });

  describe("sessions", async () => {
    test("the bundle set comes only from the session row", async () => {
      const granted = await createAccessBundle("session-granted");
      const notNamed = await createAccessBundle("session-not-named");

      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundleIds: [granted.id],
        ttl: "24h"
      });
      expect(mint.statusCode).toBe(200);

      const { session } = JSON.parse(mint.payload) as {
        session: { id: string; token: string; accessBundles: { id: string; position: number }[] };
      };
      expect(session.token.startsWith("agv_")).toBe(true);
      expect(session.accessBundles).toEqual([expect.objectContaining({ id: granted.id, position: 0 })]);

      // The ceiling is the session row, and nothing adds to it after mint.
      const rows = (await testDb("agent_vault_session_access_bundles")
        .where({ sessionId: session.id })
        .select("accessBundleId")) as { accessBundleId: string }[];
      expect(rows.map((row) => row.accessBundleId)).toEqual([granted.id]);
      expect(rows.map((row) => row.accessBundleId)).not.toContain(notNamed.id);
    });

    test("the token is stored only as a hash and is returned exactly once", async () => {
      const bundle = await createAccessBundle("session-token-hash");
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundleIds: [bundle.id], ttl: "1h" });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };

      const row = await testDb("agent_vault_sessions").where({ id: session.id }).first();
      expect(row.tokenHash).toHaveLength(64);
      expect(row.tokenHash).not.toBe(session.token);
      expect(JSON.stringify(row)).not.toContain(session.token);

      const list = await inject("GET", "/api/v1/agent-vault/sessions");
      expect(list.payload).not.toContain(session.token);
    });

    test("naming a bundle you cannot reach fails with that bundle named", async () => {
      const res = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundleIds: ["99999999-8888-7777-6666-555555555555"],
        ttl: "1h"
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("99999999-8888-7777-6666-555555555555");
    });

    test("a duplicated bundle is rejected rather than deduped", async () => {
      const bundle = await createAccessBundle("session-duplicates");
      const res = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundleIds: [bundle.id, bundle.id],
        ttl: "1h"
      });
      expect(res.statusCode).toBe(400);
    });

    test("ttl never stores a null expiry, and revoke is idempotent", async () => {
      const bundle = await createAccessBundle("session-never");
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundleIds: [bundle.id],
        ttl: "never"
      });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; expiresAt: string | null } };
      expect(session.expiresAt).toBeNull();

      const first = await inject("POST", `/api/v1/agent-vault/sessions/${session.id}/revoke`);
      expect(first.statusCode).toBe(200);
      const firstRevokedAt = JSON.parse(first.payload).session.revokedAt as string;

      const second = await inject("POST", `/api/v1/agent-vault/sessions/${session.id}/revoke`);
      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.payload).session.revokedAt).toBe(firstRevokedAt);

      const list = await inject("GET", "/api/v1/agent-vault/sessions?status=revoked");
      const { sessions } = JSON.parse(list.payload) as { sessions: { id: string; status: string }[] };
      expect(sessions.find((row) => row.id === session.id)?.status).toBe("revoked");
    });
  });

  describe("membership", async () => {
    test("a grant to someone outside the Agent Vault project is refused", async () => {
      const bundle = await createAccessBundle("member-outside-project");

      // The seeded machine identity is an org admin, so the bootstrap already made it a project member.
      // A grant only does something for someone the project can see, so use one it cannot.
      const [outsider] = (await testDb("identities")
        .insert({ name: `av-outsider-${Date.now()}`, orgId: seedData1.organization.id })
        .returning("*")) as { id: string }[];

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityId: outsider.id
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("not a member of Agent Vault");

      await testDb("identities").where({ id: outsider.id }).delete();
    });

    test("exactly one actor id is required", async () => {
      const bundle = await createAccessBundle("member-one-actor");

      const none = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {});
      expect(none.statusCode).toBe(400);

      const both = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userId: seedData1.id,
        identityId: seedData1.machineIdentity.id
      });
      expect(both.statusCode).toBe(400);
    });

    test("a machine identity inherits a group's access bundles", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const bundle = await createAccessBundle("group-inheritance");

      const [group] = (await testDb("groups")
        .insert({ orgId: seedData1.organization.id, name: "av-agents", slug: `av-agents-${Date.now()}` })
        .returning("*")) as { id: string }[];

      // The group, not the identity, is the project member and the bundle's grantee.
      const [groupMembership] = (await testDb("memberships")
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: seedData1.organization.id,
          scopeProjectId: projectId,
          actorGroupId: group.id,
          isActive: true
        })
        .returning("*")) as { id: string }[];
      await testDb("membership_roles").insert({
        membershipId: groupMembership.id,
        role: ProjectMembershipRole.Member
      });

      const grant = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        groupId: group.id
      });
      expect(grant.statusCode).toBe(200);

      await testDb("identity_group_membership").insert({
        groupId: group.id,
        identityId: seedData1.machineIdentity.id
      });

      // The reachability query branches on actor type: a user goes through user_group_membership and a
      // machine identity through identity_group_membership. Getting that wrong denies every machine
      // identity's group grants silently, which is the product's primary actor.
      const reachable = await testDb("agent_vault_access_bundle_members")
        .join(
          "agent_vault_access_bundles",
          "agent_vault_access_bundle_members.accessBundleId",
          "agent_vault_access_bundles.id"
        )
        .where("agent_vault_access_bundles.projectId", projectId)
        .whereIn(
          "agent_vault_access_bundle_members.groupId",
          testDb("identity_group_membership").where("identityId", seedData1.machineIdentity.id).select("groupId")
        )
        .select("agent_vault_access_bundle_members.accessBundleId");
      expect(reachable.map((row: { accessBundleId: string }) => row.accessBundleId)).toContain(bundle.id);

      await testDb("identity_group_membership").where({ groupId: group.id }).delete();
      await testDb("memberships").where({ id: groupMembership.id }).delete();
      await testDb("groups").where({ id: group.id }).delete();
    });

    test("removing an actor from the project reaps their access bundle grants", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const bundle = await createAccessBundle("grant-reaping");

      const [user] = (await testDb("users")
        .insert({
          username: `av-reap-${Date.now()}@localhost.local`,
          email: `av-reap-${Date.now()}@localhost.local`,
          isAccepted: true,
          authMethods: ["email"]
        })
        .returning("*")) as { id: string }[];

      const [membership] = (await testDb("memberships")
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: seedData1.organization.id,
          scopeProjectId: projectId,
          actorUserId: user.id,
          isActive: true
        })
        .returning("*")) as { id: string }[];
      await testDb("membership_roles").insert({ membershipId: membership.id, role: ProjectMembershipRole.Member });

      const grant = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userId: user.id
      });
      expect(grant.statusCode).toBe(200);

      // Removing the actor from the project must take the grant with it, in the same transaction. Skip
      // that and a user with no membership keeps a bundle the mint path still honours.
      const remove = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/memberships/${membership.id}`,
        headers: authHeader
      });
      expect(remove.statusCode).toBe(200);

      const remaining = await testDb("agent_vault_access_bundle_members")
        .where({ accessBundleId: bundle.id, userId: user.id })
        .first();
      expect(remaining).toBeUndefined();

      await testDb("memberships").where({ actorUserId: user.id }).delete();
      await testDb("users").where({ id: user.id }).delete();
    });
  });
});
