import crypto from "node:crypto";

import { AccessScope, ActionProjectType, OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { agentVaultAccessBundleDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { agentVaultProxyDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-dal";
import { agentVaultProxyServiceFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-service";
import { agentVaultResolveDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-resolve-dal";
import { agentVaultSessionAccessBundleDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-access-bundle-dal";
import { agentVaultSessionDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-dal";
import { agentVaultSessionServiceFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-service";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { UnauthorizedError } from "@app/lib/errors";
import { initLogger } from "@app/lib/logger";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { usageCounterDALFactory } from "@app/services/license-client/usage/usage-counter-dal";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

declare const testKeyStore: TKeyStoreFactory;

initLogger();

const authHeader = { authorization: `Bearer ${jwtAuthToken}` };

const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
  testServer.inject({ method, url, headers: authHeader, ...(body ? { body } : {}) });

const createOrgIdentity = async (name: string) => {
  const [identity] = (await testDb("identities").insert({ name, orgId: seedData1.organization.id }).returning("*")) as {
    id: string;
  }[];
  await testDb("memberships").insert({
    scope: AccessScope.Organization,
    scopeOrgId: seedData1.organization.id,
    actorIdentityId: identity.id
  });
  return identity;
};

const deleteOrgIdentity = async (identityId: string) => {
  await testDb("memberships").where({ actorIdentityId: identityId }).del();
  await testDb("identities").where({ id: identityId }).delete();
};

const buildPermissionService = () =>
  permissionServiceFactory({
    permissionDAL: permissionDALFactory(testDb),
    serviceTokenDAL: serviceTokenDALFactory(testDb),
    projectDAL: projectDALFactory(testDb),
    keyStore: testKeyStore,
    roleDAL: roleDALFactory(testDb),
    userDAL: userDALFactory(testDb),
    identityDAL: identityDALFactory(testDb),
    additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb),
    groupDAL: groupDALFactory(testDb),
    secretFolderDAL: secretFolderDALFactory(testDb)
  });

const grantRows = (
  accessBundleId: string,
  actor: { actorUserId?: string; actorIdentityId?: string; actorGroupId?: string } = {}
) =>
  testDb("memberships").where({
    scope: "resource",
    scopeResourceType: "agent-vault-access-bundle",
    scopeResourceId: accessBundleId,
    ...actor
  });

const createUaIdentity = async (name: string) => {
  const created = await inject("POST", "/api/v1/identities", {
    name,
    role: OrgMembershipRole.Member,
    organizationId: seedData1.organization.id
  });
  expect(created.statusCode).toBe(200);
  const identity = created.json().identity as { id: string };

  const attached = await inject("POST", `/api/v1/auth/universal-auth/identities/${identity.id}`, {
    accessTokenTTL: 3600,
    accessTokenMaxTTL: 3600,
    accessTokenNumUsesLimit: 0
  });
  expect(attached.statusCode).toBe(200);
  const clientId = attached.json().identityUniversalAuth.clientId as string;

  const secret = await inject("POST", `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`, {});
  expect(secret.statusCode).toBe(200);
  const { clientSecret } = secret.json();

  const login = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret }
  });
  expect(login.statusCode).toBe(200);
  const token = login.json().accessToken as string;

  const asIdentity = (method: "GET" | "POST" | "DELETE", url: string, body?: Record<string, unknown>) =>
    testServer.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) });

  return { id: identity.id, asIdentity };
};

const deleteUaIdentity = async (identityId: string) => {
  expect((await inject("DELETE", `/api/v1/identities/${identityId}`)).statusCode).toBe(200);
};

const createProjectGroup = async (projectId: string, name: string, role: ProjectMembershipRole) => {
  const [group] = (await testDb("groups")
    .insert({ orgId: seedData1.organization.id, name, slug: `${name}-${Date.now()}` })
    .returning("*")) as { id: string }[];
  const [membership] = (await testDb("memberships")
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: seedData1.organization.id,
      scopeProjectId: projectId,
      actorGroupId: group.id,
      isActive: true
    })
    .returning("*")) as { id: string }[];
  await testDb("membership_roles").insert({ membershipId: membership.id, role });
  return {
    id: group.id,
    cleanup: async () => {
      await testDb("identity_group_membership").where({ groupId: group.id }).delete();
      await testDb("memberships").where({ id: membership.id }).delete();
      await testDb("groups").where({ id: group.id }).delete();
    }
  };
};

