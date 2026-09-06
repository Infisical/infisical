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

// The test file has its own module graph, so the logger the environment initialised is not this one.
initLogger();

const authHeader = { authorization: `Bearer ${jwtAuthToken}` };

const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
  testServer.inject({ method, url, headers: authHeader, ...(body ? { body } : {}) });

// identityService.create writes the org membership alongside the identity row, and an identity without
// one cannot authenticate at all, so a fixture that inserts only the identity is not a shape production
// can produce - and the membership endpoint now checks for it.
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

// Routes are registered in an encapsulated plugin, so `testServer.services` is not reachable from here.
// Resolve is exercised through the service built from the real DALs, and the permission checks under
// test (a lapsed role, a member's grants) need the real permission service, so it is built the same way.
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

// A grant is a resource-scoped row in the shared memberships table; this is the only shape a grant takes.
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

// A non-admin machine identity that can authenticate. The seeded identity is an org admin, so the
// bootstrap made it an Agent Vault admin, and an admin reaches every bundle regardless of grants.
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

// A group that is a member of the Agent Vault project, with the given role.
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
    test("the creator is granted the access bundle they just made", async () => {
      const bundle = await createAccessBundle("creator-grant");

      const res = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      const { accessBundle } = JSON.parse(res.payload) as {
        accessBundle: { members: { userId: string | null; identityId: string | null }[] };
      };

      expect(accessBundle.members).toHaveLength(1);
      expect(accessBundle.members[0].userId).toBe(seedData1.id);
    });

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
      // Stored as typed, only trimmed. The canonical form is derived per comparison instead, so a
      // pattern cannot grow past the column between the length check and the insert.
      expect(connection.hostPattern).toBe("API.GitHub.com");
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

      // Rotating the secret must not disturb the header the credential rides on. Reusing the create
      // schema here would reset DD-API-KEY to Authorization: Bearer and every request would 401.
      const before = await sealed();
      const rotated = await inject("PATCH", url, { credential: { type: "bearer", value: "rotated456" } });
      expect(rotated.statusCode).toBe(200);
      expect(JSON.parse(rotated.payload).connection.credential).toEqual({
        type: "bearer",
        headerName: "DD-API-KEY",
        headerPrefix: ""
      });
      expect((await sealed()).equals(before)).toBe(false);

      // And the mirror image: renaming the header leaves the sealed secret untouched.
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
      // The username is the key for Stripe-style services, so it is sealed and never comes back.
      expect(connection.credential).toEqual({ type: "basic" });
      expect(created.payload).not.toContain("sk_live_key");

      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/connections/${connection.id}`;
      const sealedPair = async () => {
        const row = await testDb("agent_vault_connections").where({ id: connection.id }).first();
        expect(JSON.stringify(row.credentialConfig)).not.toContain("sk_live_key");
        return row.encryptedCredential as Buffer;
      };
      const before = await sealedPair();

      // The username-only credential has nothing else to authenticate with, so clearing it is refused.
      const emptied = await inject("PATCH", url, { credential: { type: "basic", username: "" } });
      expect(emptied.statusCode).toBe(400);
      expect((await sealedPair()).equals(before)).toBe(true);

      // Supplying a password first makes the same edit legal: the flip to password-only.
      const flipped = await inject("PATCH", url, { credential: { type: "basic", username: "", password: "hunter2" } });
      expect(flipped.statusCode).toBe(200);
      expect((await sealedPair()).equals(before)).toBe(false);

      // Naming one half re-seals the pair with the other half kept, so a password-only credential can
      // regain a username without re-sending the password, and then lose the password by clearing it.
      const named = await inject("PATCH", url, { credential: { type: "basic", username: "sk_live_key" } });
      expect(named.statusCode).toBe(200);
      const cleared = await inject("PATCH", url, { credential: { type: "basic", password: "" } });
      expect(cleared.statusCode).toBe(200);
      // And with only the username left, clearing it is refused again.
      const emptiedAgain = await inject("PATCH", url, { credential: { type: "basic", username: "" } });
      expect(emptiedAgain.statusCode).toBe(400);

      // A patch that touches neither half leaves the sealed pair exactly as it is.
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

      // A type change has no stored half to fall back on, so neither half supplied is refused here,
      // where the same-type path would have kept what was stored.
      const emptyBasic = await inject("PATCH", url, { credential: { type: "basic" } });
      expect(emptyBasic.statusCode).toBe(400);

      // The sealed secret belongs to the old type, so there is nothing to carry over.
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

      const added = await inject("POST", memberships, { identityId: identity.id, role: "member" });
      expect(added.statusCode).toBe(200);

      const listed = await inject("GET", `${memberships}/identity-members`);
      const { members } = JSON.parse(listed.payload) as {
        members: { identityId: string; role: string; name: string }[];
      };
      const row = members.find((m) => m.identityId === identity.id);
      expect(row?.role).toBe("member");
      // The name is joined on so the page never has to reach for the org identity list.
      expect(row?.name).toBeTruthy();

      const promoted = await inject("PATCH", memberships, { identityId: identity.id, role: "admin" });
      expect(promoted.statusCode).toBe(200);
      expect(JSON.parse(promoted.payload).role).toBe("admin");

      const removed = await inject("DELETE", memberships, { identityId: identity.id });
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

      // A second user, so the seed admin stays available to make the calls.
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
        userId: user.id
      });
      expect(granted.statusCode).toBe(200);
      expect(await grantRows(bundle.id, { actorUserId: user.id })).toHaveLength(1);

      // Removal from the organization deletes every membership row the user holds in the org, and a grant
      // is one of those rows now. This guards that nothing reintroduces a private grant table.
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

      expect((await inject("POST", memberships, { identityId: identity.id, role: "member" })).statusCode).toBe(200);
      expect(
        (await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, { identityId: identity.id }))
          .statusCode
      ).toBe(200);

      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(1);

      expect((await inject("DELETE", memberships, { identityId: identity.id })).statusCode).toBe(200);

      // Leaving the product takes every bundle grant with it, in the same transaction.
      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(0);

      await deleteOrgIdentity(identity.id);
    });

    test("the guards that keep the product administrable hold", async () => {
      // Removing yourself would need another admin to undo, and the seed user is one.
      const self = await inject("DELETE", memberships, { userId: seedData1.id });
      expect(self.statusCode).toBe(403);

      const unknown = await inject("POST", memberships, {
        identityId: "00000000-0000-0000-0000-000000000000",
        role: "member"
      });
      expect(unknown.statusCode).toBe(404);

      const badRole = await inject("POST", memberships, { userId: seedData1.id, role: "viewer" });
      expect(badRole.statusCode).toBe(422);

      // Naming no actor, or more than one, is refused by the schema like any other validation failure.
      const noActor = await inject("POST", memberships, { role: "member" });
      expect(noActor.statusCode).toBe(422);

      const twoActors = await inject("POST", memberships, {
        userId: seedData1.id,
        identityId: seedData1.machineIdentity.id,
        role: "member"
      });
      expect(twoActors.statusCode).toBe(422);
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

  describe("session resolve", async () => {
    // The resolve endpoint authenticates as an enrolled proxy, which needs a CA and a CSR, so the service
    // is built from the real DALs and the real permission service against the test database instead. Only
    // the two collaborators resolve never reaches on this path are stubbed.
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
        accessBundleIds: [bundle.id],
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

      // Reversible on purpose: deactivation is not a revoke, so the agent comes back with the person.
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
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundleIds: [bundle.id], ttl: "never" });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "resolve-temporary-role" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      // The real permission service this time: what is under test is how an expired role reads.
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

      // getProjectPermission caches the raw membership rows behind a ten-second marker. A real expiry
      // needs no write and is honoured from the cached rows, but flipping the flag here is a write the
      // marker would hide, so the cache is cleared around each flip.
      const cacheKeys = [
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault)
      ];

      // The row stays, so the "not a member" path never fires. Only a live-permission check can catch it.
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

      // Bumping tokenVersion on its own would leave this token able to enroll right after the revoke.
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
        const res = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundleIds: [bundle.id], ttl });
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
      // Start from a clean watermark so a previous run against the same Redis cannot narrow the window.
      await testKeyStore.deleteItem("agent-vault-session-expire-sweep");

      // The services decorator lives inside the routes plugin, out of reach here, so the sweep is built
      // from the real DALs against the test database. Audit rows are dropped by the e2e license mock anyway.
      const auditEvents: string[] = [];
      const sweeper = agentVaultSessionServiceFactory({
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionAccessBundleDAL: agentVaultSessionAccessBundleDALFactory(testDb),
        agentVaultAccessBundleDAL: agentVaultAccessBundleDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        permissionService: { getProjectPermission: () => Promise.reject(new Error("not used by the sweep")) },
        auditLogService: {
          createAuditLog: async (data) => {
            auditEvents.push((data.event.metadata as { sessionId: string }).sessionId);
          }
        },
        keyStore: testKeyStore
      });
      await sweeper.sweepRetiredSessions();

      // Only the session that expired inside the look-back window gets an expire event; the one reaped
      // today expired a month ago, and a revoked session is not an expiry.
      expect(auditEvents).toEqual([recentlyExpired]);

      const remaining = (await testDb("agent_vault_sessions")
        .whereIn("id", [longExpired, longRevoked, recentlyExpired, live, neverEnding])
        .select("id")) as { id: string }[];
      expect(remaining.map((row) => row.id).sort()).toEqual([recentlyExpired, live, neverEnding].sort());

      // The child rows go with the parent, and the watermark moves so the next sweep starts here.
      const orphans = await testDb("agent_vault_session_access_bundles").whereIn("sessionId", [
        longExpired,
        longRevoked
      ]);
      expect(orphans).toHaveLength(0);
      expect(await testKeyStore.getItem("agent-vault-session-expire-sweep")).toBeTruthy();
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

      // The seeded machine identity is an org admin, so the bootstrap already made it a project member.
      // A grant only does something for someone the project can see, so use one it cannot.
      const outsider = await createOrgIdentity(`av-outsider-${Date.now()}`);

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityId: outsider.id
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
        // Grants follow membership at the same level: the group is the member, so the group is what gets
        // the bundle. The refusal has to say that rather than "not a member", which would be false.
        const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          identityId: insider.id
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.payload).message).toContain("through a group");

        const asGroup = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          groupId: group.id
        });
        expect(asGroup.statusCode).toBe(200);
      } finally {
        await testDb("identity_group_membership").where({ groupId: group.id }).delete();
        await testDb("memberships").where({ id: groupMembership.id }).delete();
        await testDb("groups").where({ id: group.id }).delete();
        await deleteOrgIdentity(insider.id);
      }
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

    test("an actor from outside the organization is refused, and an unknown id does not 500", async () => {
      // The UI adds people through the email path, which checks org membership. This is the direct-API
      // route to the same table, and it let any userId through to the foreign key.
      const stranger = await inject("POST", "/api/v1/agent-vault/memberships", {
        userId: "99999999-8888-7777-6666-555555555555",
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

      // Left in place by an earlier test in this file, and the check under test runs before the
      // already-a-member one, so remove it rather than depending on the order.
      await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorIdentityId: identityId })
        .del();

      try {
        await testDb("memberships").where({ id: orgMembership.id }).update({ isActive: false });
        const res = await inject("POST", "/api/v1/agent-vault/memberships", {
          identityId,
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

      // The group, not the identity, is the project member and the bundle's grantee.
      const group = await createProjectGroup(projectId, "av-agents", ProjectMembershipRole.Member);
      const agent = await createUaIdentity(`av-agent-${Date.now()}`);
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: agent.id });

      try {
        expect(
          (await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, { groupId: group.id }))
            .statusCode
        ).toBe(200);

        // Reachability expands identity_group_membership for a machine identity; getting that wrong
        // denies every machine identity's group grants silently, for the product's primary actor.
        const mint = await agent.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundleIds: [bundle.id],
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

        // The bundle set is a ceiling fixed at mint: a grant made afterwards never widens the session.
        expect(
          (await inject("POST", `/api/v1/agent-vault/access-bundles/${second.id}/members`, { groupId: group.id }))
            .statusCode
        ).toBe(200);
        expect((await resolve()).connections).toHaveLength(1);

        // Losing the grant empties the session on the next poll without touching the session row.
        const [grant] = await grantRows(bundle.id, { actorGroupId: group.id });
        expect(
          (await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/members/${grant.id}`)).statusCode
        ).toBe(200);
        expect((await resolve()).connections).toHaveLength(0);

        const remint = await agent.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundleIds: [bundle.id],
          ttl: "never"
        });
        expect(remint.statusCode).toBe(400);
        expect(JSON.parse(remint.payload).message).toContain("not one you can reach");
      } finally {
        await deleteUaIdentity(agent.id);
        await group.cleanup();
      }
    });

    test("a creator grant is written only for a directly added admin", async () => {
      const projectId = await getProjectId();

      // The seed admin holds a direct membership, so their bundle carries exactly one consumer grant.
      const direct = await createAccessBundle("creator-direct");
      const directGrants = await grantRows(direct.id, { actorUserId: seedData1.id });
      expect(directGrants).toHaveLength(1);
      const roles = await testDb("membership_roles").where({ membershipId: directGrants[0].id });
      expect(roles.map((r: { role: string }) => r.role)).toEqual(["consumer"]);

      // An admin only through a group gets no row: they reach the bundle as admin, and an individual row
      // for them would be the one grant no removal path reaps once the group goes.
      const group = await createProjectGroup(projectId, "av-group-admins", ProjectMembershipRole.Admin);
      const admin = await createUaIdentity(`av-group-admin-${Date.now()}`);
      await testDb("identity_group_membership").insert({ groupId: group.id, identityId: admin.id });

      try {
        const created = await admin.asIdentity("POST", "/api/v1/agent-vault/access-bundles", {
          name: "creator-via-group"
        });
        expect(created.statusCode).toBe(200);
        const { accessBundle } = JSON.parse(created.payload) as { accessBundle: { id: string } };

        expect(await grantRows(accessBundle.id)).toHaveLength(0);

        const list = await inject("GET", "/api/v1/agent-vault/access-bundles");
        const { accessBundles } = JSON.parse(list.payload) as { accessBundles: { id: string; memberCount: number }[] };
        expect(accessBundles.find((row) => row.id === accessBundle.id)?.memberCount).toBe(0);

        const mint = await admin.asIdentity("POST", "/api/v1/agent-vault/sessions", {
          accessBundleIds: [accessBundle.id],
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

      // No FK from scopeResourceId to the bundle, so the service reaps by hand and the role row cascades.
      expect(await grantRows(bundle.id)).toHaveLength(0);
      expect(await testDb("membership_roles").where({ membershipId: grant.id })).toHaveLength(0);
    });

    test("a member id from another scope is refused, and grants are not seats", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("scoped-member-ids");
      const identity = await createOrgIdentity(`av-seats-${Date.now()}`);
      expect(
        (await inject("POST", "/api/v1/agent-vault/memberships", { identityId: identity.id, role: "member" }))
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
          identityId: identity.id
        });
        expect(granted.statusCode).toBe(200);
      }
      const duplicate = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityId: identity.id
      });
      expect(duplicate.statusCode).toBe(200);
      const again = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        identityId: identity.id
      });
      expect(again.statusCode).toBe(400);
      expect(JSON.parse(again.payload).message).toContain("already has this access bundle");

      // Grants are resource rows, and the seat count reads project rows only.
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

      expect(await grantRows(bundle.id, { actorUserId: user.id }).first()).toBeUndefined();

      await testDb("memberships").where({ actorUserId: user.id }).delete();
      await testDb("users").where({ id: user.id }).delete();
    });
  });
});