const getProjectId = async () =>
  (JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as { projectId: string }).projectId;

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

    const membership = await testDb("memberships")
      .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
      .first();
    expect(membership).toBeTruthy();

    const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
    expect(role.role).toBe(ProjectMembershipRole.Admin);

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
    test("the creator is granted the access bundle they just made", async () => {
      const bundle = await createAccessBundle("creator-grant");

      const res = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      const { accessBundle } = JSON.parse(res.payload) as {
        accessBundle: { members: { userId: string | null; identityId: string | null }[] };
      };

      expect(accessBundle.members).toHaveLength(1);
      expect(accessBundle.members[0].userId).toBe(seedData1.id);
    });

    test("two concurrent creates for the same host do not both get in", async () => {
      const bundle = await createAccessBundle("race-hosts");
      const attempts = await Promise.all(
        [1, 2].map((n) =>
          inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
            name: `race-${n}`,
            hostPattern: "api.raced.example.com",
            credential: { type: "passthrough" }
          })
        )
      );

      // One wins, the other is refused for the overlap rather than both landing.
      expect(attempts.filter((res) => res.statusCode === 200)).toHaveLength(1);
      const refused = attempts.find((res) => res.statusCode !== 200)!;
      expect(refused.statusCode).toBe(400);
      expect(JSON.parse(refused.payload).message).toContain("api.raced.example.com");

      const rows = await testDb("agent_vault_connections").where({ accessBundleId: bundle.id });
      expect(rows).toHaveLength(1);
    });

    test("a connection is rejected when it shares a host with another in the same bundle", async () => {
      const bundle = await createAccessBundle("overlap-check");

      const first = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-us5",
        hostPattern: "api.us5.datadoghq.com, api.datadoghq.eu",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(first.statusCode).toBe(200);

      const overlapping = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-eu",
        hostPattern: "api.datadoghq.eu, api.datadoghq.com",
        credential: { type: "bearer", value: "def456" }
      });
      expect(overlapping.statusCode).toBe(400);
      expect(JSON.parse(overlapping.payload).message).toContain("api.datadoghq.eu:443");

      const contained = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog-wildcard",
        hostPattern: "*.datadoghq.com",
        credential: { type: "passthrough" }
      });
      expect(contained.statusCode).toBe(200);
    });

    test("a connection never echoes its secret, and its host pattern is kept as typed", async () => {
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
      expect(connection.hostPattern).toBe("API.GitHub.com");
      expect(connection.credential).toEqual({ type: "bearer", headerName: "Authorization", headerPrefix: "Bearer" });
      expect(res.payload).not.toContain("ghp_secret_value");

      const detail = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(detail.payload).not.toContain("ghp_secret_value");

      const row = await testDb("agent_vault_connections").where({ id: connection.id }).first();
      expect(row.encryptedCredential).toBeTruthy();
      expect(row.encryptedCredential.toString("utf-8")).not.toContain("ghp_secret_value");
      expect(JSON.stringify(row.credentialConfig)).not.toContain("ghp_secret_value");
    });

    test("updating a connection patches the credential instead of replacing it", async () => {
      const bundle = await createAccessBundle("credential-patch");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(created.statusCode).toBe(200);
      const { connection } = JSON.parse(created.payload) as { connection: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/connections/${connection.id}`;
      const sealed = async () =>
        (await testDb("agent_vault_connections").where({ id: connection.id }).first()).encryptedCredential;

      const before = await sealed();
      const rotated = await inject("PATCH", url, { credential: { type: "bearer", value: "rotated456" } });
      expect(rotated.statusCode).toBe(200);
      expect(JSON.parse(rotated.payload).connection.credential).toEqual({
        type: "bearer",
        headerName: "DD-API-KEY",
        headerPrefix: ""
      });
      expect((await sealed()).equals(before)).toBe(false);

      const afterRotate = await sealed();
      const renamed = await inject("PATCH", url, { credential: { type: "bearer", headerName: "X-Api-Key" } });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).connection.credential.headerName).toBe("X-Api-Key");
      expect((await sealed()).equals(afterRotate)).toBe(true);
    });

    test("a basic credential keeps one half while the other changes, and refuses to lose both", async () => {
      const bundle = await createAccessBundle("basic-halves");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "stripe",
        hostPattern: "api.stripe.com",
        credential: { type: "basic", username: "sk_live_key", password: "" }
      });
      expect(created.statusCode).toBe(200);
      const { connection } = JSON.parse(created.payload) as {
        connection: { id: string; credential: Record<string, unknown> };
      };
      expect(connection.credential).toEqual({ type: "basic" });
      expect(created.payload).not.toContain("sk_live_key");

      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/connections/${connection.id}`;
      const sealedPair = async () => {
        const row = await testDb("agent_vault_connections").where({ id: connection.id }).first();
        expect(JSON.stringify(row.credentialConfig)).not.toContain("sk_live_key");
        return row.encryptedCredential as Buffer;
      };
      const before = await sealedPair();

      const emptied = await inject("PATCH", url, { credential: { type: "basic", username: "" } });
      expect(emptied.statusCode).toBe(400);
      expect((await sealedPair()).equals(before)).toBe(true);

      const flipped = await inject("PATCH", url, { credential: { type: "basic", username: "", password: "hunter2" } });
      expect(flipped.statusCode).toBe(200);
      expect((await sealedPair()).equals(before)).toBe(false);

      const named = await inject("PATCH", url, { credential: { type: "basic", username: "sk_live_key" } });
      expect(named.statusCode).toBe(200);
      const cleared = await inject("PATCH", url, { credential: { type: "basic", password: "" } });
      expect(cleared.statusCode).toBe(200);
      const emptiedAgain = await inject("PATCH", url, { credential: { type: "basic", username: "" } });
      expect(emptiedAgain.statusCode).toBe(400);

      const afterClear = await sealedPair();
      const renamed = await inject("PATCH", url, { name: "stripe-live" });
      expect(renamed.statusCode).toBe(200);
      expect((await sealedPair()).equals(afterClear)).toBe(true);
    });

    test("changing the credential type requires whatever the new type needs", async () => {
      const bundle = await createAccessBundle("type-change");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", value: "ghp_one" }
      });
      const { connection } = JSON.parse(created.payload) as { connection: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/connections/${connection.id}`;

      const emptyBasic = await inject("PATCH", url, { credential: { type: "basic" } });
      expect(emptyBasic.statusCode).toBe(400);

      const noSecret = await inject("PATCH", url, { credential: { type: "basic", username: "bot" } });
      expect(noSecret.statusCode).toBe(200);

      const bearerNoValue = await inject("PATCH", url, { credential: { type: "bearer" } });
      expect(bearerNoValue.statusCode).toBe(400);
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

  describe("product membership", async () => {
    const memberships = "/api/v1/agent-vault/memberships";

    test("a machine identity can be given Agent Vault, have its role changed, and lose it again", async () => {
      const identity = await createOrgIdentity(`av-membership-${Date.now()}`);

      const added = await inject("POST", `${memberships}/identities/${identity.id}`, { role: "member" });
      expect(added.statusCode).toBe(200);

      const listed = await inject("GET", `${memberships}/identity-members`);
      const { members } = JSON.parse(listed.payload) as {
        members: { identityId: string; role: string; name: string }[];
      };
      const row = members.find((m) => m.identityId === identity.id);
      expect(row?.role).toBe("member");
      expect(row?.name).toBeTruthy();

      const promoted = await inject("PATCH", `${memberships}/identities/${identity.id}`, { role: "admin" });
      expect(promoted.statusCode).toBe(200);
      expect(JSON.parse(promoted.payload).role).toBe("admin");

      const removed = await inject("DELETE", `${memberships}/identities/${identity.id}`);
      expect(removed.statusCode).toBe(200);

      const after = JSON.parse((await inject("GET", `${memberships}/identity-members`)).payload) as {
        members: { identityId: string }[];
      };
      expect(after.members.some((m) => m.identityId === identity.id)).toBe(false);

      await deleteOrgIdentity(identity.id);
    });

    test("removing a user from the organization takes their grants too", async () => {
      const bundle = await createAccessBundle("org-removal-reap");
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };

      const [user] = (await testDb("users")
        .insert({ username: `av-org-reap-${Date.now()}@example.com`, isAccepted: true, isGhost: false })
        .returning("*")) as { id: string }[];
      const [orgMembership] = (await testDb("memberships")
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: seedData1.organization.id,
          actorUserId: user.id,
          status: "accepted"
        })
        .returning("*")) as { id: string }[];
      const [projectMembership] = (await testDb("memberships")
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: seedData1.organization.id,
          scopeProjectId: projectId,
          actorUserId: user.id
        })
        .returning("*")) as { id: string }[];
      await testDb("membership_roles").insert({
        membershipId: projectMembership.id,
        role: ProjectMembershipRole.Member
      });

      const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userIds: [user.id]
      });
      expect(granted.statusCode).toBe(200);
      expect(await grantRows(bundle.id, { actorUserId: user.id })).toHaveLength(1);

      const removed = await testServer.inject({
        method: "DELETE",
        url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${orgMembership.id}`,
        headers: authHeader
      });
      expect(removed.statusCode).toBe(200);

      expect(await grantRows(bundle.id, { actorUserId: user.id })).toHaveLength(0);

      await testDb("users").where({ id: user.id }).delete();
    });

    test("removing a member takes their access bundle grants with them", async () => {
      const bundle = await createAccessBundle("membership-reap");

      const identity = await createOrgIdentity(`av-reap-${Date.now()}`);

      expect((await inject("POST", `${memberships}/identities/${identity.id}`, { role: "member" })).statusCode).toBe(
        200
      );
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
            identityIds: [identity.id]
          })
        ).statusCode
      ).toBe(200);

      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(1);

      expect((await inject("DELETE", `${memberships}/identities/${identity.id}`)).statusCode).toBe(200);

      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(0);

      await deleteOrgIdentity(identity.id);
    });

    test("the guards that keep the product administrable hold", async () => {
      const self = await inject("DELETE", `${memberships}/users/${seedData1.id}`);
      expect(self.statusCode).toBe(403);

      const unknown = await inject("POST", `${memberships}/identities/00000000-0000-0000-0000-000000000000`, {
        role: "member"
      });
      expect(unknown.statusCode).toBe(404);

      const badRole = await inject("PATCH", `${memberships}/users/${seedData1.id}`, { role: "viewer" });
      expect(badRole.statusCode).toBe(422);

      const notAnId = await inject("DELETE", `${memberships}/users/not-a-uuid`);
      expect(notAnId.statusCode).toBe(422);
    });
  });

  describe("cross-org ids and foreign resources", async () => {
    test("an access bundle in another organization is 404, never 403", async () => {
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
    test("the bundle comes only from the session row", async () => {
      const granted = await createAccessBundle("session-granted");
      const notNamed = await createAccessBundle("session-not-named");

      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [granted.name],
        ttl: "24h"
      });
      expect(mint.statusCode).toBe(200);

      const { session } = JSON.parse(mint.payload) as {
        session: { id: string; token: string; accessBundles: { id: string; position: number }[] };
      };
      expect(session.token.startsWith("agv_")).toBe(true);
      expect(session.accessBundles).toEqual([expect.objectContaining({ id: granted.id, position: 0 })]);

      const rows = (await testDb("agent_vault_session_access_bundles")
        .where({ sessionId: session.id })
        .select("accessBundleId")) as { accessBundleId: string }[];
      expect(rows.map((row) => row.accessBundleId)).toEqual([granted.id]);
      expect(rows.map((row) => row.accessBundleId)).not.toContain(notNamed.id);
    });

    test("the token is stored only as a hash and is returned exactly once", async () => {
      const bundle = await createAccessBundle("session-token-hash");
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h" });
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
        accessBundles: ["session-no-such-bundle"],
        ttl: "1h"
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("session-no-such-bundle");
    });

    test("a second access bundle is rejected", async () => {
      const res = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: ["session-cap-alpha", "session-cap-beta"],
        ttl: "1h"
      });
      expect(res.statusCode).toBe(422);
      const issues = JSON.parse(res.payload).message as { path: string[] }[];
      expect(issues.some((issue) => issue.path.join(".") === "accessBundles")).toBe(true);
    });

    test("search filters and counts on the server, not just the page", async () => {
      const alpha = await createAccessBundle("search-alpha");
      const beta = await createAccessBundle("search-beta");
      for await (const bundle of [alpha, beta]) {
        const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
          accessBundles: [bundle.name],
          ttl: "1h"
        });
        expect(mint.statusCode).toBe(200);
      }

      const byBundle = await inject("GET", "/api/v1/agent-vault/sessions?search=search-alpha");
      expect(byBundle.statusCode).toBe(200);
      const matched = JSON.parse(byBundle.payload) as {
        sessions: { accessBundles: { name: string }[] }[];
        totalCount: number;
      };
      expect(matched.sessions).toHaveLength(1);
      expect(matched.sessions[0].accessBundles[0].name).toBe("search-alpha");
      // The count has to describe the filtered set, or the pager offers pages that do not exist.
      expect(matched.totalCount).toBe(1);

      // The list shows the live actor name, so the search has to reach it and not only the mint snapshot.
      const byActor = await inject(
        "GET",
        `/api/v1/agent-vault/sessions?search=${encodeURIComponent(seedData1.username)}`
      );
      const byActorBody = JSON.parse(byActor.payload) as { totalCount: number };
      expect(byActorBody.totalCount).toBeGreaterThan(0);

      const noMatch = await inject("GET", "/api/v1/agent-vault/sessions?search=search-nothing");
      const empty = JSON.parse(noMatch.payload) as { sessions: unknown[]; totalCount: number };
      expect(empty.sessions).toHaveLength(0);
      expect(empty.totalCount).toBe(0);
    });

    test("search covers every name a row can display, and pages within the match", async () => {
      // scope=all throughout: a session whose actor was deleted has no userId, so it belongs to nobody and
      // the default Mine scope filters it out. Only an admin listing everyone's sessions can see it.
      const list = async (query: string) => {
        const res = await inject("GET", `/api/v1/agent-vault/sessions?scope=all&${query}`);
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.payload) as {
          sessions: { id: string; actorName: string; accessBundles: { name: string }[] }[];
          totalCount: number;
        };
      };

      const bundles = await Promise.all(
        ["matrix-stripe", "matrix-github", "matrix-openai"].map((name) => createAccessBundle(name))
      );
      const minted: string[] = [];
      for await (const bundle of bundles) {
        // Two sessions per bundle, so a match has to page rather than fit on one screen.
        for await (const attempt of [1, 2]) {
          const res = await inject("POST", "/api/v1/agent-vault/sessions", {
            accessBundles: [bundle.name],
            ttl: "1h"
          });
          expect(res.statusCode, `mint ${attempt} over ${bundle.name}`).toBe(200);
          minted.push((JSON.parse(res.payload) as { session: { id: string } }).session.id);
        }
      }

      // A deleted actor: the row keeps the snapshot the mint took, and nothing to join to.
      const orphaned = minted[0];
      await testDb("agent_vault_sessions")
        .where({ id: orphaned })
        .update({ userId: null, identityId: null, actorName: "Gone Person", actorEmail: "gone@example.com" });

      // A deleted bundle: the junction keeps its snapshot name.
      const deletedBundle = await createAccessBundle("matrix-retired");
      const overRetired = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [deletedBundle.name],
        ttl: "1h"
      });
      expect(overRetired.statusCode).toBe(200);
      expect((await inject("DELETE", `/api/v1/agent-vault/access-bundles/${deletedBundle.id}`)).statusCode).toBe(200);

      const cases: { why: string; query: string; expect: (r: Awaited<ReturnType<typeof list>>) => void }[] = [
        {
          why: "a live bundle name",
          query: "search=matrix-stripe&limit=100",
          expect: (r) => {
            expect(r.totalCount).toBe(2);
            expect(r.sessions.every((row) => row.accessBundles[0].name === "matrix-stripe")).toBe(true);
          }
        },
        {
          why: "a prefix shared by several bundles",
          query: "search=matrix-&limit=100",
          expect: (r) => expect(r.totalCount).toBe(7)
        },
        {
          why: "case is ignored",
          query: "search=MATRIX-GITHUB&limit=100",
          expect: (r) => expect(r.totalCount).toBe(2)
        },
        {
          why: "the live actor name, from the joined user",
          query: `search=${encodeURIComponent(seedData1.username)}&limit=100`,
          expect: (r) => expect(r.totalCount).toBeGreaterThan(0)
        },
        {
          why: "the snapshot name once the actor is gone",
          query: "search=Gone%20Person&limit=100",
          expect: (r) => {
            expect(r.totalCount).toBe(1);
            expect(r.sessions[0].id).toBe(orphaned);
          }
        },
        {
          why: "the snapshot email once the actor is gone",
          query: "search=gone@example.com&limit=100",
          expect: (r) => expect(r.sessions.map((row) => row.id)).toEqual([orphaned])
        },
        {
          why: "a deleted bundle, by the name the junction kept",
          query: "search=matrix-retired&limit=100",
          expect: (r) => expect(r.totalCount).toBe(1)
        },
        {
          why: "a LIKE wildcard is a literal, not a pattern",
          query: "search=%25&limit=100",
          expect: (r) => expect(r.totalCount).toBe(0)
        },
        {
          why: "an underscore is a literal too",
          query: "search=matrix_stripe&limit=100",
          expect: (r) => expect(r.totalCount).toBe(0)
        },
        {
          why: "no match reports nothing, so the pager can hide",
          query: "search=matrix-nothing-here&limit=100",
          expect: (r) => {
            expect(r.sessions).toHaveLength(0);
            expect(r.totalCount).toBe(0);
          }
        },
        {
          why: "the count describes the match, and the page is a slice of it",
          query: "search=matrix-&limit=3&offset=0",
          expect: (r) => {
            expect(r.sessions).toHaveLength(3);
            expect(r.totalCount).toBe(7);
          }
        },
        {
          why: "the last page of a match is partial, not empty",
          query: "search=matrix-&limit=3&offset=6",
          expect: (r) => {
            expect(r.sessions).toHaveLength(1);
            expect(r.totalCount).toBe(7);
          }
        },
        {
          why: "search and status narrow together",
          query: "search=matrix-&status=active&limit=100",
          expect: (r) => expect(r.totalCount).toBe(7)
        },
        {
          why: "a status with no members inside the match is empty",
          query: "search=matrix-&status=revoked&limit=100",
          expect: (r) => expect(r.totalCount).toBe(0)
        }
      ];

      for await (const testCase of cases) {
        const result = await list(testCase.query);
        try {
          testCase.expect(result);
        } catch (err) {
          throw new Error(`search case failed (${testCase.why}): ${(err as Error).message}`);
        }
      }
    });

    test("a bundle name that is not a slug is rejected before the lookup", async () => {
      const bundle = await createAccessBundle("session-uppercase");
      const res = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name.toUpperCase()],
        ttl: "1h"
      });
      expect(res.statusCode).toBe(422);
    });

    test("ttl never stores a null expiry, and revoke is idempotent", async () => {
      const bundle = await createAccessBundle("session-never");
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
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

  describe("session resolve", async () => {
    const buildResolver = () =>
      agentVaultProxyServiceFactory({
        agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
        agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        resourceAuthMethodService: {} as never
      });

    test("a deactivated actor stops resolving, and resolves again once reactivated", async () => {
      const bundle = await createAccessBundle("resolve-deactivation");
      const connection = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "passthrough" }
      });
      expect(connection.statusCode).toBe(200);

      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "never"
      });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };

      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "resolve-deactivation" });
      expect(proxyRes.statusCode).toBe(200);
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      const resolver = buildResolver();
      const resolve = () =>
        resolver.resolveSession({
          proxyId: proxy.id,
          orgId: seedData1.organization.id,
          sessionToken: session.token
        });

      const membership = await testDb("memberships")
        .where({ scope: AccessScope.Organization, scopeOrgId: seedData1.organization.id, actorUserId: seedData1.id })
        .first();

      const before = await resolve();
      expect(before.connections).toHaveLength(1);

      try {
        await testDb("memberships").where({ id: membership.id }).update({ isActive: false });
        await expect(resolve()).rejects.toThrow(UnauthorizedError);
      } finally {
        await testDb("memberships").where({ id: membership.id }).update({ isActive: true });
      }

      const after = await resolve();
      expect(after.connections).toHaveLength(1);
    });
    test("an expired time-limited role stops resolving even though its membership row remains", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const bundle = await createAccessBundle("resolve-temporary-role");
      await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "passthrough" }
      });
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "never" });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "resolve-temporary-role" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      const resolver = agentVaultProxyServiceFactory({
        agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
        agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        resourceAuthMethodService: {} as never
      });
      const resolve = () =>
        resolver.resolveSession({ proxyId: proxy.id, orgId: seedData1.organization.id, sessionToken: session.token });

      const membership = await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
        .first();
      const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();

      // getProjectPermission caches the raw membership rows for ten seconds, so clear it around each flip.
      const cacheKeys = [
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault)
      ];

      try {
        await testDb("membership_roles")
          .where({ id: role.id })
          .update({ isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) });
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);
        await expect(resolve()).rejects.toThrow(UnauthorizedError);
      } finally {
        await testDb("membership_roles")
          .where({ id: role.id })
          .update({ isTemporary: false, temporaryAccessEndTime: null });
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);
      }

      expect((await resolve()).connections).toHaveLength(1);
    });
  });

  describe("proxies", async () => {
    test("revoking access also burns an enrollment token minted before the revoke", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: "revoke-burns-token" });
      expect(created.statusCode).toBe(200);
      const { proxy } = JSON.parse(created.payload) as { proxy: { id: string } };

      const pendingTokens = async () => {
        const row = (await testDb("resource_token_auths")
          .join("resource_auth_methods", "resource_auth_methods.id", "resource_token_auths.authMethodId")
          .where("resource_auth_methods.agentVaultProxyId", proxy.id)
          .count("resource_token_auths.id as count")
          .first()) as { count: string };
        return Number(row.count);
      };
      expect(await pendingTokens()).toBe(1);

      const revoked = await inject("POST", `/api/v1/agent-vault/proxies/${proxy.id}/revoke`);
      expect(revoked.statusCode).toBe(200);
      expect(await pendingTokens()).toBe(0);

      const row = await testDb("agent_vault_proxies").where({ id: proxy.id }).first();
      expect(row.tokenVersion).toBe(1);
      expect(row.heartbeat).toBeNull();
    });
  });

  describe("retention sweep", async () => {
    test("reaps sessions a month after they stopped working and leaves live ones alone", async () => {
      const bundle = await createAccessBundle("sweep-bundle");
      const mintOne = async (ttl: string) => {
        const res = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl });
        expect(res.statusCode).toBe(200);
        return (JSON.parse(res.payload) as { session: { id: string } }).session.id;
      };
      const longExpired = await mintOne("1h");
      const longRevoked = await mintOne("never");
      const recentlyExpired = await mintOne("1h");
      const live = await mintOne("7d");
      const neverEnding = await mintOne("never");

      const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      await testDb("agent_vault_sessions")
        .where({ id: longExpired })
        .update({ expiresAt: daysAgo(31) });
      await testDb("agent_vault_sessions")
        .where({ id: longRevoked })
        .update({ revokedAt: daysAgo(31) });
      await testDb("agent_vault_sessions")
        .where({ id: recentlyExpired })
        .update({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) });
      const sweeper = agentVaultSessionServiceFactory({
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionAccessBundleDAL: agentVaultSessionAccessBundleDALFactory(testDb),
        agentVaultAccessBundleDAL: agentVaultAccessBundleDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        permissionService: { getProjectPermission: () => Promise.reject(new Error("not used by the sweep")) }
      });
      await sweeper.sweepRetiredSessions();

      const remaining = (await testDb("agent_vault_sessions")
        .whereIn("id", [longExpired, longRevoked, recentlyExpired, live, neverEnding])
        .select("id")) as { id: string }[];
      expect(remaining.map((row) => row.id).sort()).toEqual([recentlyExpired, live, neverEnding].sort());

      const orphans = await testDb("agent_vault_session_access_bundles").whereIn("sessionId", [
        longExpired,
        longRevoked
      ]);
      expect(orphans).toHaveLength(0);
    });
  });

  describe("roles", async () => {
    test("the predefined roles are admin and member only", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const res = await inject("GET", `/api/v1/projects/${projectId}/roles`);
      expect(res.statusCode).toBe(200);
      const { roles } = JSON.parse(res.payload) as { roles: { slug: string }[] };
      expect(roles.map((role) => role.slug).sort()).toEqual([
        ProjectMembershipRole.Admin,
        ProjectMembershipRole.Member
      ]);
    });
  });

  describe("org invite", async () => {
    test("grantAgentVaultAccess makes the invitee a member of the implicit project", async () => {
      const inviteeEmail = `agent-vault-invite-${crypto.randomUUID()}@localhost.local`;
      const res = await inject("POST", "/api/v1/invite-org/signup", {
        inviteeEmails: [inviteeEmail],
        organizationId: seedData1.organization.id,
        grantAgentVaultAccess: true
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).grantFailures).toBeUndefined();

      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const user = await testDb("users").where({ username: inviteeEmail }).first();
      expect(user).toBeTruthy();
      const membership = await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: user.id })
        .first();
      expect(membership).toBeTruthy();
      const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
      expect(role.role).toBe(ProjectMembershipRole.Member);
    });
  });

  describe("membership", async () => {
    test("a grant to someone outside the Agent Vault project is refused", async () => {
      const bundle = await createAccessBundle("member-outside-project");

      const outsider = await createOrgIdentity(`av-outsider-${Date.now()}`);

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityIds: [outsider.id]
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("not a member of Agent Vault");

      await deleteOrgIdentity(outsider.id);
    });

    test("a grant to someone who is in the product only through a group says so", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const bundle = await createAccessBundle("member-via-group");
      const insider = await createOrgIdentity(`av-via-group-${Date.now()}`);

      const [group] = (await testDb("groups")
        .insert({ orgId: seedData1.organization.id, name: "av-via-group", slug: `av-via-group-${Date.now()}` })
        .returning("*")) as { id: string }[];
      const [groupMembership] = (await testDb("memberships")
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: seedData1.organization.id,
          scopeProjectId: projectId,
          actorGroupId: group.id,
          isActive: true
        })
        .returning("*")) as { id: string }[];
      await testDb("membership_roles").insert({ membershipId: groupMembership.id, role: ProjectMembershipRole.Member });
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: insider.id });

      try {
        const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          identityIds: [insider.id]
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.payload).message).toContain("through a group");

        const asGroup = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          groupIds: [group.id]
        });
        expect(asGroup.statusCode).toBe(200);
      } finally {
        await testDb("identity_group_membership").where({ groupId: group.id }).delete();
        await testDb("memberships").where({ id: groupMembership.id }).delete();
        await testDb("groups").where({ id: group.id }).delete();
        await deleteOrgIdentity(insider.id);
      }
    });

    test("a grant has to name at least one actor", async () => {
      const bundle = await createAccessBundle("member-one-actor");

      // The three lists each default to empty, so a body naming nobody is refused by the schema and
      // never reaches the service.
      const none = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {});
      expect(none.statusCode).toBe(422);

      const empty = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userIds: [],
        identityIds: [],
        groupIds: []
      });
      expect(empty.statusCode).toBe(422);

      const notAnId = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userIds: ["not-a-uuid"]
      });
      expect(notAnId.statusCode).toBe(422);
    });

    test("one call grants several actors, dedupes repeats and skips the already granted", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("member-batch");
      const first = await createProjectGroup(projectId, "av-batch-one", ProjectMembershipRole.Member);
      const second = await createProjectGroup(projectId, "av-batch-two", ProjectMembershipRole.Member);

      try {
        const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          groupIds: [first.id, second.id, first.id]
        });
        expect(granted.statusCode).toBe(200);
        expect(JSON.parse(granted.payload)).toMatchObject({ skippedCount: 0 });
        expect(JSON.parse(granted.payload).members).toHaveLength(2);
        expect(await grantRows(bundle.id, { actorGroupId: first.id })).toHaveLength(1);
        expect(await grantRows(bundle.id, { actorGroupId: second.id })).toHaveLength(1);

        const again = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          groupIds: [first.id, second.id]
        });
        expect(again.statusCode).toBe(200);
        expect(JSON.parse(again.payload)).toMatchObject({ members: [], skippedCount: 2 });
      } finally {
        await first.cleanup();
        await second.cleanup();
      }
    });

    test("two admins demoted at once cannot both slip past the last-admin guard", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const one = await createUaIdentity(`av-race-a-${Date.now()}`);
      const two = await createUaIdentity(`av-race-b-${Date.now()}`);

      try {
        for await (const identity of [one, two]) {
          const added = await inject("POST", `/api/v1/agent-vault/memberships/identities/${identity.id}`, {
            role: ProjectMembershipRole.Admin
          });
          expect(added.statusCode).toBe(200);
        }

        // Demote everyone at once. Whatever interleaving wins, an admin has to be left standing.
        const admins = (await testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId })
          .select("id")) as { id: string }[];

        await Promise.all(
          [one, two].map((identity) =>
            inject("PATCH", `/api/v1/agent-vault/memberships/identities/${identity.id}`, {
              role: ProjectMembershipRole.Member
            })
          )
        );

        const remainingAdmins = (await testDb("membership_roles")
          .whereIn(
            "membershipId",
            admins.map((row) => row.id)
          )
          .where({ role: ProjectMembershipRole.Admin })) as unknown[];
        expect(remainingAdmins.length).toBeGreaterThan(0);
      } finally {
        await deleteUaIdentity(one.id);
        await deleteUaIdentity(two.id);
      }
    });

    test("an actor from outside the organization is refused, and an unknown id does not 500", async () => {
      // Users join through the bulk route; only groups and identities are named in the URL.
      const stranger = await inject("POST", "/api/v1/agent-vault/memberships/users", {
        userIds: ["99999999-8888-7777-6666-555555555555"],
        emails: [],
        role: ProjectMembershipRole.Member
      });
      expect(stranger.statusCode).toBe(400);
      expect(JSON.parse(stranger.payload).message).toContain("not an active member of this organization");

      const rows = await testDb("memberships").where({ actorUserId: "99999999-8888-7777-6666-555555555555" });
      expect(rows).toHaveLength(0);
    });

    test("a deactivated machine identity cannot be added", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const identityId = seedData1.machineIdentity.id;
      const orgMembership = await testDb("memberships")
        .where({ scope: AccessScope.Organization, scopeOrgId: seedData1.organization.id, actorIdentityId: identityId })
        .first();

      await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorIdentityId: identityId })
        .del();

      try {
        await testDb("memberships").where({ id: orgMembership.id }).update({ isActive: false });
        const res = await inject("POST", `/api/v1/agent-vault/memberships/identities/${identityId}`, {
          role: ProjectMembershipRole.Member
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.payload).message).toContain("not an active member of this organization");
      } finally {
        await testDb("memberships").where({ id: orgMembership.id }).update({ isActive: true });
      }
    });

    test("a machine identity inherits a group's access bundles, on mint and on resolve", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("group-inheritance");
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
            name: "echo",
            hostPattern: "echo.example.com",
            credential: { type: "passthrough" }
          })
        ).statusCode
      ).toBe(200);
      const second = await createAccessBundle("group-inheritance-late");

      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "group-inheritance" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      const group = await createProjectGroup(projectId, "av-agents", ProjectMembershipRole.Member);
      const agent = await createUaIdentity(`av-agent-${Date.now()}`);
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: agent.id });

      try {
        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
              groupIds: [group.id]
            })
          ).statusCode
        ).toBe(200);

        const mint = await agent.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundles: [bundle.name],
          ttl: "never"
        });
        expect(mint.statusCode).toBe(200);
        const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };

        const resolver = agentVaultProxyServiceFactory({
          agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
          agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          resourceAuthMethodService: {} as never
        });
        const resolve = () =>
          resolver.resolveSession({ proxyId: proxy.id, orgId: seedData1.organization.id, sessionToken: session.token });

        expect((await resolve()).connections).toHaveLength(1);

        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${second.id}/members`, {
              groupIds: [group.id]
            })
          ).statusCode
        ).toBe(200);
        expect((await resolve()).connections).toHaveLength(1);

        const [grant] = await grantRows(bundle.id, { actorGroupId: group.id });
        expect(
          (await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/members/${grant.id}`)).statusCode
        ).toBe(200);
        expect((await resolve()).connections).toHaveLength(0);

        const remint = await agent.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundles: [bundle.name],
          ttl: "never"
        });
        expect(remint.statusCode).toBe(400);
        expect(JSON.parse(remint.payload).message).toContain("is granted to you");
      } finally {
        await deleteUaIdentity(agent.id);
        await group.cleanup();
      }
    });

    test("a group's grants stop counting the moment the group's role lapses", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("group-role-lapse");
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/connections`, {
            name: "echo",
            hostPattern: "echo.example.com",
            credential: { type: "passthrough" }
          })
        ).statusCode
      ).toBe(200);
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "group-role-lapse" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      const group = await createProjectGroup(projectId, "av-lapsing", ProjectMembershipRole.Member);
      const agent = await createUaIdentity(`av-lapse-${Date.now()}`);
      expect(
        (await inject("POST", `/api/v1/agent-vault/memberships/identities/${agent.id}`, { role: "member" })).statusCode
      ).toBe(200);
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: agent.id });
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
            groupIds: [group.id]
          })
        ).statusCode
      ).toBe(200);

      const cacheKeys = [
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.IDENTITY, agent.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.IDENTITY, agent.id, ActionProjectType.AgentVault)
      ];
      const mint = () =>
        agent.asIdentity("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "never" });

      try {
        const live = await mint();
        expect(live.statusCode).toBe(200);
        const { session } = JSON.parse(live.payload) as { session: { token: string } };

        const resolver = agentVaultProxyServiceFactory({
          agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
          agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          resourceAuthMethodService: {} as never
        });
        const resolve = () =>
          resolver.resolveSession({ proxyId: proxy.id, orgId: seedData1.organization.id, sessionToken: session.token });
        expect((await resolve()).connections).toHaveLength(1);

        const groupMembership = await testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorGroupId: group.id })
          .first();
        await testDb("membership_roles")
          .where({ membershipId: groupMembership.id })
          .update({ isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) });
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);

        expect((await resolve()).connections).toHaveLength(0);
        const lapsed = await mint();
        expect(lapsed.statusCode).toBe(400);
        expect(JSON.parse(lapsed.payload).message).toContain("is granted to you");
      } finally {
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);
        await deleteUaIdentity(agent.id);
        await group.cleanup();
      }
    });

    test("a creator grant is written only for a directly added admin", async () => {
      const projectId = await getProjectId();

      const direct = await createAccessBundle("creator-direct");
      const directGrants = await grantRows(direct.id, { actorUserId: seedData1.id });
      expect(directGrants).toHaveLength(1);
      const roles = await testDb("membership_roles").where({ membershipId: directGrants[0].id });
      expect(roles.map((r: { role: string }) => r.role)).toEqual(["consumer"]);

      const group = await createProjectGroup(projectId, "av-group-admins", ProjectMembershipRole.Admin);
      const admin = await createUaIdentity(`av-group-admin-${Date.now()}`);
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: admin.id });

      try {
        const created = await admin.asIdentity("POST", "/api/v1/agent-vault/access-bundles", {
          name: "creator-via-group"
        });
        expect(created.statusCode).toBe(200);
        const { accessBundle } = JSON.parse(created.payload) as { accessBundle: { id: string; name: string } };

        expect(await grantRows(accessBundle.id)).toHaveLength(0);

        const list = await inject("GET", "/api/v1/agent-vault/access-bundles");
        const { accessBundles } = JSON.parse(list.payload) as { accessBundles: { id: string; memberCount: number }[] };
        expect(accessBundles.find((row) => row.id === accessBundle.id)?.memberCount).toBe(0);

        const mint = await admin.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundles: [accessBundle.name],
          ttl: "1h"
        });
        expect(mint.statusCode).toBe(200);
      } finally {
        await deleteUaIdentity(admin.id);
        await group.cleanup();
      }
    });

    test("deleting a bundle reaps its grants and their roles", async () => {
      const bundle = await createAccessBundle("delete-reaps-grants");
      const [grant] = await grantRows(bundle.id, { actorUserId: seedData1.id });
      expect(grant).toBeDefined();

      expect((await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).statusCode).toBe(200);

      expect(await grantRows(bundle.id)).toHaveLength(0);
      expect(await testDb("membership_roles").where({ membershipId: grant.id })).toHaveLength(0);
    });

    test("a member id from another scope is refused, and grants are not seats", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("scoped-member-ids");
      const identity = await createOrgIdentity(`av-seats-${Date.now()}`);
      expect(
        (await inject("POST", `/api/v1/agent-vault/memberships/identities/${identity.id}`, { role: "member" }))
          .statusCode
      ).toBe(200);

      const seatsBefore = await usageCounterDALFactory(testDb).countAgentVaultIdentities(seedData1.organization.id);

      const projectMembership = await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorIdentityId: identity.id })
        .first();
      const refused = await inject(
        "DELETE",
        `/api/v1/agent-vault/access-bundles/${bundle.id}/members/${projectMembership.id}`
      );
      expect(refused.statusCode).toBe(404);
      expect(await testDb("memberships").where({ id: projectMembership.id })).toHaveLength(1);

      for (const name of ["seats-a", "seats-b", "seats-c"]) {
        // eslint-disable-next-line no-await-in-loop
        const extra = await createAccessBundle(name);
        // eslint-disable-next-line no-await-in-loop
        const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${extra.id}/members`, {
          identityIds: [identity.id]
        });
        expect(granted.statusCode).toBe(200);
      }
      const duplicate = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityIds: [identity.id]
      });
      expect(duplicate.statusCode).toBe(200);
      const again = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityIds: [identity.id]
      });
      expect(again.statusCode).toBe(200);
      expect(JSON.parse(again.payload)).toMatchObject({ members: [], skippedCount: 1 });

      expect(await usageCounterDALFactory(testDb).countAgentVaultIdentities(seedData1.organization.id)).toBe(
        seatsBefore
      );

      await deleteOrgIdentity(identity.id);
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
        userIds: [user.id]
      });
      expect(grant.statusCode).toBe(200);

      const remove = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/memberships/${membership.id}`,
        headers: authHeader
      });
      expect(remove.statusCode).toBe(200);

      expect(await grantRows(bundle.id, { actorUserId: user.id }).first()).toBeUndefined();

      await testDb("memberships").where({ actorUserId: user.id }).delete();
      await testDb("users").where({ id: user.id }).delete();
    });
  });
});
