import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { pollUntil } from "e2e-test/testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "e2e-test/testUtils/users";

import { AccessScope, ActionProjectType, OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { agentVaultServiceCustomHeaderDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-service-custom-header-dal";
import { agentVaultServiceDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-service-dal";
import { agentVaultServiceSubstitutionDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-service-substitution-dal";
import { MAX_OAUTH_SCOPES } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-discovery-fns";
import { AGENT_VAULT_SERVICE_MOVED_MESSAGE } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-service";
import { agentVaultPersonalValueDALFactory } from "@app/ee/services/agent-vault-personal-value/agent-vault-personal-value-dal";
import { agentVaultProxyDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-dal";
import {
  AGENT_VAULT_MAX_PROXIES_PER_ORG,
  agentVaultProxyServiceFactory
} from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-service";
import { agentVaultResolveDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-resolve-dal";
import { agentVaultSessionDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-dal";
import { agentVaultSessionLogConfigDALFactory } from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-config-dal";
import { AGENT_VAULT_MAX_SKILLS } from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";
import { agentVaultVariableDALFactory } from "@app/ee/services/agent-vault-variable/agent-vault-variable-dal";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { initLogger, logger } from "@app/lib/logger";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsLegacyEncryptionKeyDALFactory } from "@app/services/kms/kms-legacy-encryption-key-dal";
import { kmsServiceFactory, TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { usageCounterDALFactory } from "@app/services/license-client/usage/usage-counter-dal";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
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
  // Every path that creates a group gives it an org-scope membership as well, and that row is what says
  // the organization reaches it. Seeding only the project one leaves a group nothing can resolve.
  const [orgMembership] = (await testDb("memberships")
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: seedData1.organization.id,
      actorGroupId: group.id,
      isActive: true
    })
    .returning("*")) as { id: string }[];
  await testDb("membership_roles").insert({ membershipId: orgMembership.id, role: OrgMembershipRole.NoAccess });
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
      await testDb("memberships").whereIn("id", [membership.id, orgMembership.id]).delete();
      await testDb("groups").where({ id: group.id }).delete();
    }
  };
};

// The caller can never name itself in a demotion or a removal, so while it holds an admin row of its own
// no batch can reach the last-admin guard. Holding admin only through a group leaves every admin row
// nameable, because the self check covers users and identities, not groups.
const makeCallerAdminOnlyThroughGroup = async (projectId: string) => {
  const own = await testDb("memberships")
    .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
    .first();
  await testDb("membership_roles").where({ membershipId: own.id }).update({ role: ProjectMembershipRole.Member });
  const group = await createProjectGroup(projectId, "av-caller-admins", ProjectMembershipRole.Admin);
  await testDb("user_group_membership").insert({ groupId: group.id, userId: seedData1.id });

  return {
    groupId: group.id,
    restore: async () => {
      await testDb("membership_roles").where({ membershipId: own.id }).update({ role: ProjectMembershipRole.Admin });
      await testDb("user_group_membership").where({ groupId: group.id }).delete();
      await group.cleanup();
    }
  };
};

const getProjectId = async () =>
  (JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as { projectId: string }).projectId;

const createMemberIdentity = async (name: string) => {
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
  const { clientId } = attached.json().identityUniversalAuth;

  const secret = await inject("POST", `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`, {});
  expect(secret.statusCode).toBe(200);

  const login = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret: secret.json().clientSecret }
  });
  expect(login.statusCode).toBe(200);
  const token = login.json().accessToken as string;

  expect(
    (
      await inject("POST", "/api/v1/agent-vault/members", {
        machineIdentityIds: [identity.id],
        role: ProjectMembershipRole.Member
      })
    ).statusCode
  ).toBe(200);

  return {
    id: identity.id,
    as: (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
      testServer.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) }),
    cleanup: () => inject("DELETE", `/api/v1/identities/${identity.id}`)
  };
};

// Resolves once a backend waits on a lock the given one holds: by then a request has done everything it
// does before the lock and is queued behind it.
const waitUntilBlockedBy = async (pid: number, attemptsLeft = 200): Promise<void> => {
  const { rows } = await testDb.raw(
    "select count(*)::int as waiting from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
    [pid]
  );
  if (rows[0].waiting > 0) return;
  if (attemptsLeft === 0) throw new Error(`No request queued behind the lock held by backend ${pid}`);
  await new Promise((resolve) => {
    setTimeout(resolve, 25);
  });
  await waitUntilBlockedBy(pid, attemptsLeft - 1);
};

const createAccessBundle = async (name: string) => {
  const res = await inject("POST", "/api/v1/agent-vault/access-bundles", { name });
  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload) as { accessBundle: { id: string; name: string } }).accessBundle;
};

// The project's own key, loaded the way the server loads it, so a test can read and write sealed text directly.
// The spec runs in its own module graph, which is why the env config is initialized again here.
let kmsService: TKmsServiceFactory | undefined;
const projectCipher = async (projectId: string) => {
  if (!kmsService) {
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
    kmsService = kmsServiceFactory({
      kmsRootConfigDAL: testKmsRootConfigDAL,
      kmsLegacyEncryptionKeyDAL: kmsLegacyEncryptionKeyDALFactory(testDb),
      kmsKekHistoryDAL: kmsKekHistoryDALFactory(testDb),
      kmsDAL: kmskeyDALFactory(testDb),
      internalKmsDAL: internalKmsDALFactory(testDb),
      internalKmsKeyVersionDAL: internalKmsKeyVersionDALFactory(testDb),
      orgDAL: orgDALFactory(testDb),
      projectDAL: projectDALFactory(testDb),
      hsmService: testHsmService,
      keyStore: {
        getItem: async () => null,
        setItemWithExpiry: async () => "OK" as const,
        deleteItem: async () => 0
      },
      envConfig: getConfig()
    });
    const hsmStatus = await isHsmActiveAndEnabled({
      hsmService: testHsmService,
      kmsRootConfigDAL: testKmsRootConfigDAL
    });
    await kmsService.startService(hsmStatus, { skipRotationState: true });
  }
  return kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
};

describe("Agent Vault V1 Router", async () => {
  // Tests create their own proxies, and an org can hold only AGENT_VAULT_MAX_PROXIES_PER_ORG.
  beforeEach(async () => {
    const project = await testDb("projects")
      .where({ orgId: seedData1.organization.id, type: ProjectType.AgentVault })
      .first();
    if (project) await testDb("agent_vault_proxies").where({ projectId: project.id }).del();
  });

  test("resolving the project bootstraps it empty, and an org admin joins through grant-admin-access", async () => {
    const res = await inject("GET", "/api/v1/agent-vault/project");
    expect(res.statusCode).toBe(200);

    const { projectId } = JSON.parse(res.payload) as { projectId: string };
    expect(projectId).toBeTruthy();

    const project = await testDb("projects").where({ id: projectId }).first();
    expect(project.type).toBe(ProjectType.AgentVault);
    expect(project.orgId).toBe(seedData1.organization.id);

    const seeded = await testDb("memberships").where({ scope: AccessScope.Project, scopeProjectId: projectId });
    expect(seeded).toHaveLength(0);

    const denied = await inject("GET", `/api/v1/projects/${projectId}/permissions`);
    expect(denied.statusCode).toBe(403);

    const join = await inject("POST", `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`);
    expect(join.statusCode).toBe(200);

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

      const res = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`);
      const { members, totalCount } = JSON.parse(res.payload) as {
        members: { type: string; id: string }[];
        totalCount: number;
      };

      expect(totalCount).toBe(1);
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ type: "user", id: seedData1.id });

      // The detail response no longer carries a members array, so there is one source for the list.
      const detail = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(JSON.parse(detail.payload).accessBundle).not.toHaveProperty("members");
    });

    test("the bundle list sorts and pages on the server, and the count follows the search", async () => {
      const names = ["zz-page-c", "zz-page-a", "zz-page-b"];
      for await (const name of names) await createAccessBundle(name);

      const list = async (query: string) => {
        const res = await inject("GET", `/api/v1/agent-vault/access-bundles?${query}`);
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.payload) as { accessBundles: { id: string; name: string }[]; totalCount: number };
      };

      const searched = await list("search=zz-page&orderBy=name&orderDirection=asc&limit=100");
      expect(searched.totalCount).toBe(3);
      expect(searched.accessBundles.map((bundle) => bundle.name)).toEqual(["zz-page-a", "zz-page-b", "zz-page-c"]);

      const descending = await list("search=zz-page&orderBy=name&orderDirection=desc&limit=100");
      expect(descending.accessBundles.map((bundle) => bundle.name)).toEqual(["zz-page-c", "zz-page-b", "zz-page-a"]);

      // The sort has to happen before the page is cut, or a page is sorted rather than the set.
      const firstPage = await list("search=zz-page&orderBy=name&orderDirection=asc&limit=1&offset=0");
      expect(firstPage.totalCount).toBe(3);
      expect(firstPage.accessBundles.map((bundle) => bundle.name)).toEqual(["zz-page-a"]);

      const lastPage = await list("search=zz-page&orderBy=name&orderDirection=asc&limit=1&offset=2");
      expect(lastPage.accessBundles.map((bundle) => bundle.name)).toEqual(["zz-page-c"]);

      expect((await inject("GET", "/api/v1/agent-vault/access-bundles?orderBy=nonsense")).statusCode).toBe(422);
      expect((await inject("GET", "/api/v1/agent-vault/access-bundles?limit=101")).statusCode).toBe(422);
    });

    test("updatedAt moves when a bundle changes, and matches createdAt until it does", async () => {
      const bundle = await createAccessBundle("stamped");

      const read = async () =>
        (
          JSON.parse((await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).payload) as {
            accessBundle: { createdAt: string; updatedAt: string };
          }
        ).accessBundle;

      const fresh = await read();
      expect(fresh.updatedAt).toBe(fresh.createdAt);

      expect(
        (await inject("PATCH", `/api/v1/agent-vault/access-bundles/${bundle.id}`, { description: "touched" }))
          .statusCode
      ).toBe(200);

      const touched = await read();
      expect(new Date(touched.updatedAt).getTime()).toBeGreaterThan(new Date(fresh.updatedAt).getTime());
      expect(touched.createdAt).toBe(fresh.createdAt);
    });

    test("two concurrent creates for the same host do not both get in", async () => {
      const bundle = await createAccessBundle("race-hosts");
      const attempts = await Promise.all(
        [1, 2].map((n) =>
          inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
            type: "http",
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

      const rows = await testDb("agent_vault_services").where({ accessBundleId: bundle.id });
      expect(rows).toHaveLength(1);
    });

    test("a service is rejected when it shares a host with another in the same bundle", async () => {
      const bundle = await createAccessBundle("overlap-check");

      const first = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "datadog-us5",
        hostPattern: "api.us5.datadoghq.com, api.datadoghq.eu",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(first.statusCode).toBe(200);

      const overlapping = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "datadog-eu",
        hostPattern: "api.datadoghq.eu, api.datadoghq.com",
        credential: { type: "bearer", value: "def456" }
      });
      expect(overlapping.statusCode).toBe(400);
      expect(JSON.parse(overlapping.payload).message).toContain("api.datadoghq.eu:443");

      const contained = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "datadog-wildcard",
        hostPattern: "*.datadoghq.com",
        credential: { type: "passthrough" }
      });
      expect(contained.statusCode).toBe(200);
    });

    test("a service never echoes its secret, and its host pattern is kept as typed", async () => {
      const bundle = await createAccessBundle("secret-handling");

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: " API.GitHub.com ",
        credential: { type: "bearer", value: "ghp_secret_value" }
      });
      expect(res.statusCode).toBe(200);

      const { service } = JSON.parse(res.payload) as {
        service: { id: string; hostPattern: string; credential: Record<string, unknown> };
      };
      expect(service.hostPattern).toBe("API.GitHub.com");
      expect(service.credential).toEqual({
        type: "bearer",
        headerName: "Authorization",
        headerPrefix: "Bearer",
        memberProvidedFields: []
      });
      expect(res.payload).not.toContain("ghp_secret_value");

      const detail = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(detail.payload).not.toContain("ghp_secret_value");

      const row = await testDb("agent_vault_services").where({ id: service.id }).first();
      expect(row.encryptedCredential).toBeTruthy();
      expect(row.encryptedCredential.toString("utf-8")).not.toContain("ghp_secret_value");
      expect(JSON.stringify(row.credentialConfig)).not.toContain("ghp_secret_value");
    });

    test("updating a service patches the credential instead of replacing it", async () => {
      const bundle = await createAccessBundle("credential-patch");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;
      const sealed = async () =>
        (await testDb("agent_vault_services").where({ id: service.id }).first()).encryptedCredential;

      const before = await sealed();
      const rotated = await inject("PATCH", url, { type: "http", credential: { type: "bearer", value: "rotated456" } });
      expect(rotated.statusCode).toBe(200);
      expect(JSON.parse(rotated.payload).service.credential).toEqual({
        type: "bearer",
        headerName: "DD-API-KEY",
        headerPrefix: "",
        memberProvidedFields: []
      });
      expect((await sealed()).equals(before)).toBe(false);

      const afterRotate = await sealed();
      const renamed = await inject("PATCH", url, {
        type: "http",
        credential: { type: "bearer", headerName: "X-Api-Key" }
      });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).service.credential.headerName).toBe("X-Api-Key");
      expect((await sealed()).equals(afterRotate)).toBe(true);
    });

    test("a basic credential keeps one half while the other changes, and refuses to lose both", async () => {
      const bundle = await createAccessBundle("basic-halves");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "stripe",
        hostPattern: "api.stripe.com",
        credential: { type: "basic", username: "sk_live_key", password: "" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as {
        service: { id: string; credential: Record<string, unknown> };
      };
      expect(service.credential).toEqual({ type: "basic", memberProvidedFields: [] });
      expect(created.payload).not.toContain("sk_live_key");

      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;
      const sealedPair = async () => {
        const row = await testDb("agent_vault_services").where({ id: service.id }).first();
        expect(JSON.stringify(row.credentialConfig)).not.toContain("sk_live_key");
        return row.encryptedCredential as Buffer;
      };
      const before = await sealedPair();

      const emptied = await inject("PATCH", url, { type: "http", credential: { type: "basic", username: "" } });
      expect(emptied.statusCode).toBe(400);
      expect((await sealedPair()).equals(before)).toBe(true);

      const flipped = await inject("PATCH", url, {
        type: "http",
        credential: { type: "basic", username: "", password: "hunter2" }
      });
      expect(flipped.statusCode).toBe(200);
      expect((await sealedPair()).equals(before)).toBe(false);

      const named = await inject("PATCH", url, {
        type: "http",
        credential: { type: "basic", username: "sk_live_key" }
      });
      expect(named.statusCode).toBe(200);
      const cleared = await inject("PATCH", url, { type: "http", credential: { type: "basic", password: "" } });
      expect(cleared.statusCode).toBe(200);
      const emptiedAgain = await inject("PATCH", url, { type: "http", credential: { type: "basic", username: "" } });
      expect(emptiedAgain.statusCode).toBe(400);

      const afterClear = await sealedPair();
      const renamed = await inject("PATCH", url, { type: "http", name: "stripe-live" });
      expect(renamed.statusCode).toBe(200);
      expect((await sealedPair()).equals(afterClear)).toBe(true);
    });

    test("changing the credential type requires whatever the new type needs", async () => {
      const bundle = await createAccessBundle("type-change");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", value: "ghp_one" }
      });
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;

      const emptyBasic = await inject("PATCH", url, { type: "http", credential: { type: "basic" } });
      expect(emptyBasic.statusCode).toBe(400);

      const noSecret = await inject("PATCH", url, { type: "http", credential: { type: "basic", username: "bot" } });
      expect(noSecret.statusCode).toBe(200);

      const bearerNoValue = await inject("PATCH", url, { type: "http", credential: { type: "bearer" } });
      expect(bearerNoValue.statusCode).toBe(400);
    });

    test("a path in a host pattern is rejected", async () => {
      const bundle = await createAccessBundle("no-paths");
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "with-path",
        hostPattern: "gitlab.com/api/v4",
        credential: { type: "passthrough" }
      });
      expect(res.statusCode).toBe(422);
    });

    test("methods and path prefixes default to unrestricted, and null clears them again", async () => {
      const bundle = await createAccessBundle("service-policy");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        allowedMethods: ["GET", "HEAD"],
        allowedPathPrefixes: ["/repos/", "/user"],
        credential: { type: "passthrough" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as {
        service: { id: string; allowedMethods: string[]; allowedPathPrefixes: string[] };
      };
      expect(service.allowedMethods).toEqual(["GET", "HEAD"]);
      expect(service.allowedPathPrefixes).toEqual(["/repos", "/user"]);

      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;

      const renamed = await inject("PATCH", url, { type: "http", name: "github-read" });
      expect(JSON.parse(renamed.payload).service.allowedMethods).toEqual(["GET", "HEAD"]);

      const cleared = await inject("PATCH", url, { type: "http", allowedMethods: null, allowedPathPrefixes: null });
      expect(cleared.statusCode).toBe(200);
      expect(JSON.parse(cleared.payload).service.allowedMethods).toBeNull();
      expect(JSON.parse(cleared.payload).service.allowedPathPrefixes).toBeNull();

      expect((await inject("PATCH", url, { type: "http", allowedMethods: [] })).statusCode).toBe(422);
      expect((await inject("PATCH", url, { type: "http", allowedPathPrefixes: [] })).statusCode).toBe(422);
    });

    test("a path prefix that would need normalising to judge is rejected", async () => {
      const bundle = await createAccessBundle("path-grammar");
      const reject = async (prefix: string) =>
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
            type: "http",
            name: `svc-${Math.random().toString(36).slice(2, 8)}`,
            hostPattern: `h${Math.random().toString(36).slice(2, 8)}.example.com`,
            allowedPathPrefixes: [prefix],
            credential: { type: "passthrough" }
          })
        ).statusCode;

      for (const prefix of [
        "repos",
        "/repos/../admin",
        "/repos//x",
        "/repos%2fx",
        "/repos;x",
        "/repos\\x",
        "/repos,x"
      ]) {
        // eslint-disable-next-line no-await-in-loop
        expect(await reject(prefix)).toBe(422);
      }
    });

    test("headers and substitutions round-trip without ever echoing a value", async () => {
      const bundle = await createAccessBundle("transformations");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Org-Id", value: "org_secret_value" }],
        substitutions: [{ placeholder: "__GITHUB_PAT__", surfaces: ["header", "path"], value: "ghp_real_value" }]
      });
      expect(created.statusCode).toBe(200);
      expect(created.payload).not.toContain("org_secret_value");
      expect(created.payload).not.toContain("ghp_real_value");

      const { service } = JSON.parse(created.payload) as {
        service: {
          id: string;
          customHeaders: { id: string; name: string; prefix: string }[];
          substitutions: { id: string; placeholder: string; surfaces: string[] }[];
        };
      };
      expect(service.customHeaders).toHaveLength(1);
      expect(service.customHeaders[0].name).toBe("X-Org-Id");
      expect(service.substitutions[0].surfaces).toEqual(["header", "path"]);

      const detail = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(detail.payload).not.toContain("org_secret_value");
      expect(detail.payload).not.toContain("ghp_real_value");

      const customHeaderRow = await testDb("agent_vault_service_custom_headers")
        .where({ serviceId: service.id })
        .first();
      expect(customHeaderRow.encryptedValue.toString("utf-8")).not.toContain("org_secret_value");

      const removed = await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`);
      expect(removed.statusCode).toBe(200);
      expect(removed.payload).not.toContain("org_secret_value");
      expect(JSON.parse(removed.payload).service.customHeaders).toHaveLength(1);
      expect(await testDb("agent_vault_service_custom_headers").where({ serviceId: service.id })).toHaveLength(0);
    });

    test("a row keeps its stored value whether it is named by id or by name", async () => {
      const bundle = await createAccessBundle("keep-stored-value");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Org-Id", value: "first_value" }]
      });
      const { service } = JSON.parse(created.payload) as {
        service: { id: string; customHeaders: { id: string }[] };
      };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;
      const customHeaderId = service.customHeaders[0].id;
      const sealed = async () =>
        (await testDb("agent_vault_service_custom_headers").where({ serviceId: service.id }).first())
          .encryptedValue as Buffer;
      const before = await sealed();

      const renamed = await inject("PATCH", url, {
        type: "http",
        customHeaders: [{ id: customHeaderId, name: "X-Organization-Id" }]
      });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).service.customHeaders[0].id).toBe(customHeaderId);
      expect(JSON.parse(renamed.payload).service.customHeaders[0].name).toBe("X-Organization-Id");
      expect((await sealed()).equals(before)).toBe(true);

      const byName = await inject("PATCH", url, {
        type: "http",
        customHeaders: [{ name: "X-Organization-Id", prefix: "Token" }]
      });
      expect(byName.statusCode).toBe(200);
      expect(JSON.parse(byName.payload).service.customHeaders[0].id).toBe(customHeaderId);
      expect(JSON.parse(byName.payload).service.customHeaders[0].prefix).toBe("Token");
      expect((await sealed()).equals(before)).toBe(true);

      const newRowNoValue = await inject("PATCH", url, {
        type: "http",
        customHeaders: [{ name: "X-Organization-Id" }, { name: "X-New" }]
      });
      expect(newRowNoValue.statusCode).toBe(400);

      const duplicateId = await inject("PATCH", url, {
        type: "http",
        customHeaders: [
          { id: customHeaderId, name: "X-A", value: "a" },
          { id: customHeaderId, name: "X-B", value: "b" }
        ]
      });
      expect(duplicateId.statusCode).toBe(400);

      const emptied = await inject("PATCH", url, { type: "http", customHeaders: [] });
      expect(emptied.statusCode).toBe(200);
      expect(JSON.parse(emptied.payload).service.customHeaders).toHaveLength(0);
      expect(await testDb("agent_vault_service_custom_headers").where({ serviceId: service.id })).toHaveLength(0);
    });

    test("a custom header cannot shadow the credential's own header, from either side", async () => {
      const bundle = await createAccessBundle("header-shadowing");

      const clash = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "clash",
        hostPattern: "api.clash.example.com",
        credential: { type: "bearer", headerName: "X-Api-Key", headerPrefix: "", value: "k" },
        customHeaders: [{ name: "x-api-key", value: "shadow" }]
      });
      expect(clash.statusCode).toBe(400);
      expect(JSON.parse(clash.payload).message).toContain("X-Api-Key");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", headerName: "X-Api-Key", headerPrefix: "", value: "k" },
        customHeaders: [{ name: "X-Org-Id", value: "org" }]
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;

      const headersOnly = await inject("PATCH", url, {
        type: "http",
        customHeaders: [{ name: "X-Api-Key", value: "shadow" }]
      });
      expect(headersOnly.statusCode).toBe(400);

      const credentialOnly = await inject("PATCH", url, {
        type: "http",
        credential: { type: "bearer", headerName: "X-Org-Id" }
      });
      expect(credentialOnly.statusCode).toBe(400);
      expect(JSON.parse(credentialOnly.payload).message).toContain("X-Org-Id");

      const basicClash = await inject("PATCH", url, {
        type: "http",
        credential: { type: "basic", username: "u", password: "p" },
        customHeaders: [{ name: "Authorization", value: "shadow" }]
      });
      expect(basicClash.statusCode).toBe(400);
    });

    test("a header the proxy controls is refused, from either side", async () => {
      const bundle = await createAccessBundle("reserved-headers");
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "reserved",
        hostPattern: "api.reserved.example.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "Host", value: "evil.example.com" }]
      });
      expect(res.statusCode).toBe(422);

      const asCredential = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "reserved-credential",
        hostPattern: "api.reserved-credential.example.com",
        credential: { type: "bearer", headerName: "Content-Length", value: "t" }
      });
      expect(asCredential.statusCode).toBe(422);
    });
  });

  describe("MCP services", async () => {
    const servicesUrl = (bundleId: string) => `/api/v1/agent-vault/access-bundles/${bundleId}/services`;

    const createMcpService = async (bundleId: string, name: string, serverUrl: string) => {
      const res = await inject("POST", servicesUrl(bundleId), {
        type: "mcp",
        name,
        serverUrl,
        transport: "streamable-http",
        credential: { type: "bearer", value: "mcp-token" }
      });
      expect(res.statusCode).toBe(200);
      return (JSON.parse(res.payload) as { service: { id: string; hostPattern: string } }).service;
    };

    const messageOf = (res: { payload: string }) => (JSON.parse(res.payload) as { message: string }).message;

    test("an MCP service takes its host from the server URL, and moves with it", async () => {
      const bundle = await createAccessBundle("mcp-host-pattern");

      const res = await inject("POST", servicesUrl(bundle.id), {
        type: "mcp",
        name: "linear",
        serverUrl: "https://mcp.linear.app/mcp",
        transport: "sse",
        credential: { type: "bearer", value: "lin_api_secret" }
      });
      expect(res.statusCode).toBe(200);
      const { service } = JSON.parse(res.payload) as {
        service: { id: string; type: string; hostPattern: string; serverUrl: string; transport: string };
      };
      expect(service).toMatchObject({
        type: "mcp",
        hostPattern: "mcp.linear.app",
        serverUrl: "https://mcp.linear.app/mcp",
        transport: "sse"
      });
      expect(res.payload).not.toContain("lin_api_secret");

      const withPort = await createMcpService(bundle.id, "internal", "https://mcp.example.com:8443/mcp");
      expect(withPort.hostPattern).toBe("mcp.example.com:8443");

      const moved = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "mcp",
        serverUrl: "https://mcp.linear.dev/mcp"
      });
      expect(moved.statusCode).toBe(200);
      expect(JSON.parse(moved.payload).service.hostPattern).toBe("mcp.linear.dev");
    });

    test("an MCP service refuses member-provided credentials, on create and update", async () => {
      const bundle = await createAccessBundle("mcp-member-provided");
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "mcp",
        name: "linear",
        serverUrl: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      expect(created.statusCode).toBe(422);
      expect(created.payload).toContain("MCP services don't support member-provided credentials yet");

      const service = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");
      const updated = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "mcp",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      expect(updated.statusCode).toBe(422);
      expect(updated.payload).toContain("MCP services don't support member-provided credentials yet");
    });

    test("a field that belongs to the other type is refused by name, on create and update", async () => {
      const bundle = await createAccessBundle("mcp-wrong-fields");
      const mcp = {
        type: "mcp",
        name: "linear",
        serverUrl: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        credential: { type: "bearer", value: "token" }
      };

      const withHttpFields = await inject("POST", servicesUrl(bundle.id), {
        ...mcp,
        hostPattern: "mcp.linear.app",
        allowedMethods: ["GET"]
      });
      expect(withHttpFields.statusCode).toBe(400);
      expect(messageOf(withHttpFields)).toContain("An MCP service doesn't take 'hostPattern' or 'allowedMethods'.");

      const withBasic = await inject("POST", servicesUrl(bundle.id), {
        ...mcp,
        credential: { type: "basic", username: "user", password: "pass" }
      });
      expect(withBasic.statusCode).toBe(400);
      expect(messageOf(withBasic)).toContain("An MCP service can't use basic auth as its credential.");

      const httpWithServerUrl = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        serverUrl: "https://api.github.com/mcp",
        credential: { type: "bearer", value: "token" }
      });
      expect(httpWithServerUrl.statusCode).toBe(400);
      expect(messageOf(httpWithServerUrl)).toContain("An HTTP service doesn't take 'serverUrl'.");

      const service = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");
      const patchedHostPattern = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "mcp",
        hostPattern: "other.example.com"
      });
      expect(patchedHostPattern.statusCode).toBe(400);
      expect(messageOf(patchedHostPattern)).toContain("An MCP service doesn't take 'hostPattern'.");
    });

    test("a service's type can't be changed", async () => {
      const bundle = await createAccessBundle("mcp-type-change");
      const service = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");

      const url = `${servicesUrl(bundle.id)}/${service.id}`;
      const res = await inject("PATCH", url, { type: "http", name: "renamed" });
      expect(res.statusCode).toBe(400);
      expect(messageOf(res)).toContain("The service 'linear' is an MCP service, so send 'type': 'mcp'.");

      expect((await inject("PATCH", url, { name: "renamed" })).statusCode).toBe(422);
      expect((await inject("PATCH", url, { type: "mcp" })).statusCode).toBe(422);

      const stored = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(stored.payload).toContain('"type":"mcp"');
      expect(stored.payload).not.toContain("renamed");
    });

    test("a service read back unchanged, minus its credential, is accepted as an update", async () => {
      const bundle = await createAccessBundle("read-back");
      const mcp = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");
      const http = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "stripe",
        hostPattern: "api.stripe.com",
        credential: { type: "passthrough" }
      });
      expect(http.statusCode).toBe(200);

      type TReadService = Record<string, unknown> & { id: string; credential: unknown };
      const read = JSON.parse((await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).payload) as {
        accessBundle: { services: TReadService[] };
      };
      expect(read.accessBundle.services.map((service) => service.id).sort()).toEqual(
        [mcp.id, (http.json().service as { id: string }).id].sort()
      );

      await Promise.all(
        read.accessBundle.services.map(async ({ id, accessBundleId, credential, createdAt, updatedAt, ...fields }) => {
          const res = await inject("PATCH", `${servicesUrl(bundle.id)}/${id}`, fields);
          expect(res.statusCode).toBe(200);
          const { service } = res.json() as { service: TReadService };
          // Only the bundle read carries the caller's own personal values, so the update doesn't echo them.
          const { personalValues, ...written } = fields;
          expect(service).toMatchObject(written);
        })
      );
    });

    describe("credential refresh", async () => {
      // A real enrolled proxy on the real route, so the session and proxy checks run as they do in production.
      const proxyFor = async (bundle: { name: string }, proxyName: string) => {
        const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h" });
        expect(mint.statusCode).toBe(200);
        const { session } = JSON.parse(mint.payload) as { session: { token: string } };

        const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: proxyName });
        expect(created.statusCode).toBe(200);
        const { proxyToken: accessToken } = JSON.parse(created.payload) as { proxyToken: string };

        return (serviceId: string, hostPattern: string) =>
          testServer.inject({
            method: "POST",
            url: `/api/v1/agent-vault/proxy/services/${serviceId}/credential-refresh`,
            headers: { authorization: `Bearer ${accessToken}`, "x-infisical-agent-session": session.token },
            body: { hostPattern, rejectedTokenHash: "a".repeat(64) }
          });
      };

      test("a service outside the session is a 404, and one without OAuth is a 400", async () => {
        const bundle = await createAccessBundle("refresh-not-found");
        const service = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");
        const otherBundle = await createAccessBundle("refresh-other-bundle");
        const outside = await createMcpService(otherBundle.id, "linear", "https://mcp.linear.app/mcp");
        const refresh = await proxyFor(bundle, "refresh-not-found");

        const unknown = await refresh(crypto.randomUUID(), "mcp.linear.app");
        expect(unknown.statusCode).toBe(404);
        const otherSession = await refresh(outside.id, "mcp.linear.app");
        expect(otherSession.statusCode).toBe(404);

        const bearer = await refresh(service.id, "mcp.linear.app");
        expect(bearer.statusCode).toBe(400);
        expect(messageOf(bearer)).toBe("The service 'linear' doesn't use an OAuth credential.");
      });

      test("a host pattern the service no longer has is a 409, so no token goes to the old host", async () => {
        const bundle = await createAccessBundle("refresh-moved");
        const service = await createMcpService(bundle.id, "linear", "https://mcp.linear.app/mcp");
        // Connecting OAuth needs a browser sign-in, so the row is switched to OAuth directly.
        await testDb("agent_vault_services")
          .where({ id: service.id })
          .update({
            credentialType: "oauth",
            credentialConfig: { status: "connected", accessTokenHash: "a".repeat(64) }
          });
        const refresh = await proxyFor(bundle, "refresh-moved");

        const res = await refresh(service.id, "mcp.old-linear.app");
        expect(res.statusCode).toBe(409);
        expect(messageOf(res)).toBe(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
      });
    });
  });

  // The unit tests run these against a JS copy of the SQL. Only Postgres can show the compare, the jsonb merge and
  // the union happen in one UPDATE, against the row being written.
  describe("OAuth credential writes (postgres)", async () => {
    const serviceDAL = agentVaultServiceDALFactory(testDb as never);
    const SEALED = Buffer.from("sealed-credential-1");
    const TOKEN_HASH = "b".repeat(64);

    const oauthService = async (name: string, config: Record<string, unknown> = {}) => {
      const bundle = await createAccessBundle(name);
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "mcp",
        name,
        serverUrl: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        credential: { type: "bearer", value: "token" }
      });
      expect(res.statusCode).toBe(200);
      const { service } = JSON.parse(res.payload) as { service: { id: string } };
      // Connecting OAuth needs a browser sign-in, so the row is switched to OAuth directly.
      await testDb("agent_vault_services")
        .where({ id: service.id })
        .update({
          credentialType: "oauth",
          encryptedCredential: SEALED,
          credentialConfig: {
            status: "connected",
            accessTokenHash: TOKEN_HASH,
            grantedScopes: ["read"],
            requiredScopes: [],
            ...config
          }
        });
      return service.id;
    };

    const storedConfig = async (id: string) =>
      (await testDb("agent_vault_services").where({ id }).first()).credentialConfig as Record<string, unknown>;

    test("a member reads a service's OAuth setup but not the admin's sign-in state", async () => {
      const id = await oauthService("oauth-member-read", {
        issuer: "https://mcp.linear.app",
        expiresAt: "2030-01-01T00:00:00.000Z",
        authorizedAt: "2026-01-01T00:00:00.000Z",
        lastError: "Linear refused the refresh for admin@example.com"
      });
      const { accessBundleId } = await testDb("agent_vault_services").where({ id }).first();
      const member = await createUaIdentity(`av-oauth-member-${Date.now()}`);
      type TBundleRead = { accessBundle: { services: { credential: Record<string, unknown> }[] } };

      try {
        expect(
          (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [member.id], role: "member" }))
            .statusCode
        ).toBe(200);
        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, {
              machineIdentityIds: [member.id]
            })
          ).statusCode
        ).toBe(200);

        const reached = await member.asIdentity("GET", `/api/v1/agent-vault/access-bundles/${accessBundleId}`);
        expect(reached.statusCode).toBe(200);
        const { credential } = (JSON.parse(reached.payload) as TBundleRead).accessBundle.services[0];
        expect(credential).toEqual({
          type: "oauth",
          status: "connected",
          issuer: "https://mcp.linear.app",
          grantedScopes: ["read"],
          requiredScopes: []
        });
        expect(reached.payload).not.toContain("admin@example.com");

        const asAdmin = JSON.parse(
          (await inject("GET", `/api/v1/agent-vault/access-bundles/${accessBundleId}`)).payload
        ) as TBundleRead;
        expect(asAdmin.accessBundle.services[0].credential).toMatchObject({
          expiresAt: "2030-01-01T00:00:00.000Z",
          authorizedAt: "2026-01-01T00:00:00.000Z",
          lastError: "Linear refused the refresh for admin@example.com"
        });
      } finally {
        await deleteUaIdentity(member.id);
      }
    });

    test("compareAndSwapCredential writes only over the sealed credential it read, and merges just its keys", async () => {
      const id = await oauthService("cas-write");
      const swapped = await serviceDAL.compareAndSwapCredential({
        id,
        expectedEncryptedCredential: SEALED,
        encryptedCredential: Buffer.from("sealed-credential-2"),
        credentialConfigPatch: { accessTokenHash: "c".repeat(64), lastError: null }
      });
      expect(swapped?.credentialConfig).toMatchObject({ accessTokenHash: "c".repeat(64), grantedScopes: ["read"] });

      const stale = await serviceDAL.compareAndSwapCredential({
        id,
        expectedEncryptedCredential: SEALED,
        encryptedCredential: Buffer.from("sealed-credential-3"),
        credentialConfigPatch: { accessTokenHash: "d".repeat(64) }
      });
      expect(stale).toBeUndefined();
      const row = await testDb("agent_vault_services").where({ id }).first();
      expect(row.encryptedCredential.toString()).toBe("sealed-credential-2");
      expect(row.credentialConfig.accessTokenHash).toBe("c".repeat(64));
    });

    test("compareAndSwapCredential keeps needs-additional-scopes only when asked, judged on the stored row", async () => {
      const patch = { status: "connected", lastError: null };
      const kept = await oauthService("cas-keep-scopes", { status: "needs-additional-scopes", lastError: "old" });
      await serviceDAL.compareAndSwapCredential({
        id: kept,
        expectedEncryptedCredential: SEALED,
        credentialConfigPatch: patch,
        keepAdditionalScopesStatus: true
      });
      expect(await storedConfig(kept)).toMatchObject({ status: "needs-additional-scopes", lastError: null });

      const replaced = await oauthService("cas-replace-scopes", { status: "needs-additional-scopes" });
      await serviceDAL.compareAndSwapCredential({
        id: replaced,
        expectedEncryptedCredential: SEALED,
        credentialConfigPatch: patch
      });
      expect((await storedConfig(replaced)).status).toBe("connected");
    });

    test("addRequiredScopes unions in the UPDATE, so two reports at once both land", async () => {
      const id = await oauthService("scopes-concurrent");
      const report = (requiredScopes: string[]) =>
        serviceDAL.addRequiredScopes({
          id,
          expectedEncryptedCredential: SEALED,
          rejectedTokenHash: TOKEN_HASH,
          requiredScopes
        });

      await Promise.all([report(["admin"]), report(["write", "admin"])]);
      const config = await storedConfig(id);
      expect(config.status).toBe("needs-additional-scopes");
      expect([...(config.requiredScopes as string[])].sort()).toEqual(["admin", "write"]);
    });

    test("addRequiredScopes writes nothing for granted scopes, a replaced token, or a dead login", async () => {
      const id = await oauthService("scopes-refused");
      const report = (requiredScopes: string[], rejectedTokenHash = TOKEN_HASH) =>
        serviceDAL.addRequiredScopes({ id, expectedEncryptedCredential: SEALED, rejectedTokenHash, requiredScopes });

      expect(await report(["read"])).toBeUndefined();
      expect(await report(["admin"], "e".repeat(64))).toBeUndefined();

      const dead = await oauthService("scopes-dead-login", { status: "needs-reauthorization" });
      expect(
        await serviceDAL.addRequiredScopes({
          id: dead,
          expectedEncryptedCredential: SEALED,
          rejectedTokenHash: TOKEN_HASH,
          requiredScopes: ["admin"]
        })
      ).toBeUndefined();
      expect(await storedConfig(id)).toMatchObject({ status: "connected", requiredScopes: [] });
    });

    test("addRequiredScopes stops growing the list at the scope limit", async () => {
      const id = await oauthService("scopes-cap");
      await serviceDAL.addRequiredScopes({
        id,
        expectedEncryptedCredential: SEALED,
        rejectedTokenHash: TOKEN_HASH,
        requiredScopes: Array.from({ length: MAX_OAUTH_SCOPES + 5 }, (_, index) => `scope-${index}`)
      });
      expect((await storedConfig(id)).requiredScopes).toHaveLength(MAX_OAUTH_SCOPES);
    });
  });

  describe("variables", async () => {
    const variablesUrl = "/api/v1/agent-vault/variables";
    const servicesUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/services`;

    // Keys are unique across the org's Agent Vault, and every test here shares it. A variable still referenced can't
    // be deleted through the API, so the rows go straight from the database.
    beforeEach(async () => {
      const project = await testDb("projects")
        .where({ orgId: seedData1.organization.id, type: ProjectType.AgentVault })
        .first();
      if (!project) return;
      const variableIds = testDb("agent_vault_variables").where({ projectId: project.id }).select("id");
      await testDb("agent_vault_service_variable_references").whereIn("variableId", variableIds).del();
      await testDb("agent_vault_variables").where({ projectId: project.id }).del();
    });

    type TReference = {
      variableId: string;
      key: string;
      field: string;
      customHeaderId?: string;
      substitutionId?: string;
    };

    const createVariable = async (body: { key: string; value: string }) => {
      const res = await inject("POST", variablesUrl, { scope: "global", ...body });
      expect(res.statusCode).toBe(200);
      return (JSON.parse(res.payload) as { variable: { id: string; key: string } }).variable;
    };

    const referencesByField = (references: TReference[]) =>
      references.map((reference) => `${reference.field}:${reference.key}`).sort();

    type TResolved = {
      services: {
        name: string;
        allowedMethods: string[] | null;
        allowedPathPrefixes: string[] | null;
        credential: Record<string, string>;
        customHeaders: { name: string; prefix: string; value: string }[];
        substitutions: { placeholder: string; surfaces: string[]; value: string }[];
      }[];
    };

    // A real enrolled proxy on the real resolve route, unlike the stubbed resolvers elsewhere in this file,
    // so every value goes through the project's actual KMS key.
    const resolverFor = async (bundle: { name: string }, proxyName: string) => {
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h" });
      expect(mint.statusCode).toBe(200);
      const { session } = JSON.parse(mint.payload) as { session: { token: string } };

      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: proxyName });
      expect(created.statusCode).toBe(200);
      const { proxyToken: accessToken } = JSON.parse(created.payload) as { proxyToken: string };

      return async () => {
        const resolved = await testServer.inject({
          method: "POST",
          url: "/api/v1/agent-vault/proxy/resolve",
          headers: { authorization: `Bearer ${accessToken}`, "x-infisical-agent-session": session.token }
        });
        expect(resolved.statusCode).toBe(200);
        return JSON.parse(resolved.payload) as TResolved;
      };
    };

    const cipherFor = async (accessBundleId: string) => {
      const { projectId } = (await testDb("agent_vault_access_bundles").where({ id: accessBundleId }).first()) as {
        projectId: string;
      };
      return projectCipher(projectId);
    };

    const STORED_REFERENCE = /\{\{([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}/g;

    // What the delete refusal rests on: every field's rows name exactly the ids in its sealed text that resolve
    // expands, which are those of the project's variables. Read off the sealed text, not through the service.
    const expectReferencesMatchSealedText = async (accessBundleId: string) => {
      const { decryptor } = await cipherFor(accessBundleId);
      const open = (sealed: Buffer) =>
        JSON.parse(decryptor({ cipherTextBlob: sealed }).toString("utf-8")) as Record<string, string>;
      const { projectId } = (await testDb("agent_vault_access_bundles").where({ id: accessBundleId }).first()) as {
        projectId: string;
      };
      const variableIds = new Set(
        ((await testDb("agent_vault_variables").where({ projectId }).select("id")) as { id: string }[]).map(
          (row) => row.id
        )
      );
      const idsIn = (text: string) =>
        [...new Set(Array.from(text.matchAll(STORED_REFERENCE), (match) => match[1]))].filter((id) =>
          variableIds.has(id)
        );

      const services = (await testDb("agent_vault_services").where({ accessBundleId })) as {
        id: string;
        encryptedCredential: Buffer | null;
      }[];
      const serviceIds = services.map((service) => service.id);
      type TSealedRow = { id: string; serviceId: string; encryptedValue: Buffer };
      const customHeaders = (await testDb("agent_vault_service_custom_headers").whereIn(
        "serviceId",
        serviceIds
      )) as TSealedRow[];
      const substitutions = (await testDb("agent_vault_service_substitutions").whereIn(
        "serviceId",
        serviceIds
      )) as TSealedRow[];
      const references = (await testDb("agent_vault_service_variable_references").whereIn("serviceId", serviceIds)) as {
        serviceId: string;
        variableId: string;
        field: string;
        customHeaderId: string | null;
        substitutionId: string | null;
      }[];

      const expected = [
        ...services.flatMap((service) =>
          Object.entries(service.encryptedCredential ? open(service.encryptedCredential) : {}).flatMap(([part, text]) =>
            idsIn(text).map(
              (id) => `${service.id} ${part === "username" ? "credential-username" : "credential-value"} ${id}`
            )
          )
        ),
        ...customHeaders.flatMap((row) =>
          idsIn(open(row.encryptedValue).value).map((id) => `${row.serviceId} custom-header:${row.id} ${id}`)
        ),
        ...substitutions.flatMap((row) =>
          idsIn(open(row.encryptedValue).value).map((id) => `${row.serviceId} substitution:${row.id} ${id}`)
        )
      ];
      const actual = references.map((row) => {
        const target = row.customHeaderId ?? row.substitutionId;
        return `${row.serviceId} ${row.field}${target ? `:${target}` : ""} ${row.variableId}`;
      });
      expect(actual.sort()).toEqual(expected.sort());
    };

    test("a service uses a variable by key, and resolve puts the value in its place", async () => {
      const bundle = await createAccessBundle("variables-resolve");
      const token = await createVariable({ key: "GITHUB_TOKEN", value: "ghp_from_variable" });
      const org = await createVariable({ key: "ORG_ID", value: "org-42" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", value: "{{GITHUB_TOKEN}}" },
        customHeaders: [{ name: "X-Org", value: "org={{ORG_ID}};t={{GITHUB_TOKEN}}" }],
        substitutions: [{ placeholder: "__ORG__", surfaces: ["path"], value: "{{ORG_ID}}" }]
      });
      expect(created.statusCode).toBe(200);
      expect(created.payload).not.toContain("ghp_from_variable");
      const { service } = JSON.parse(created.payload) as {
        service: {
          customHeaders: { id: string }[];
          substitutions: { id: string }[];
          variableReferences: TReference[];
        };
      };
      expect(service.variableReferences).toHaveLength(4);
      // Exact entries, because a reference carries only the id its field uses, not the others as null.
      expect(service.variableReferences).toEqual(
        expect.arrayContaining([
          { variableId: token.id, key: "GITHUB_TOKEN", field: "credential-value" },
          {
            variableId: token.id,
            key: "GITHUB_TOKEN",
            field: "custom-header",
            customHeaderId: service.customHeaders[0].id
          },
          {
            variableId: org.id,
            key: "ORG_ID",
            field: "custom-header",
            customHeaderId: service.customHeaders[0].id
          },
          {
            variableId: org.id,
            key: "ORG_ID",
            field: "substitution",
            substitutionId: service.substitutions[0].id
          }
        ])
      );
      await expectReferencesMatchSealedText(bundle.id);

      const resolve = await resolverFor(bundle, "variables-resolve");
      const [resolved] = (await resolve()).services;
      expect(resolved.credential).toMatchObject({ type: "bearer", value: "ghp_from_variable" });
      expect(resolved.customHeaders[0].value).toBe("org=org-42;t=ghp_from_variable");
      expect(resolved.substitutions[0].value).toBe("org-42");
    });

    test("a field at the reference limit reaches the host whole with its variables at their longest, from either save", async () => {
      const bundle = await createAccessBundle("variables-longest");
      const long = await createVariable({ key: "LONG", value: "x" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "longest",
        hostPattern: "longest.example.com",
        credential: { type: "bearer", value: "{{LONG}}".repeat(3) }
      });
      expect(created.statusCode).toBe(200);

      // Nothing measures a field filled in, so a value change can't be refused on a service's behalf.
      const grown = await inject("PATCH", `${variablesUrl}/${long.id}`, { value: "y".repeat(8192) });
      expect(grown.statusCode).toBe(200);

      const resolve = await resolverFor(bundle, "variables-longest");
      expect((await resolve()).services[0].credential).toMatchObject({ value: "y".repeat(8192 * 3) });
    });

    test("a username a variable fills in is trimmed like a typed one, and the password keeps its spaces", async () => {
      const bundle = await createAccessBundle("variables-username-trim");
      await createVariable({ key: "PADDED", value: " padded " });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "padded",
        hostPattern: "padded.example.com",
        credential: { type: "basic", username: "{{PADDED}}", password: "{{PADDED}}" }
      });
      expect(created.statusCode).toBe(200);

      const resolve = await resolverFor(bundle, "variables-username-trim");
      expect((await resolve()).services[0].credential).toEqual({
        type: "basic",
        username: "padded",
        password: " padded "
      });
    });

    test("a stored id with no variable behind it is sent as stored, and its service keeps its restrictions", async () => {
      const bundle = await createAccessBundle("variables-missing");
      const gone = await createVariable({ key: "GONE", value: "x" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "missing",
        hostPattern: "api.example.com",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/v1"],
        credential: { type: "bearer", value: "{{GONE}}" }
      });
      expect(created.statusCode).toBe(200);

      // The delete refusal never lets this happen, so the rows go straight from the database.
      await testDb("agent_vault_service_variable_references").where({ variableId: gone.id }).delete();
      await testDb("agent_vault_variables").where({ id: gone.id }).delete();

      const resolve = await resolverFor(bundle, "variables-missing");
      const [resolved] = (await resolve()).services;
      expect(resolved.credential).toMatchObject({ type: "bearer", value: `{{${gone.id}}}` });
      expect(resolved.allowedMethods).toEqual(["GET"]);
      expect(resolved.allowedPathPrefixes).toEqual(["/v1"]);
    });

    test("renaming a variable keeps its services working, and a new value reaches the next resolve", async () => {
      const bundle = await createAccessBundle("variables-rename");
      const variable = await createVariable({ key: "OLD_NAME", value: "first" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "bearer", value: "{{OLD_NAME}}" }
      });
      expect(created.statusCode).toBe(200);
      const serviceId = (JSON.parse(created.payload) as { service: { id: string } }).service.id;
      const resolve = await resolverFor(bundle, "variables-rename");

      const renamed = await inject("PATCH", `${variablesUrl}/${variable.id}`, { key: "NEW_NAME" });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).variable).toMatchObject({
        key: "NEW_NAME",
        usedByServices: [{ id: serviceId, name: "echo", accessBundleId: bundle.id, accessBundleName: bundle.name }]
      });

      const detail = JSON.parse((await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).payload) as {
        accessBundle: { services: { variableReferences: TReference[] }[] };
      };
      expect(detail.accessBundle.services[0].variableReferences).toEqual([
        expect.objectContaining({ key: "NEW_NAME", field: "credential-value" })
      ]);
      await expectReferencesMatchSealedText(bundle.id);
      expect((await resolve()).services[0].credential).toMatchObject({ value: "first" });

      expect((await inject("PATCH", `${variablesUrl}/${variable.id}`, { value: "second" })).statusCode).toBe(200);
      expect((await resolve()).services[0].credential).toMatchObject({ value: "second" });

      const stale = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "stale",
        hostPattern: "stale.example.com",
        credential: { type: "bearer", value: "{{OLD_NAME}}" }
      });
      expect(stale.statusCode).toBe(400);
      expect(JSON.parse(stale.payload).message).toContain("OLD_NAME");
    });

    test("a variable a service uses can't be deleted, and the refusal names the service", async () => {
      const bundle = await createAccessBundle("variables-in-use");
      const variable = await createVariable({ key: "API_KEY", value: "key_value" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", value: "{{API_KEY}}" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };

      const refused = await inject("DELETE", `${variablesUrl}/${variable.id}`);
      expect(refused.statusCode).toBe(409);
      expect(JSON.parse(refused.payload).message).toContain(`'datadog' (access bundle '${bundle.name}')`);

      const detached = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "http",
        credential: { type: "bearer", value: "literal_value" }
      });
      expect(detached.statusCode).toBe(200);
      expect(JSON.parse(detached.payload).service.variableReferences).toEqual([]);
      await expectReferencesMatchSealedText(bundle.id);

      const removed = await inject("DELETE", `${variablesUrl}/${variable.id}`);
      expect(removed.statusCode).toBe(200);
      expect(JSON.parse(removed.payload).variable).toMatchObject({ id: variable.id, key: "API_KEY" });
    });

    test("an unknown key fails the save by name, and a malformed reference fails validation unquoted", async () => {
      const bundle = await createAccessBundle("variables-validation");

      const unknown = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "unknown",
        hostPattern: "unknown.example.com",
        credential: { type: "bearer", value: "{{NOT_DEFINED}}" }
      });
      expect(unknown.statusCode).toBe(400);
      expect(JSON.parse(unknown.payload).message).toContain("NOT_DEFINED");

      const malformed = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "malformed",
        hostPattern: "malformed.example.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Key", value: "{{lower_case_secret}}" }]
      });
      expect(malformed.statusCode).toBe(422);
      expect(malformed.payload).not.toContain("lower_case_secret");

      const bracedPlaceholder = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "braced",
        hostPattern: "braced.example.com",
        credential: { type: "passthrough" },
        substitutions: [{ placeholder: "{{PAT}}", surfaces: ["header"], value: "x" }]
      });
      expect(bracedPlaceholder.statusCode).toBe(422);

      // A prefix is sent as typed, so braces in one would reach the host as a reference nobody fills in.
      const bracedBearerPrefix = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "braced-bearer",
        hostPattern: "braced-bearer.example.com",
        credential: { type: "bearer", headerPrefix: "{{ORG}}", value: "x" }
      });
      expect(bracedBearerPrefix.statusCode).toBe(422);
      const bracedHeaderPrefix = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "braced-header",
        hostPattern: "braced-header.example.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Org", prefix: "org-{{ORG}}", value: "x" }]
      });
      expect(bracedHeaderPrefix.statusCode).toBe(422);

      expect(await testDb("agent_vault_services").where({ accessBundleId: bundle.id })).toHaveLength(0);
    });

    test("a value takes three variable references, a repeat counted each time, and a fourth fails validation", async () => {
      const bundle = await createAccessBundle("variables-reference-limit");
      await createVariable({ key: "TOKEN", value: "t" });

      const atLimit = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "at-limit",
        hostPattern: "at-limit.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}".repeat(3) }
      });
      expect(atLimit.statusCode).toBe(200);

      const overLimit = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "over-limit",
        hostPattern: "over-limit.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}".repeat(4) }
      });
      expect(overLimit.statusCode).toBe(422);
      expect(overLimit.payload).toContain("at most 3 variable references");

      const services = (await testDb("agent_vault_services").where({ accessBundleId: bundle.id })) as {
        name: string;
      }[];
      expect(services.map((service) => service.name)).toEqual(["at-limit"]);
    });

    test("no response but the value route carries a value, and that route returns it uncached", async () => {
      // A client from before every value was secret may still send isSecret: false. It is stripped, not honoured.
      const createdRes = await inject("POST", variablesUrl, {
        scope: "global",
        key: "HIDDEN",
        value: "hidden_value",
        isSecret: false
      });
      expect(createdRes.statusCode).toBe(200);
      expect(createdRes.payload).not.toContain("hidden_value");
      const hidden = (JSON.parse(createdRes.payload) as { variable: { id: string } }).variable;

      const listed = await inject("GET", `${variablesUrl}?scope=global`);
      expect(listed.statusCode).toBe(200);
      expect(listed.payload).not.toContain("hidden_value");
      const [listedVariable] = JSON.parse(listed.payload).variables;
      expect(listedVariable).toMatchObject({ key: "HIDDEN", usedByServices: [] });
      expect(listedVariable).not.toHaveProperty("accessBundleId");
      expect(listedVariable).not.toHaveProperty("value");
      expect(listedVariable).not.toHaveProperty("isSecret");

      const updated = await inject("PATCH", `${variablesUrl}/${hidden.id}`, { value: "new_hidden_value" });
      expect(updated.statusCode).toBe(200);
      expect(updated.payload).not.toContain("new_hidden_value");

      const revealed = await inject("GET", `${variablesUrl}/${hidden.id}/value`);
      expect(revealed.statusCode).toBe(200);
      expect(JSON.parse(revealed.payload)).toEqual({ value: "new_hidden_value" });
      expect(revealed.headers["cache-control"]).toContain("no-store");

      const row = await testDb("agent_vault_variables").where({ id: hidden.id }).first();
      expect(row.encryptedValue.toString("utf-8")).not.toContain("new_hidden_value");

      const removed = await inject("DELETE", `${variablesUrl}/${hidden.id}`);
      expect(removed.statusCode).toBe(200);
      expect(removed.payload).not.toContain("new_hidden_value");
    });

    test("a value can't be only spaces, and one with spaces around it is kept as typed", async () => {
      const blank = await inject("POST", variablesUrl, { scope: "global", key: "BLANK", value: "   " });
      expect(blank.statusCode).toBe(422);
      expect(blank.payload).toContain("A value can't be only spaces.");

      const padded = await createVariable({ key: "PADDED", value: " kept " });
      const revealed = await inject("GET", `${variablesUrl}/${padded.id}/value`);
      expect(JSON.parse(revealed.payload)).toEqual({ value: " kept " });
      expect((await inject("PATCH", `${variablesUrl}/${padded.id}`, { value: " " })).statusCode).toBe(422);
    });

    test("a key is unique across Agent Vault and has to be upper snake case", async () => {
      const first = await createVariable({ key: "TOKEN", value: "one" });

      const duplicate = await inject("POST", variablesUrl, { scope: "global", key: "TOKEN", value: "two" });
      expect(duplicate.statusCode).toBe(400);
      expect(JSON.parse(duplicate.payload).message).toBe("A variable named 'TOKEN' already exists.");
      // The variable form puts the message on the Key field by this, not by its wording.
      expect(JSON.parse(duplicate.payload).details).toEqual({ field: "key" });
      expect((await inject("POST", variablesUrl, { scope: "global", key: "lower_case", value: "x" })).statusCode).toBe(
        422
      );

      const second = await createVariable({ key: "OTHER", value: "three" });
      const renamedOnto = await inject("PATCH", `${variablesUrl}/${second.id}`, { key: "TOKEN" });
      expect(renamedOnto.statusCode).toBe(400);
      expect(JSON.parse(renamedOnto.payload).message).toBe("A variable named 'TOKEN' already exists.");

      // Renaming a variable to its own key is no clash.
      expect((await inject("PATCH", `${variablesUrl}/${first.id}`, { key: "TOKEN" })).statusCode).toBe(200);
    });

    test("the list pages, searches, and sorts by how many services use each variable", async () => {
      const bundle = await createAccessBundle("variables-list");
      await createVariable({ key: "ALPHA_TOKEN", value: "a" });
      await createVariable({ key: "BETA_TOKEN", value: "b" });
      await createVariable({ key: "GAMMA_KEY", value: "g" });
      const createService = async (body: Record<string, unknown>) =>
        expect((await inject("POST", servicesUrl(bundle.id), { type: "http", ...body })).statusCode).toBe(200);
      // Two fields of one service count as one service.
      await createService({
        name: "both-fields",
        hostPattern: "both-fields.example.com",
        credential: { type: "bearer", value: "{{GAMMA_KEY}}" },
        customHeaders: [{ name: "X-Gamma", value: "{{GAMMA_KEY}}" }]
      });
      await createService({
        name: "gamma-and-beta",
        hostPattern: "gamma-and-beta.example.com",
        credential: { type: "basic", username: "{{BETA_TOKEN}}", password: "{{GAMMA_KEY}}" }
      });

      const list = async (query: string) => {
        const res = await inject("GET", `${variablesUrl}?${query}`);
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload) as { variables: { key: string }[]; totalCount: number };
        return { keys: body.variables.map((variable) => variable.key), totalCount: body.totalCount };
      };

      expect(await list("limit=2")).toEqual({ keys: ["ALPHA_TOKEN", "BETA_TOKEN"], totalCount: 3 });
      expect(await list("limit=2&offset=2")).toEqual({ keys: ["GAMMA_KEY"], totalCount: 3 });
      expect(await list("search=token")).toEqual({ keys: ["ALPHA_TOKEN", "BETA_TOKEN"], totalCount: 2 });
      expect(await list("search=%25")).toEqual({ keys: [], totalCount: 0 });
      expect(await list("orderBy=serviceCount&orderDirection=desc")).toEqual({
        keys: ["GAMMA_KEY", "BETA_TOKEN", "ALPHA_TOKEN"],
        totalCount: 3
      });
      expect((await inject("GET", `${variablesUrl}?limit=101`)).statusCode).toBe(422);

      // Exact keys, so a lookup can tell a key that exists from one that only contains the text.
      expect(await list("scope=global&keys=GAMMA_KEY,MISSING_KEY,ALPHA_TOKEN")).toEqual({
        keys: ["ALPHA_TOKEN", "GAMMA_KEY"],
        totalCount: 2
      });
      expect(await list("scope=global&keys=TOKEN")).toEqual({ keys: [], totalCount: 0 });
      expect((await inject("GET", `${variablesUrl}?scope=global&keys=lower_case`)).statusCode).toBe(422);
      // A trailing comma's empty entry is dropped rather than refused.
      expect(await list("scope=global&keys=GAMMA_KEY,")).toEqual({ keys: ["GAMMA_KEY"], totalCount: 1 });
      // A key can be global and personal at once, so a lookup has to name the scope.
      const unscoped = await inject("GET", `${variablesUrl}?keys=GAMMA_KEY`);
      expect(unscoped.statusCode).toBe(400);
      expect(JSON.parse(unscoped.payload).message).toContain("Send a scope with keys");
    });

    test("a lookup by keys returns every key that exists, past the default page size", async () => {
      const keys = Array.from({ length: 25 }, (_, index) => `LOOKUP_KEY_${String(index).padStart(2, "0")}`);
      await Promise.all(keys.map((key) => createVariable({ key, value: "v" })));

      const res = await inject("GET", `${variablesUrl}?scope=global&keys=${keys.join(",")}`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as { variables: { key: string }[]; totalCount: number };
      expect(body.totalCount).toBe(25);
      expect(body.variables.map((variable) => variable.key)).toEqual(keys);

      // An explicit limit still caps it.
      const capped = JSON.parse(
        (await inject("GET", `${variablesUrl}?scope=global&keys=${keys.join(",")}&limit=5`)).payload
      ) as {
        variables: unknown[];
        totalCount: number;
      };
      expect(capped).toMatchObject({ totalCount: 25 });
      expect(capped.variables).toHaveLength(5);
    });

    test("services in different bundles share a variable, and each resolves it", async () => {
      const first = await createAccessBundle("variables-shared-first");
      const second = await createAccessBundle("variables-shared-second");
      const variable = await createVariable({ key: "SHARED_TOKEN", value: "shared_value" });

      const createdIn = async (bundle: { id: string }, name: string) => {
        const res = await inject("POST", servicesUrl(bundle.id), {
          type: "http",
          name,
          hostPattern: `${name}.example.com`,
          credential: { type: "bearer", value: "{{SHARED_TOKEN}}" }
        });
        expect(res.statusCode).toBe(200);
        return (JSON.parse(res.payload) as { service: { id: string } }).service;
      };
      const firstService = await createdIn(first, "shared-one");
      const secondService = await createdIn(second, "shared-two");
      await expectReferencesMatchSealedText(first.id);
      await expectReferencesMatchSealedText(second.id);

      const listed = JSON.parse((await inject("GET", `${variablesUrl}?scope=global`)).payload) as {
        variables: { id: string; usedByServices: Record<string, string>[] }[];
      };
      expect(listed.variables.find((entry) => entry.id === variable.id)?.usedByServices).toEqual([
        {
          id: firstService.id,
          name: "shared-one",
          hostPattern: "shared-one.example.com",
          accessBundleId: first.id,
          accessBundleName: first.name
        },
        {
          id: secondService.id,
          name: "shared-two",
          hostPattern: "shared-two.example.com",
          accessBundleId: second.id,
          accessBundleName: second.name
        }
      ]);

      const refused = await inject("DELETE", `${variablesUrl}/${variable.id}`);
      expect(refused.statusCode).toBe(409);
      expect(JSON.parse(refused.payload).message).toBe(
        `The variable 'SHARED_TOKEN' is used by the services 'shared-one' (access bundle '${first.name}'), 'shared-two' (access bundle '${second.name}'). Remove it from those services before deleting it.`
      );

      const resolveFirst = await resolverFor(first, "variables-shared-first");
      expect((await resolveFirst()).services[0].credential).toMatchObject({ value: "shared_value" });
      const resolveSecond = await resolverFor(second, "variables-shared-second");
      expect((await resolveSecond()).services[0].credential).toMatchObject({ value: "shared_value" });
    });

    test("a delete waits for a service save that is adding a reference, and then refuses", async () => {
      const bundle = await createAccessBundle("variables-delete-race");
      const variable = await createVariable({ key: "RACED", value: "raced_value" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "raced",
        hostPattern: "raced.example.com",
        credential: { type: "passthrough" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };

      // What a save does once it holds the bundle: take the variable FOR SHARE, then add its reference row.
      const trx = await testDb.transaction();
      try {
        const { rows } = await trx.raw("select pg_backend_pid() as pid");
        await trx("agent_vault_variables").where({ id: variable.id }).forShare().first();

        const pending = inject("DELETE", `${variablesUrl}/${variable.id}`);
        await waitUntilBlockedBy(rows[0].pid);

        await trx("agent_vault_service_variable_references").insert({
          serviceId: service.id,
          variableId: variable.id,
          field: "credential-value"
        });
        await trx.commit();

        const refused = await pending;
        expect(refused.statusCode).toBe(409);
        expect(JSON.parse(refused.payload).message).toContain("'raced'");
      } catch (err) {
        if (!trx.isCompleted()) await trx.rollback();
        throw err;
      }
      expect(await testDb("agent_vault_variables").where({ id: variable.id })).toHaveLength(1);
    });

    test("a service save waiting on a variable that is then deleted fails without leaving a reference", async () => {
      const bundle = await createAccessBundle("variables-save-race");
      const variable = await createVariable({ key: "DOOMED", value: "doomed_value" });

      // What a delete does: lock the variable, find no references, delete it. The save looks the key up first and
      // then queues behind the lock. Its share lock and the deferred foreign key each give this answer on their own.
      const trx = await testDb.transaction();
      try {
        const { rows } = await trx.raw("select pg_backend_pid() as pid");
        await trx("agent_vault_variables").where({ id: variable.id }).forUpdate().first();

        const pending = inject("POST", servicesUrl(bundle.id), {
          type: "http",
          name: "doomed",
          hostPattern: "doomed.example.com",
          credential: { type: "bearer", value: "{{DOOMED}}" }
        });
        await waitUntilBlockedBy(rows[0].pid);

        await trx("agent_vault_variables").where({ id: variable.id }).del();
        await trx.commit();

        const refused = await pending;
        expect(refused.statusCode).toBe(400);
        expect(JSON.parse(refused.payload).message).toBe(
          "A variable this service uses was deleted while it was being saved. Check its variable references and save again."
        );
      } catch (err) {
        if (!trx.isCompleted()) await trx.rollback();
        throw err;
      }
      expect(await testDb("agent_vault_services").where({ accessBundleId: bundle.id })).toHaveLength(0);
    });

    test("an update rebuilds the references of only the values it wrote", async () => {
      const bundle = await createAccessBundle("variables-partial");
      await createVariable({ key: "USER", value: "the-user" });
      await createVariable({ key: "PASS", value: "the-pass" });
      await createVariable({ key: "HEADER", value: "the-header" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "basic",
        hostPattern: "basic.example.com",
        credential: { type: "basic", username: "{{USER}}", password: "{{PASS}}" },
        customHeaders: [{ name: "X-One", value: "{{HEADER}}" }]
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string; customHeaders: { id: string }[] } };
      const url = `${servicesUrl(bundle.id)}/${service.id}`;

      // The password and the renamed header were not sent, so both keep what they had.
      const patched = await inject("PATCH", url, {
        type: "http",
        credential: { type: "basic", username: "plain-user" },
        customHeaders: [{ id: service.customHeaders[0].id, name: "X-Renamed" }]
      });
      expect(patched.statusCode).toBe(200);
      expect(referencesByField(JSON.parse(patched.payload).service.variableReferences)).toEqual([
        "credential-value:PASS",
        "custom-header:HEADER"
      ]);
      await expectReferencesMatchSealedText(bundle.id);

      const resolve = await resolverFor(bundle, "variables-partial");
      const [resolved] = (await resolve()).services;
      expect(resolved.credential).toEqual({ type: "basic", username: "plain-user", password: "the-pass" });
      expect(resolved.customHeaders).toEqual([{ name: "X-Renamed", prefix: "", value: "the-header" }]);

      const switched = await inject("PATCH", url, { type: "http", credential: { type: "bearer", value: "literal" } });
      expect(switched.statusCode).toBe(200);
      expect(referencesByField(JSON.parse(switched.payload).service.variableReferences)).toEqual([
        "custom-header:HEADER"
      ]);
      await expectReferencesMatchSealedText(bundle.id);

      const dropped = await inject("PATCH", url, { type: "http", customHeaders: [] });
      expect(dropped.statusCode).toBe(200);
      expect(JSON.parse(dropped.payload).service.variableReferences).toEqual([]);
      expect(await testDb("agent_vault_service_variable_references").where({ serviceId: service.id })).toHaveLength(0);
    });

    test("a basic credential's kept half is stored text, so one saved before variables existed stays as it was", async () => {
      const bundle = await createAccessBundle("variables-legacy-half");
      await createVariable({ key: "FOO", value: "foo-value" });
      await createVariable({ key: "USER", value: "the-user" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "legacy",
        hostPattern: "legacy.example.com",
        credential: { type: "basic", username: "u", password: "p" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };

      // Sealed the way a service saved before variables existed was: literal braces and no reference rows. The
      // id-shaped pair names no variable at all.
      const legacyPassword = `{{FOO}}:{{${crypto.randomUUID()}}}`;
      const { encryptor } = await cipherFor(bundle.id);
      await testDb("agent_vault_services")
        .where({ id: service.id })
        .update({
          encryptedCredential: encryptor({
            plainText: Buffer.from(JSON.stringify({ username: "u", password: legacyPassword }))
          }).cipherTextBlob
        });

      const patched = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "http",
        credential: { type: "basic", username: "{{USER}}" }
      });
      expect(patched.statusCode).toBe(200);
      expect(referencesByField(JSON.parse(patched.payload).service.variableReferences)).toEqual([
        "credential-username:USER"
      ]);
      await expectReferencesMatchSealedText(bundle.id);

      const resolve = await resolverFor(bundle, "variables-legacy-half");
      expect((await resolve()).services[0].credential).toEqual({
        type: "basic",
        username: "the-user",
        password: legacyPassword
      });
    });

    test("a partial basic update refuses to write over a credential another save changed while it waited", async () => {
      const bundle = await createAccessBundle("variables-stale-half");
      await createVariable({ key: "FIRST_USER", value: "first-user" });
      await createVariable({ key: "SECOND_USER", value: "second-user" });
      await createVariable({ key: "PASS", value: "the-pass" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "stale",
        hostPattern: "stale.example.com",
        credential: { type: "basic", username: "{{FIRST_USER}}", password: "plain-pass" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `${servicesUrl(bundle.id)}/${service.id}`;

      // What the other save commits, sealed by the API itself on a second service: a new username.
      const other = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "other",
        hostPattern: "other.example.com",
        credential: { type: "basic", username: "{{SECOND_USER}}", password: "plain-pass" }
      });
      expect(other.statusCode).toBe(200);
      const otherId = (JSON.parse(other.payload) as { service: { id: string } }).service.id;
      const otherRow = (await testDb("agent_vault_services").where({ id: otherId }).first()) as {
        encryptedCredential: Buffer;
      };
      const otherReferences = (await testDb("agent_vault_service_variable_references").where({
        serviceId: otherId
      })) as { variableId: string; field: string }[];

      // Holding the bundle lock like the other save would, so this one reads the service and then waits.
      const trx = await testDb.transaction();
      try {
        const { rows } = await trx.raw("select pg_backend_pid() as pid");
        await trx("agent_vault_access_bundles").where({ id: bundle.id }).forUpdate().first();

        const pending = inject("PATCH", url, { type: "http", credential: { type: "basic", password: "{{PASS}}" } });
        await waitUntilBlockedBy(rows[0].pid);

        await trx("agent_vault_services")
          .where({ id: service.id })
          .update({ encryptedCredential: otherRow.encryptedCredential });
        await trx("agent_vault_service_variable_references").where({ serviceId: service.id }).del();
        await trx("agent_vault_service_variable_references").insert(
          otherReferences.map(({ variableId, field }) => ({ serviceId: service.id, variableId, field }))
        );
        await trx.commit();

        const refused = await pending;
        expect(refused.statusCode).toBe(409);
      } catch (err) {
        if (!trx.isCompleted()) await trx.rollback();
        throw err;
      }

      const kept = (await testDb("agent_vault_services").where({ id: service.id }).first()) as {
        encryptedCredential: Buffer;
      };
      expect(kept.encryptedCredential.equals(otherRow.encryptedCredential)).toBe(true);
      await expectReferencesMatchSealedText(bundle.id);

      const retried = await inject("PATCH", url, { type: "http", credential: { type: "basic", password: "{{PASS}}" } });
      expect(retried.statusCode).toBe(200);
      await expectReferencesMatchSealedText(bundle.id);

      const resolve = await resolverFor(bundle, "variables-stale-half");
      const resolved = (await resolve()).services.find((entry) => entry.name === "stale");
      expect(resolved?.credential).toEqual({ type: "basic", username: "second-user", password: "the-pass" });
    });

    test("an update whose service is deleted while it waits is a 404, not a deleted variable", async () => {
      const bundle = await createAccessBundle("variables-deleted-service");
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "doomed",
        hostPattern: "doomed.example.com",
        credential: { type: "passthrough" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `${servicesUrl(bundle.id)}/${service.id}`;

      // The update reads the service, then waits on the bundle lock, which a delete doesn't take.
      const trx = await testDb.transaction();
      try {
        const { rows } = await trx.raw("select pg_backend_pid() as pid");
        await trx("agent_vault_access_bundles").where({ id: bundle.id }).forUpdate().first();

        const pending = inject("PATCH", url, {
          type: "http",
          substitutions: [{ placeholder: "__ORG__", surfaces: ["header"], value: "org-42" }]
        });
        await waitUntilBlockedBy(rows[0].pid);

        expect((await inject("DELETE", url)).statusCode).toBe(200);
        await trx.commit();

        const refused = await pending;
        expect(refused.statusCode).toBe(404);
        expect(JSON.parse(refused.payload).message).toBe(`Service with ID '${service.id}' not found`);
      } catch (err) {
        if (!trx.isCompleted()) await trx.rollback();
        throw err;
      }
    });

    test("deleting a bundle keeps the variables its services used, and drops their references", async () => {
      const bundle = await createAccessBundle("variables-bundle-delete");
      const variable = await createVariable({ key: "TOKEN", value: "t" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "one",
        hostPattern: "one.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}" },
        customHeaders: [{ name: "X-Two", value: "{{TOKEN}}" }]
      });
      expect(created.statusCode).toBe(200);

      const removed = await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(removed.statusCode).toBe(200);
      expect(await testDb("agent_vault_service_variable_references").where({ variableId: variable.id })).toHaveLength(
        0
      );

      const listed = JSON.parse((await inject("GET", `${variablesUrl}?scope=global`)).payload) as {
        variables: { id: string; usedByServices: unknown[] }[];
      };
      expect(listed.variables).toEqual([
        expect.objectContaining({ id: variable.id, key: "TOKEN", usedByServices: [] })
      ]);
      expect((await inject("DELETE", `${variablesUrl}/${variable.id}`)).statusCode).toBe(200);
    });

    test("variables are admin only, reads included", async () => {
      const bundle = await createAccessBundle("variables-admin-only");
      const variable = await createVariable({ key: "TOKEN", value: "admin_only_value" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "uses-token",
        hostPattern: "api.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}" }
      });
      expect(created.statusCode).toBe(200);
      const member = await createUaIdentity(`av-variables-member-${Date.now()}`);

      try {
        expect(
          (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [member.id], role: "member" }))
            .statusCode
        ).toBe(200);
        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
              machineIdentityIds: [member.id]
            })
          ).statusCode
        ).toBe(200);

        type TBundleRead = { accessBundle: { services: { name: string; variableReferences?: TReference[] }[] } };

        // The member reaches the bundle, so the refusals below are about variables and nothing else. It sees the
        // service, but neither the key nor the id of the variable its token comes from.
        const reached = await member.asIdentity("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
        expect(reached.statusCode).toBe(200);
        const { accessBundle } = JSON.parse(reached.payload) as TBundleRead;
        expect(accessBundle.services.map((service) => service.name)).toEqual(["uses-token"]);
        expect(accessBundle.services[0]).not.toHaveProperty("variableReferences");
        expect(reached.payload).not.toContain("variableReferences");
        expect(reached.payload).not.toContain("TOKEN");
        expect(reached.payload).not.toContain(variable.id);

        const asAdmin = JSON.parse(
          (await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).payload
        ) as TBundleRead;
        expect(asAdmin.accessBundle.services[0].variableReferences).toEqual([
          { variableId: variable.id, key: "TOKEN", field: "credential-value" }
        ]);

        const listed = await member.asIdentity("GET", `${variablesUrl}?scope=global`);
        expect(listed.statusCode).toBe(403);
        expect(listed.payload).not.toContain("admin_only_value");
        expect(listed.payload).not.toContain("TOKEN");
        // Without a scope a member gets what they can see, which is only their own.
        const everything = await member.asIdentity("GET", variablesUrl);
        expect(everything.statusCode).toBe(200);
        expect(JSON.parse(everything.payload)).toEqual({ variables: [], totalCount: 0 });
        // By id, a global variable reads to a member like one that does not exist, as another member's personal one does.
        expect((await member.asIdentity("GET", `${variablesUrl}/${variable.id}/value`)).statusCode).toBe(404);
        expect((await member.asIdentity("DELETE", `${variablesUrl}/${variable.id}`)).statusCode).toBe(404);
        expect(
          (await member.asIdentity("POST", variablesUrl, { scope: "global", key: "MINE", value: "x" })).statusCode
        ).toBe(403);
        expect((await member.asIdentity("POST", variablesUrl, { key: "MINE", value: "x" })).statusCode).toBe(422);
      } finally {
        await deleteUaIdentity(member.id);
      }
    });
  });

  describe("member-provided values", async () => {
    const servicesUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/services`;
    const membersUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`;
    const personalValuesUrl = (accessBundleId: string, serviceId: string) =>
      `${servicesUrl(accessBundleId)}/${serviceId}/personal-values`;
    const variablesUrl = "/api/v1/agent-vault/variables";
    const personalVariablesUrl = `${variablesUrl}?scope=personal`;

    // Personal variable keys are unique per owner, and the seeded admin owns them across every test here.
    beforeEach(async () => {
      const project = await testDb("projects")
        .where({ orgId: seedData1.organization.id, type: ProjectType.AgentVault })
        .first();
      if (!project) return;
      const variableIds = testDb("agent_vault_variables")
        .where({ projectId: project.id })
        .where((owned) => {
          void owned.whereNotNull("userId").orWhereNotNull("identityId");
        })
        .select("id");
      await testDb("agent_vault_personal_value_references").whereIn("variableId", variableIds).del();
      await testDb("agent_vault_variables").whereIn("id", variableIds).del();
    });

    type TResolvedService = {
      name: string;
      credential: Record<string, string>;
      personalValuesMissing: boolean;
    };

    type TPersonalValues = {
      isConfigured: boolean;
      fields: { field: string; isSet: boolean; variableReferences: { variableId: string; key: string }[] }[];
    };

    const enrollProxy = async (name: string) => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name });
      expect(created.statusCode).toBe(200);
      const { proxyToken: accessToken } = JSON.parse(created.payload) as { proxyToken: string };

      return async (sessionToken: string, serviceName: string) => {
        const resolved = await testServer.inject({
          method: "POST",
          url: "/api/v1/agent-vault/proxy/resolve",
          headers: { authorization: `Bearer ${accessToken}`, "x-infisical-agent-session": sessionToken }
        });
        expect(resolved.statusCode).toBe(200);
        const { services } = JSON.parse(resolved.payload) as { services: TResolvedService[] };
        return services.find((service) => service.name === serviceName)!;
      };
    };

    const mintSession = async (
      as: (method: "POST", url: string, body: Record<string, unknown>) => ReturnType<typeof inject>,
      accessBundleName: string
    ) => {
      const mint = await as("POST", "/api/v1/agent-vault/sessions", { accessBundles: [accessBundleName], ttl: "1h" });
      expect(mint.statusCode).toBe(200);
      return (JSON.parse(mint.payload) as { session: { token: string } }).session.token;
    };

    const createService = async (accessBundleId: string, body: Record<string, unknown>) => {
      const res = await inject("POST", servicesUrl(accessBundleId), { type: "http", ...body });
      expect(res.statusCode).toBe(200);
      return (
        JSON.parse(res.payload) as {
          service: { id: string; name: string; credential: { type: string; memberProvidedFields?: string[] } };
        }
      ).service;
    };

    // The caller's status for each service, as the bundle read returns it.
    const statusesOf = async (
      as: (method: "GET", url: string) => ReturnType<typeof inject>,
      accessBundleId: string
    ) => {
      const res = await as("GET", `/api/v1/agent-vault/access-bundles/${accessBundleId}`);
      expect(res.statusCode).toBe(200);
      const { accessBundle } = JSON.parse(res.payload) as {
        accessBundle: { services: { id: string; personalValues: TPersonalValues | null }[] };
      };
      return new Map(accessBundle.services.map((service) => [service.id, service.personalValues]));
    };

    // The bundles the caller reaches that still require their values, with the services that do.
    const pendingOf = async (as: (method: "GET", url: string) => ReturnType<typeof inject>) => {
      const res = await as("GET", "/api/v1/agent-vault/access-bundles?requiresSetup=true&limit=100");
      expect(res.statusCode).toBe(200);
      const { accessBundles } = JSON.parse(res.payload) as {
        accessBundles: { id: string; servicesRequiringSetup: { id: string; name: string }[] }[];
      };
      return new Map(
        accessBundles.map((bundle) => [bundle.id, bundle.servicesRequiringSetup.map((service) => service.name)])
      );
    };

    const setValues = (
      as: (method: "PATCH", url: string, body: Record<string, unknown>) => ReturnType<typeof inject>,
      accessBundleId: string,
      serviceId: string,
      values: Record<string, string>
    ) =>
      as("PATCH", personalValuesUrl(accessBundleId, serviceId), {
        values: Object.entries(values).map(([field, value]) => ({ field, value }))
      });

    test("a member-provided token comes from whoever the session belongs to", async () => {
      const bundle = await createAccessBundle("mp-bearer");
      const service = await createService(bundle.id, {
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", memberProvidedFields: ["credential-value"] }
      });
      expect(service.credential.memberProvidedFields).toEqual(["credential-value"]);

      const both = await inject("POST", servicesUrl(bundle.id), {
        type: "http",
        name: "datadog-both",
        hostPattern: "api.us5.datadoghq.com",
        credential: { type: "bearer", value: "admin_value", memberProvidedFields: ["credential-value"] }
      });
      expect(both.statusCode).toBe(422);

      // A PATCH that leaves the list out keeps it, so a token sent alongside is refused rather than dropped.
      const dropped = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        type: "http",
        credential: { type: "bearer", value: "admin_value" }
      });
      expect(dropped.statusCode).toBe(400);
      expect(JSON.parse(dropped.payload).message).toContain("'credential-value' is member provided");

      const member = await createMemberIdentity(`mp-bearer-member-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);

        expect((await statusesOf(member.as, bundle.id)).get(service.id)).toEqual({
          isConfigured: false,
          fields: [expect.objectContaining({ field: "credential-value", isSet: false })]
        });
        expect((await pendingOf(member.as)).get(bundle.id)).toEqual(["datadog"]);
        // Each entry carries the service id, which is what saving the values needs.
        const pending = await member.as("GET", "/api/v1/agent-vault/access-bundles?requiresSetup=true");
        expect(
          (
            JSON.parse(pending.payload) as { accessBundles: { id: string; servicesRequiringSetup: unknown[] }[] }
          ).accessBundles.find((listed) => listed.id === bundle.id)?.servicesRequiringSetup
        ).toEqual([{ id: service.id, name: "datadog" }]);
        // false is the rest of what the caller reaches, so the two filters split the list between them.
        const setUp = await member.as("GET", "/api/v1/agent-vault/access-bundles?requiresSetup=false&limit=100");
        expect(
          (JSON.parse(setUp.payload) as { accessBundles: { id: string }[] }).accessBundles.map((listed) => listed.id)
        ).not.toContain(bundle.id);
        // The creator is granted the bundle, so it is one of the admin's own too.
        expect((await statusesOf(inject, bundle.id)).get(service.id)?.isConfigured).toBe(false);
        expect((await pendingOf(inject)).get(bundle.id)).toEqual(["datadog"]);

        const resolve = await enrollProxy("mp-bearer");
        const adminSession = await mintSession(inject, bundle.name);
        const memberSession = await mintSession(member.as, bundle.name);

        const unset = await resolve(adminSession, "datadog");
        expect(unset.personalValuesMissing).toBe(true);
        expect(unset.credential).toEqual({ type: "passthrough" });

        // UUIDs are case-insensitive, so an upper-case bundle id in the path names the same bundle.
        const set = await setValues(member.as, bundle.id.toUpperCase(), service.id, {
          "credential-value": "member_token"
        });
        expect(set.statusCode).toBe(200);
        expect(JSON.parse(set.payload).personalValues).toMatchObject({ isConfigured: true });
        expect(set.payload).not.toContain("member_token");

        expect(await resolve(memberSession, "datadog")).toMatchObject({
          personalValuesMissing: false,
          credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "member_token" }
        });
        expect((await resolve(adminSession, "datadog")).personalValuesMissing).toBe(true);

        expect((await setValues(inject, bundle.id, service.id, { "credential-value": "admin_token" })).statusCode).toBe(
          200
        );
        expect((await resolve(adminSession, "datadog")).credential.value).toBe("admin_token");
        expect((await resolve(memberSession, "datadog")).credential.value).toBe("member_token");

        const wrongField = await setValues(member.as, bundle.id, service.id, { "credential-username": "x" });
        expect(wrongField.statusCode).toBe(400);
        expect((await member.as("PATCH", personalValuesUrl(bundle.id, service.id), { values: [] })).statusCode).toBe(
          422
        );
        expect((await statusesOf(member.as, bundle.id)).get(service.id)?.isConfigured).toBe(true);
        expect((await pendingOf(member.as)).has(bundle.id)).toBe(false);
        const nowSetUp = await member.as("GET", "/api/v1/agent-vault/access-bundles?requiresSetup=false&limit=100");
        expect(
          (JSON.parse(nowSetUp.payload) as { accessBundles: { id: string }[] }).accessBundles.map((listed) => listed.id)
        ).toContain(bundle.id);

        const removed = await member.as("DELETE", personalValuesUrl(bundle.id, service.id));
        expect(removed.statusCode).toBe(200);
        expect(JSON.parse(removed.payload).personalValues.isConfigured).toBe(false);
        expect((await resolve(memberSession, "datadog")).personalValuesMissing).toBe(true);
        expect((await member.as("DELETE", personalValuesUrl(bundle.id, service.id))).statusCode).toBe(404);
      } finally {
        await member.cleanup();
      }
    });

    test("a member's own variables fill their values, and nobody else's do", async () => {
      const bundle = await createAccessBundle("mp-variables");
      const service = await createService(bundle.id, {
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-variables-member-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);

        const adminVariable = await inject("POST", variablesUrl, {
          scope: "personal",
          key: "MY_TOKEN",
          value: "admin_secret"
        });
        expect(adminVariable.statusCode).toBe(200);
        const adminVariableId = (JSON.parse(adminVariable.payload) as { variable: { id: string } }).variable.id;

        // The same key, owned by someone else, is a different variable.
        const created = await member.as("POST", variablesUrl, {
          scope: "personal",
          key: "MY_TOKEN",
          value: "member_secret"
        });
        expect(created.statusCode).toBe(200);
        const memberVariableId = (JSON.parse(created.payload) as { variable: { id: string } }).variable.id;
        expect(
          (await member.as("POST", variablesUrl, { scope: "personal", key: "MY_TOKEN", value: "again" })).statusCode
        ).toBe(400);

        const unknown = await setValues(member.as, bundle.id, service.id, { "credential-value": "{{NOPE}}" });
        expect(unknown.statusCode).toBe(400);
        expect(JSON.parse(unknown.payload).message).toContain("no personal variable named 'NOPE'");

        const set = await setValues(member.as, bundle.id, service.id, { "credential-value": "token {{MY_TOKEN}}" });
        expect(set.statusCode).toBe(200);
        expect(JSON.parse(set.payload).personalValues.fields).toEqual([
          expect.objectContaining({
            field: "credential-value",
            isSet: true,
            variableReferences: [{ variableId: memberVariableId, key: "MY_TOKEN" }]
          })
        ]);

        const resolve = await enrollProxy("mp-variables");
        const memberSession = await mintSession(member.as, bundle.name);
        expect((await resolve(memberSession, "github")).credential.value).toBe("token member_secret");

        const memberList = await member.as("GET", personalVariablesUrl);
        expect(JSON.parse(memberList.payload).variables).toEqual([
          expect.objectContaining({
            key: "MY_TOKEN",
            usedByServices: [expect.objectContaining({ id: service.id, accessBundleName: bundle.name })]
          })
        ]);
        expect(memberList.payload).not.toContain("member_secret");
        const adminList = await inject("GET", personalVariablesUrl);
        expect(JSON.parse(adminList.payload).variables).toEqual([
          expect.objectContaining({ id: adminVariableId, usedByServices: [] })
        ]);

        const idsIn = (res: { payload: string }) =>
          (JSON.parse(res.payload) as { variables: { id: string }[] }).variables.map((variable) => variable.id);

        // Personal variables never show among the global ones, and a member can't list those.
        const globalList = await inject("GET", `${variablesUrl}?scope=global&limit=100`);
        expect(globalList.statusCode).toBe(200);
        expect(idsIn(globalList)).not.toContain(adminVariableId);
        expect(idsIn(globalList)).not.toContain(memberVariableId);
        expect((await member.as("GET", `${variablesUrl}?scope=global`)).statusCode).toBe(403);

        // Without a scope, each caller gets everything they can see: an admin the global ones and their own, a
        // member only their own. Nobody gets another's.
        const adminEverything = await inject("GET", `${variablesUrl}?limit=100`);
        expect(idsIn(adminEverything)).toEqual(expect.arrayContaining([adminVariableId, ...idsIn(globalList)]));
        expect(idsIn(adminEverything)).not.toContain(memberVariableId);
        expect(idsIn(await member.as("GET", variablesUrl))).toEqual([memberVariableId]);
        expect(JSON.parse(created.payload).variable.scope).toBe("personal");

        // Another actor's variable reads exactly like one that does not exist, an admin's included.
        expect((await member.as("GET", `${variablesUrl}/${adminVariableId}/value`)).statusCode).toBe(404);
        expect((await inject("GET", `${variablesUrl}/${memberVariableId}/value`)).statusCode).toBe(404);
        const revealed = await member.as("GET", `${variablesUrl}/${memberVariableId}/value`);
        expect(JSON.parse(revealed.payload).value).toBe("member_secret");

        const inUse = await member.as("DELETE", `${variablesUrl}/${memberVariableId}`);
        expect(inUse.statusCode).toBe(409);
        expect(JSON.parse(inUse.payload).message).toContain("'github'");

        expect((await member.as("PATCH", `${variablesUrl}/${memberVariableId}`, { value: "rotated" })).statusCode).toBe(
          200
        );
        expect((await resolve(memberSession, "github")).credential.value).toBe("token rotated");
      } finally {
        await member.cleanup();
      }
    });

    test("changing which fields are member provided keeps the values that still apply", async () => {
      const bundle = await createAccessBundle("mp-basic");
      const service = await createService(bundle.id, {
        name: "pagerduty",
        hostPattern: "api.pagerduty.com",
        credential: { type: "basic", password: "admin_pw", memberProvidedFields: ["credential-username"] }
      });
      expect(service.credential.memberProvidedFields).toEqual(["credential-username"]);
      const patchService = (credential: Record<string, unknown>) =>
        inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, { type: "http", credential });
      // Which fields a member has saved for the service, read directly since no response lists them all at once.
      const storedFields = async () =>
        (await testDb("agent_vault_personal_values").where({ serviceId: service.id }).select("field"))
          .map((row: { field: string }) => row.field)
          .sort();

      expect((await setValues(inject, bundle.id, service.id, { "credential-username": "admin_user" })).statusCode).toBe(
        200
      );
      const resolve = await enrollProxy("mp-basic");
      const session = await mintSession(inject, bundle.name);
      expect((await resolve(session, "pagerduty")).credential).toEqual({
        type: "basic",
        username: "admin_user",
        password: "admin_pw"
      });

      // Handing the password over too keeps the saved username, and the member only adds the new field.
      expect(
        (await patchService({ type: "basic", memberProvidedFields: ["credential-username", "credential-value"] }))
          .statusCode
      ).toBe(200);
      expect(await storedFields()).toEqual(["credential-username"]);
      expect((await resolve(session, "pagerduty")).personalValuesMissing).toBe(true);
      const onlyPassword = await setValues(inject, bundle.id, service.id, { "credential-value": "member_pw" });
      expect(onlyPassword.statusCode).toBe(200);
      expect(JSON.parse(onlyPassword.payload).personalValues.isConfigured).toBe(true);
      expect((await resolve(session, "pagerduty")).credential).toEqual({
        type: "basic",
        username: "admin_user",
        password: "member_pw"
      });

      // Taking the username back drops only the saved username. The admin's half starts empty.
      expect((await patchService({ type: "basic", memberProvidedFields: ["credential-value"] })).statusCode).toBe(200);
      expect(await storedFields()).toEqual(["credential-value"]);
      expect(await resolve(session, "pagerduty")).toMatchObject({
        personalValuesMissing: false,
        credential: { type: "basic", username: "", password: "member_pw" }
      });

      // A new credential type drops every saved value, even for a field members still provide.
      expect((await patchService({ type: "bearer", memberProvidedFields: ["credential-value"] })).statusCode).toBe(200);
      expect(await storedFields()).toEqual([]);
      expect((await resolve(session, "pagerduty")).personalValuesMissing).toBe(true);

      // With nothing saved, a save has to send every field.
      expect(
        (await patchService({ type: "basic", memberProvidedFields: ["credential-username", "credential-value"] }))
          .statusCode
      ).toBe(200);
      const half = await setValues(inject, bundle.id, service.id, { "credential-username": "only_user" });
      expect(half.statusCode).toBe(400);
      expect(JSON.parse(half.payload).message).toContain("password");

      // A bearer service with no token and nothing left to members is not a credential at all.
      expect((await patchService({ type: "bearer" })).statusCode).toBe(400);
    });

    test("losing a bundle clears the values a member saved for it, and keeps their variables", async () => {
      const bundle = await createAccessBundle("mp-revoke");
      const service = await createService(bundle.id, {
        name: "slack",
        hostPattern: "slack.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-revoke-member-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        expect(
          (await member.as("POST", variablesUrl, { scope: "personal", key: "SLACK_TOKEN", value: "xoxb" })).statusCode
        ).toBe(200);
        expect(
          (await setValues(member.as, bundle.id, service.id, { "credential-value": "{{SLACK_TOKEN}}" })).statusCode
        ).toBe(200);
        // The admin's own values are not the revoked member's to lose.
        expect((await setValues(inject, bundle.id, service.id, { "credential-value": "admin" })).statusCode).toBe(200);

        expect((await inject("DELETE", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(
          200
        );
        expect(
          await testDb("agent_vault_personal_values").where({ serviceId: service.id, identityId: member.id })
        ).toHaveLength(0);
        expect(
          await testDb("agent_vault_personal_values").where({ serviceId: service.id, userId: seedData1.id })
        ).toHaveLength(1);
        expect(await testDb("agent_vault_variables").where({ identityId: member.id })).toHaveLength(1);

        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        expect((await statusesOf(member.as, bundle.id)).get(service.id)?.isConfigured).toBe(false);

        // Leaving Agent Vault clears them too.
        expect((await setValues(member.as, bundle.id, service.id, { "credential-value": "again" })).statusCode).toBe(
          200
        );
        expect(
          (await inject("DELETE", "/api/v1/agent-vault/members", { machineIdentityIds: [member.id] })).statusCode
        ).toBe(200);
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("an admin keeps their values through a revoke, and a demotion clears the ones they hold no grant for", async () => {
      const granted = await createAccessBundle("mp-admin-granted");
      const ungranted = await createAccessBundle("mp-admin-ungranted");
      const credential = { type: "bearer", memberProvidedFields: ["credential-value"] };
      const grantedService = await createService(granted.id, {
        name: "linear",
        hostPattern: "api.linear.app",
        credential
      });
      const ungrantedService = await createService(ungranted.id, {
        name: "notion",
        hostPattern: "api.notion.com",
        credential
      });

      const admin = await createMemberIdentity(`mp-admin-${Date.now()}`);
      const valuesOf = async () =>
        (await testDb("agent_vault_personal_values").where({ identityId: admin.id }).select("serviceId"))
          .map((row: { serviceId: string }) => row.serviceId)
          .sort();
      try {
        const promote = await inject("PATCH", "/api/v1/agent-vault/members", {
          machineIdentityIds: [admin.id],
          role: "admin"
        });
        expect(promote.statusCode).toBe(200);
        expect((await inject("POST", membersUrl(granted.id), { machineIdentityIds: [admin.id] })).statusCode).toBe(200);
        expect((await setValues(admin.as, granted.id, grantedService.id, { "credential-value": "a" })).statusCode).toBe(
          200
        );
        expect(
          (await setValues(admin.as, ungranted.id, ungrantedService.id, { "credential-value": "b" })).statusCode
        ).toBe(200);

        // Still an admin, so the bundle is still theirs to use.
        expect((await inject("DELETE", membersUrl(granted.id), { machineIdentityIds: [admin.id] })).statusCode).toBe(
          200
        );
        expect(await valuesOf()).toEqual([grantedService.id, ungrantedService.id].sort());

        expect((await inject("POST", membersUrl(granted.id), { machineIdentityIds: [admin.id] })).statusCode).toBe(200);
        const demote = await inject("PATCH", "/api/v1/agent-vault/members", {
          machineIdentityIds: [admin.id],
          role: "member"
        });
        expect(demote.statusCode).toBe(200);
        expect(await valuesOf()).toEqual([grantedService.id]);
      } finally {
        await admin.cleanup();
      }
    });

    test("a personal variable on a bundle the member lost drops out of Used By and can be deleted", async () => {
      const bundle = await createAccessBundle("mp-lost-reach");
      const service = await createService(bundle.id, {
        name: "sentry",
        hostPattern: "sentry.io",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-lost-reach-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        const created = await member.as("POST", variablesUrl, { scope: "personal", key: "SENTRY", value: "s" });
        expect(created.statusCode).toBe(200);
        const variableId = (JSON.parse(created.payload) as { variable: { id: string } }).variable.id;
        expect(
          (await setValues(member.as, bundle.id, service.id, { "credential-value": "{{SENTRY}}" })).statusCode
        ).toBe(200);
        expect((await member.as("DELETE", `${variablesUrl}/${variableId}`)).statusCode).toBe(409);

        // Paths outside Agent Vault (a group removal, a lapsed role) drop the grant without clearing values, and the
        // API has no way to stage that here.
        await testDb("memberships").where({ scopeResourceId: bundle.id, actorIdentityId: member.id }).del();

        const listed = await member.as("GET", personalVariablesUrl);
        expect(listed.statusCode).toBe(200);
        expect(JSON.parse(listed.payload).variables).toEqual([
          expect.objectContaining({ id: variableId, usedByServices: [] })
        ]);
        expect((await member.as("DELETE", `${variablesUrl}/${variableId}`)).statusCode).toBe(200);
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("an admin's save on a bundle they hold no grant on waits for a demotion, then 404s", async () => {
      const bundle = await createAccessBundle("mp-admin-race");
      const service = await createService(bundle.id, {
        name: "vercel",
        hostPattern: "api.vercel.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const admin = await createMemberIdentity(`mp-admin-race-${Date.now()}`);
      try {
        expect(
          (await inject("PATCH", "/api/v1/agent-vault/members", { machineIdentityIds: [admin.id], role: "admin" }))
            .statusCode
        ).toBe(200);
        const membership = await testDb("memberships").where({ scope: "project", actorIdentityId: admin.id }).first();

        // What a demotion does: replace the admin role, and hold it until it commits.
        const trx = await testDb.transaction();
        let pending: ReturnType<typeof setValues> | undefined;
        try {
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          await trx("membership_roles").where({ membershipId: membership.id }).delete();
          await trx("membership_roles").insert({ membershipId: membership.id, role: "member" });

          pending = setValues(admin.as, bundle.id, service.id, { "credential-value": "raced" });
          await waitUntilBlockedBy(rows[0].pid);
          await trx.commit();

          expect((await pending).statusCode).toBe(404);
        } catch (err) {
          if (!trx.isCompleted()) await trx.rollback();
          // Let the save finish before cleanup, so a failure here doesn't leave state for the tests after it.
          await pending?.catch(() => undefined);
          throw err;
        }
        expect(await testDb("agent_vault_personal_values").where({ identityId: admin.id })).toHaveLength(0);
      } finally {
        await admin.cleanup();
      }
    });

    test("sorting personal variables by use counts only the services the member still reaches", async () => {
      const lost = await createAccessBundle("mp-sort-lost");
      const kept = await createAccessBundle("mp-sort-kept");
      const credential = { type: "bearer", memberProvidedFields: ["credential-value"] };
      const lostServices = [
        await createService(lost.id, { name: "lost-one", hostPattern: "lost-one.example.com", credential }),
        await createService(lost.id, { name: "lost-two", hostPattern: "lost-two.example.com", credential })
      ];
      const keptService = await createService(kept.id, { name: "kept", hostPattern: "kept.example.com", credential });

      const member = await createMemberIdentity(`mp-sort-${Date.now()}`);
      try {
        const grant = (bundleId: string) => inject("POST", membersUrl(bundleId), { machineIdentityIds: [member.id] });
        expect((await grant(lost.id)).statusCode).toBe(200);
        expect((await grant(kept.id)).statusCode).toBe(200);
        const addVariable = (key: string) => member.as("POST", variablesUrl, { scope: "personal", key, value: "v" });
        expect((await addVariable("A_LOST")).statusCode).toBe(200);
        expect((await addVariable("B_KEPT")).statusCode).toBe(200);
        const save = (bundleId: string, serviceId: string, key: string) =>
          setValues(member.as, bundleId, serviceId, { "credential-value": `{{${key}}}` });
        expect((await save(lost.id, lostServices[0].id, "A_LOST")).statusCode).toBe(200);
        expect((await save(lost.id, lostServices[1].id, "A_LOST")).statusCode).toBe(200);
        expect((await save(kept.id, keptService.id, "B_KEPT")).statusCode).toBe(200);

        // A path outside Agent Vault drops the grant and leaves the values, as in the Used By test above.
        await testDb("memberships").where({ scopeResourceId: lost.id, actorIdentityId: member.id }).del();

        const sorted = await member.as("GET", `${personalVariablesUrl}&orderBy=serviceCount&orderDirection=desc`);
        expect(sorted.statusCode).toBe(200);
        expect(
          (JSON.parse(sorted.payload) as { variables: { key: string; usedByServices: unknown[] }[] }).variables.map(
            (variable) => `${variable.key}:${variable.usedByServices.length}`
          )
        ).toEqual(["B_KEPT:1", "A_LOST:0"]);
      } finally {
        await member.cleanup();
      }
    });

    test("revoking a group's grant clears the values its members saved", async () => {
      const bundle = await createAccessBundle("mp-group-revoke");
      const service = await createService(bundle.id, {
        name: "pagerduty",
        hostPattern: "api.pagerduty.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      const group = await createProjectGroup(await getProjectId(), "mp-group-revoke", ProjectMembershipRole.Member);
      const member = await createMemberIdentity(`mp-group-revoke-${Date.now()}`);
      try {
        await testDb("identity_group_membership").insert({ groupId: group.id, identityId: member.id });
        expect((await inject("POST", membersUrl(bundle.id), { groupIds: [group.id] })).statusCode).toBe(200);
        expect((await setValues(member.as, bundle.id, service.id, { "credential-value": "pd" })).statusCode).toBe(200);

        expect((await inject("DELETE", membersUrl(bundle.id), { groupIds: [group.id] })).statusCode).toBe(200);
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
        await group.cleanup();
      }
    });

    test("a user member's own token is what their session sends", async () => {
      const bundle = await createAccessBundle("mp-user");
      const service = await createService(bundle.id, {
        name: "openai",
        hostPattern: "api.openai.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const { userId } = await createUser("mp-user");
      try {
        await addUserMembership({ userId, orgId: seedData1.organization.id, role: OrgMembershipRole.Member });
        expect(
          (await inject("POST", "/api/v1/agent-vault/members", { userIds: [userId], role: "member" })).statusCode
        ).toBe(200);
        expect((await inject("POST", membersUrl(bundle.id), { userIds: [userId] })).statusCode).toBe(200);
        const token = await createUserAccessToken({ userId, orgId: seedData1.organization.id });
        const asUser = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
          testServer.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) });

        expect((await pendingOf(asUser)).get(bundle.id)).toEqual(["openai"]);
        expect(
          (await asUser("POST", variablesUrl, { scope: "personal", key: "OPENAI_KEY", value: "sk-user" })).statusCode
        ).toBe(200);
        expect(
          (await setValues(asUser, bundle.id, service.id, { "credential-value": "{{OPENAI_KEY}}" })).statusCode
        ).toBe(200);
        expect((await statusesOf(asUser, bundle.id)).get(service.id)?.isConfigured).toBe(true);

        const resolve = await enrollProxy("mp-user");
        const resolved = await resolve(await mintSession(asUser, bundle.name), "openai");
        expect(resolved.personalValuesMissing).toBe(false);
        expect(resolved.credential).toMatchObject({ value: "sk-user" });
      } finally {
        await deleteUsers([userId]);
      }
    });

    test("a revoke of an admin's last grant waits for a demotion's cleanup, then clears their values", async () => {
      const bundle = await createAccessBundle("mp-demote-revoke");
      const service = await createService(bundle.id, {
        name: "sentry",
        hostPattern: "sentry-race.example.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const admin = await createMemberIdentity(`mp-demote-revoke-${Date.now()}`);
      try {
        expect(
          (await inject("PATCH", "/api/v1/agent-vault/members", { machineIdentityIds: [admin.id], role: "admin" }))
            .statusCode
        ).toBe(200);
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [admin.id] })).statusCode).toBe(200);
        expect((await setValues(admin.as, bundle.id, service.id, { "credential-value": "mine" })).statusCode).toBe(200);
        const membership = await testDb("memberships").where({ scope: "project", actorIdentityId: admin.id }).first();
        const projectId = membership.scopeProjectId as string;

        // A demotion, written and holding the cleanup lock: its own cleanup already ran and skipped, because the
        // grant was still there. The revoke's cleanup has to wait for it, then see the admin role gone.
        const trx = await testDb.transaction();
        let pending: ReturnType<typeof inject> | undefined;
        try {
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          await trx("membership_roles").where({ membershipId: membership.id }).delete();
          await trx("membership_roles").insert({ membershipId: membership.id, role: "member" });
          await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ClearAgentVaultPersonalValues(projectId)]);

          pending = inject("DELETE", membersUrl(bundle.id), { machineIdentityIds: [admin.id] });
          await waitUntilBlockedBy(rows[0].pid);
          await trx.commit();

          expect((await pending).statusCode).toBe(200);
        } catch (err) {
          if (!trx.isCompleted()) await trx.rollback();
          await pending?.catch(() => undefined);
          throw err;
        }
        expect(await testDb("agent_vault_personal_values").where({ identityId: admin.id })).toHaveLength(0);
      } finally {
        await admin.cleanup();
      }
    });

    test("deleting a bundle while a member is being removed from Agent Vault doesn't deadlock", async () => {
      const bundle = await createAccessBundle("mp-delete-vs-remove");
      const service = await createService(bundle.id, {
        name: "linear",
        hostPattern: "linear-deadlock.example.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-delete-vs-remove-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        expect((await setValues(member.as, bundle.id, service.id, { "credential-value": "mine" })).statusCode).toBe(
          200
        );

        // What a removal does: delete the member's grants, then their saved values, in one transaction.
        const trx = await testDb.transaction();
        let pending: ReturnType<typeof inject> | undefined;
        try {
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          await trx("memberships").where({ scopeResourceId: bundle.id, actorIdentityId: member.id }).delete();

          pending = inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
          await waitUntilBlockedBy(rows[0].pid);
          await trx("agent_vault_personal_values").where({ identityId: member.id }).delete();
          await trx.commit();

          expect((await pending).statusCode).toBe(200);
        } catch (err) {
          if (!trx.isCompleted()) await trx.rollback();
          await pending?.catch(() => undefined);
          throw err;
        }
        expect(await testDb("agent_vault_access_bundles").where({ id: bundle.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("deleting a bundle while a member saves their personal values doesn't deadlock", async () => {
      const bundle = await createAccessBundle("mp-delete-vs-save");
      const service = await createService(bundle.id, {
        name: "notion",
        hostPattern: "notion-deadlock.example.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-delete-vs-save-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);

        // Holding the service row queues the save on it and the delete behind the save, so once this lets go the
        // save holds the service while the delete waits for it.
        const trx = await testDb.transaction();
        let save: ReturnType<typeof inject> | undefined;
        let remove: ReturnType<typeof inject> | undefined;
        try {
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          await trx("agent_vault_services").where({ id: service.id }).forUpdate().first();

          save = setValues(member.as, bundle.id, service.id, { "credential-value": "mine" });
          await waitUntilBlockedBy(rows[0].pid);
          const { rows: queued } = await testDb.raw(
            "select pid from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
            [rows[0].pid]
          );
          expect(queued).toHaveLength(1);
          remove = inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
          await waitUntilBlockedBy(queued[0].pid);
          await trx.rollback();

          expect((await save).statusCode).toBe(200);
          expect((await remove).statusCode).toBe(200);
        } catch (err) {
          if (!trx.isCompleted()) await trx.rollback();
          await Promise.all([save?.catch(() => undefined), remove?.catch(() => undefined)]);
          throw err;
        }
        // The values went with the service, which the API can no longer name.
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("deleting a personal variable while its owner saves values that use it doesn't deadlock", async () => {
      const bundle = await createAccessBundle("mp-variable-vs-save");
      const service = await createService(bundle.id, {
        name: "sentry",
        hostPattern: "sentry-deadlock.example.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-variable-vs-save-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        const created = await member.as("POST", variablesUrl, { scope: "personal", key: "SENTRY_DSN", value: "s" });
        expect(created.statusCode).toBe(200);
        const variableId = (JSON.parse(created.payload) as { variable: { id: string } }).variable.id;
        expect(
          (await setValues(member.as, bundle.id, service.id, { "credential-value": "{{SENTRY_DSN}}" })).statusCode
        ).toBe(200);

        // What a delete does once it finds the service out of the owner's reach: lock the variable, delete their
        // values there, then the variable. Meanwhile the save replaces the value that holds the reference.
        const trx = await testDb.transaction();
        let save: ReturnType<typeof inject> | undefined;
        try {
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          await trx("agent_vault_variables").where({ id: variableId }).forUpdate().first();

          save = setValues(member.as, bundle.id, service.id, { "credential-value": "token {{SENTRY_DSN}}" });
          await waitUntilBlockedBy(rows[0].pid);
          await trx("agent_vault_personal_values").where({ identityId: member.id, serviceId: service.id }).delete();
          await trx("agent_vault_variables").where({ id: variableId }).delete();
          await trx.commit();

          const res = await save;
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(res.payload).message).toBe(
            "A variable one of your values uses was deleted while it was being saved. Check its variable references and save again."
          );
        } catch (err) {
          if (!trx.isCompleted()) await trx.rollback();
          await save?.catch(() => undefined);
          throw err;
        }
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("until a member sets up their half, resolve sends no credential, not the admin's half", async () => {
      const bundle = await createAccessBundle("mp-half");
      await createService(bundle.id, {
        name: "jira",
        hostPattern: "jira-half.example.com",
        credential: { type: "basic", password: "admin-password", memberProvidedFields: ["credential-username"] }
      });

      const member = await createMemberIdentity(`mp-half-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        const resolve = await enrollProxy("mp-half");
        const unset = await resolve(await mintSession(member.as, bundle.name), "jira");
        expect(unset.personalValuesMissing).toBe(true);
        expect(unset.credential).toEqual({ type: "passthrough" });
      } finally {
        await member.cleanup();
      }
    });

    test("taking every field back from members on the same type deletes their values", async () => {
      const bundle = await createAccessBundle("mp-take-all");
      const service = await createService(bundle.id, {
        name: "confluence",
        hostPattern: "confluence-all.example.com",
        credential: { type: "basic", memberProvidedFields: ["credential-username", "credential-value"] }
      });

      const member = await createMemberIdentity(`mp-take-all-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        expect(
          (await setValues(member.as, bundle.id, service.id, { "credential-username": "u", "credential-value": "p" }))
            .statusCode
        ).toBe(200);

        const takeBack = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
          type: "http",
          credential: { type: "basic", username: "admin-u", password: "admin-p", memberProvidedFields: [] }
        });
        expect(takeBack.statusCode).toBe(200);
        expect((await statusesOf(member.as, bundle.id)).get(service.id)).toBeNull();
        expect(await testDb("agent_vault_personal_values").where({ serviceId: service.id })).toHaveLength(0);
      } finally {
        await member.cleanup();
      }
    });

    test("a user loses their values with a direct revoke, and a group member with the group's", async () => {
      const bundle = await createAccessBundle("mp-users");
      const service = await createService(bundle.id, {
        name: "notion",
        hostPattern: "notion-users.example.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      const group = await createProjectGroup(await getProjectId(), "mp-users-group", ProjectMembershipRole.Member);
      const direct = await createUser("mp-direct");
      const viaGroup = await createUser("mp-via-group");
      try {
        const asUser = async (userId: string) => {
          await addUserMembership({ userId, orgId: seedData1.organization.id, role: OrgMembershipRole.Member });
          expect(
            (await inject("POST", "/api/v1/agent-vault/members", { userIds: [userId], role: "member" })).statusCode
          ).toBe(200);
          const token = await createUserAccessToken({ userId, orgId: seedData1.organization.id });
          return (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
            testServer.inject({
              method,
              url,
              headers: { authorization: `Bearer ${token}` },
              ...(body ? { body } : {})
            });
        };
        const directAs = await asUser(direct.userId);
        const groupAs = await asUser(viaGroup.userId);
        await testDb("user_group_membership").insert({ groupId: group.id, userId: viaGroup.userId });

        expect((await inject("POST", membersUrl(bundle.id), { userIds: [direct.userId] })).statusCode).toBe(200);
        expect((await inject("POST", membersUrl(bundle.id), { groupIds: [group.id] })).statusCode).toBe(200);
        expect((await setValues(directAs, bundle.id, service.id, { "credential-value": "a" })).statusCode).toBe(200);
        expect((await setValues(groupAs, bundle.id, service.id, { "credential-value": "b" })).statusCode).toBe(200);

        expect((await inject("DELETE", membersUrl(bundle.id), { userIds: [direct.userId] })).statusCode).toBe(200);
        expect(await testDb("agent_vault_personal_values").where({ userId: direct.userId })).toHaveLength(0);
        expect(await testDb("agent_vault_personal_values").where({ userId: viaGroup.userId })).toHaveLength(1);

        expect((await inject("DELETE", membersUrl(bundle.id), { groupIds: [group.id] })).statusCode).toBe(200);
        expect(await testDb("agent_vault_personal_values").where({ userId: viaGroup.userId })).toHaveLength(0);
      } finally {
        await testDb("user_group_membership").where({ groupId: group.id }).delete();
        await group.cleanup();
        await deleteUsers([direct.userId, viaGroup.userId]);
      }
    });

    test("a save made against a stale credential type is refused, not stored under the new type", async () => {
      const bundle = await createAccessBundle("mp-stale-type");
      const service = await createService(bundle.id, {
        name: "bitbucket",
        hostPattern: "bitbucket-stale.example.com",
        credential: { type: "basic", username: "admin-u", memberProvidedFields: ["credential-value"] }
      });

      const member = await createMemberIdentity(`mp-stale-type-${Date.now()}`);
      try {
        expect((await inject("POST", membersUrl(bundle.id), { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        // The member's page still shows basic, but an admin has since switched the service to bearer.
        expect(
          (
            await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
              type: "http",
              credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
            })
          ).statusCode
        ).toBe(200);
        const stale = await member.as("PATCH", personalValuesUrl(bundle.id, service.id), {
          values: [{ field: "credential-value", value: "my-password" }],
          credentialType: "basic"
        });
        expect(stale.statusCode).toBe(409);
        expect(await testDb("agent_vault_personal_values").where({ identityId: member.id })).toHaveLength(0);

        const current = await member.as("PATCH", personalValuesUrl(bundle.id, service.id), {
          values: [{ field: "credential-value", value: "my-token" }],
          credentialType: "bearer"
        });
        expect(current.statusCode).toBe(200);
      } finally {
        await member.cleanup();
      }
    });

    test("an admin is asked for values on a bundle they reach only by role, and granted narrows the list", async () => {
      const ungranted = await createAccessBundle("mp-mine-ungranted");
      const service = await createService(ungranted.id, {
        name: "openai",
        hostPattern: "api.openai.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      const granted = await createAccessBundle("mp-mine-granted");
      expect((await inject("DELETE", membersUrl(ungranted.id), { userIds: [seedData1.id] })).statusCode).toBe(200);

      const listOf = async (query: string) => {
        const res = await inject("GET", `/api/v1/agent-vault/access-bundles?search=mp-mine&${query}`);
        expect(res.statusCode).toBe(200);
        const { accessBundles, totalCount } = JSON.parse(res.payload) as {
          accessBundles: { id: string }[];
          totalCount: number;
        };
        return { ids: accessBundles.map((bundle) => bundle.id), totalCount };
      };

      const listed = await inject("GET", "/api/v1/agent-vault/access-bundles?search=mp-mine&limit=100");
      expect(JSON.parse(listed.payload).accessBundles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: ungranted.id, servicesRequiringSetup: [{ id: service.id, name: "openai" }] }),
          expect.objectContaining({ id: granted.id, servicesRequiringSetup: [] })
        ])
      );
      expect((await pendingOf(inject)).get(ungranted.id)).toEqual(["openai"]);
      expect(await listOf("requiresSetup=false")).toEqual({ ids: [granted.id], totalCount: 1 });
      expect(await listOf("granted=true")).toEqual({ ids: [granted.id], totalCount: 1 });
      expect(await listOf("granted=false")).toEqual({ ids: [ungranted.id], totalCount: 1 });
      expect(await listOf("requiresSetup=true&granted=true")).toEqual({ ids: [], totalCount: 0 });
      expect(await listOf("requiresSetup=true&granted=false")).toEqual({ ids: [ungranted.id], totalCount: 1 });
      expect(await listOf("requiresSetup=false&granted=false")).toEqual({ ids: [], totalCount: 0 });
      expect((await inject("GET", "/api/v1/agent-vault/access-bundles?requiresSetup=maybe")).statusCode).toBe(422);
      expect((await inject("GET", "/api/v1/agent-vault/access-bundles?granted=maybe")).statusCode).toBe(422);
      expect((await statusesOf(inject, ungranted.id)).get(service.id)?.isConfigured).toBe(false);
    });

    test("a service out of reach is a 404, and one without member-provided fields takes no values", async () => {
      const bundle = await createAccessBundle("mp-reach");
      const memberService = await createService(bundle.id, {
        name: "anthropic",
        hostPattern: "api.anthropic.com",
        credential: { type: "bearer", memberProvidedFields: ["credential-value"] }
      });
      const adminService = await createService(bundle.id, {
        name: "mistral",
        hostPattern: "api.mistral.ai",
        credential: { type: "bearer", value: "admin_only" }
      });

      const member = await createMemberIdentity(`mp-reach-member-${Date.now()}`);
      try {
        expect((await setValues(member.as, bundle.id, memberService.id, { "credential-value": "x" })).statusCode).toBe(
          404
        );
        expect((await member.as("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).statusCode).toBe(404);
        expect((await pendingOf(member.as)).size).toBe(0);
        // A service named under another bundle reads as missing too.
        const other = await createAccessBundle("mp-reach-other");
        expect((await setValues(inject, other.id, memberService.id, { "credential-value": "x" })).statusCode).toBe(404);
      } finally {
        await member.cleanup();
      }

      const refused = await setValues(inject, bundle.id, adminService.id, { "credential-value": "x" });
      expect(refused.statusCode).toBe(400);
      expect(JSON.parse(refused.payload).message).toContain("doesn't take any values from its members");
      expect((await statusesOf(inject, bundle.id)).get(adminService.id)).toBeNull();
    });
  });

  describe("product membership", async () => {
    const membersUrl = "/api/v1/agent-vault/members";

    type TListedMember = Record<string, unknown> & {
      type: string;
      id: string;
      role: string;
      isActive: boolean;
      addedAt: string;
    };

    const keyOf = (member: TListedMember) => `${member.type}:${member.id}`;

    const listMembers = async (query = "") => {
      const res = await inject("GET", `${membersUrl}${query ? `?${query}` : ""}`);
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.payload) as { members: TListedMember[]; totalCount: number };
    };

    test("one list answers for all three actor kinds, and each arm carries what its table renders", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const identity = await createOrgIdentity(`av-merged-list-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-merged-list-group", ProjectMembershipRole.Member);

      try {
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" })).statusCode
        ).toBe(200);

        const { members, totalCount } = await listMembers();
        expect(totalCount).toBe(members.length);

        const byType = Object.fromEntries(members.map((member) => [member.type, member]));
        expect(Object.keys(byType).sort()).toEqual(["group", "machineIdentity", "user"]);

        expect(byType.user).toMatchObject({ id: seedData1.id, username: expect.any(String) });
        expect(byType.user.isOrgMembershipPending).toBe(false);
        expect(byType.user.role).toBe("admin");
        expect(byType.user.isActive).toBe(true);

        expect(byType.group).toMatchObject({ id: group.id, name: "av-merged-list-group" });

        // An organization-owned identity can be detached; one Agent Vault created can only be deleted,
        // and the table needs to know which before it offers a button.
        expect(byType.machineIdentity).toMatchObject({ id: identity.id, isManagedByAgentVault: false });
        expect(byType.machineIdentity.orgId).toBe(seedData1.organization.id);

        // The actor's id is the only id on a member, since it is the one every write takes.
        members.forEach((member) => {
          expect(member.addedAt).toEqual(expect.any(String));
          expect(member).not.toHaveProperty("actor");
          expect(member).not.toHaveProperty("createdAt");
          expect(member).not.toHaveProperty("membershipId");
          expect(member).not.toHaveProperty("userId");
          expect(member).not.toHaveProperty("identityId");
          expect(member).not.toHaveProperty("groupId");
        });
      } finally {
        await group.cleanup();
        await deleteOrgIdentity(identity.id);
      }
    });

    test("the list filters, searches and pages on the server, and the count follows the filter", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const identity = await createOrgIdentity(`av-paging-zzz-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-paging-group", ProjectMembershipRole.Member);

      try {
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" })).statusCode
        ).toBe(200);

        const all = await listMembers();
        expect(all.totalCount).toBeGreaterThanOrEqual(3);

        const identities = await listMembers("actorType=machineIdentity");
        expect(identities.members.every((member) => member.type === "machineIdentity")).toBe(true);
        expect(identities.totalCount).toBe(identities.members.length);
        expect(identities.totalCount).toBeLessThan(all.totalCount);

        // The count describes the filtered set, not the whole one, or the pager promises pages it will
        // not serve.
        const searched = await listMembers("search=av-paging-group");
        expect(searched.totalCount).toBe(1);
        expect(searched.members[0].id).toBe(group.id);

        // A user matches on their full name even though no column holds it.
        const byFullName = await listMembers(`search=${encodeURIComponent(seedData1.email)}`);
        expect(byFullName.members.some((member) => member.id === seedData1.id)).toBe(true);

        // Walking the pages one row at a time reaches every member exactly once, which is what the
        // membership-id tiebreak buys on rows that share a name or a createdAt.
        const walked: string[] = [];
        for (let offset = 0; offset < all.totalCount; offset += 1) {
          // eslint-disable-next-line no-await-in-loop
          const page = await listMembers(`limit=1&offset=${offset}`);
          expect(page.members).toHaveLength(1);
          expect(page.totalCount).toBe(all.totalCount);
          walked.push(keyOf(page.members[0]));
        }
        expect(new Set(walked).size).toBe(all.totalCount);
        expect(walked.sort()).toEqual(all.members.map(keyOf).sort());

        expect((await inject("GET", `${membersUrl}?limit=0`)).statusCode).toBe(422);
        expect((await inject("GET", `${membersUrl}?limit=101`)).statusCode).toBe(422);
        expect((await inject("GET", `${membersUrl}?offset=10001`)).statusCode).toBe(422);
        expect((await inject("GET", `${membersUrl}?actorType=nonsense`)).statusCode).toBe(422);
      } finally {
        await group.cleanup();
        await deleteOrgIdentity(identity.id);
      }
    });

    test("a machine identity can be given Agent Vault, have its role changed, and lose it again", async () => {
      const identity = await createOrgIdentity(`av-membership-${Date.now()}`);

      const added = await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" });
      expect(added.statusCode).toBe(200);
      expect(JSON.parse(added.payload).members[0]).toMatchObject({
        type: "machineIdentity",
        id: identity.id,
        role: "member",
        addedAt: expect.any(String)
      });

      const listed = await listMembers("actorType=machineIdentity");
      const row = listed.members.find((member) => member.id === identity.id);
      expect(row?.role).toBe("member");
      expect(row?.name).toBeTruthy();

      const promoted = await inject("PATCH", membersUrl, { machineIdentityIds: [identity.id], role: "admin" });
      expect(promoted.statusCode).toBe(200);
      expect(JSON.parse(promoted.payload)).toMatchObject({
        members: [{ type: "machineIdentity", id: identity.id, role: "admin" }],
        skipped: []
      });

      // Asking for the role a member already holds changes nothing, so it is reported as skipped.
      const unchanged = await inject("PATCH", membersUrl, { machineIdentityIds: [identity.id], role: "admin" });
      expect(unchanged.statusCode).toBe(200);
      expect(JSON.parse(unchanged.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "machineIdentity", id: identity.id }]
      });

      const removed = await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] });
      expect(removed.statusCode).toBe(200);
      expect(JSON.parse(removed.payload)).toEqual({
        members: [{ type: "machineIdentity", id: identity.id }],
        skipped: []
      });

      // A second revoke has nothing to remove, so it reports the actor as skipped rather than failing:
      // that is what makes the call safe to retry.
      const again = await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] });
      expect(again.statusCode).toBe(200);
      expect(JSON.parse(again.payload)).toEqual({
        members: [],
        skipped: [{ type: "machineIdentity", id: identity.id }]
      });

      const after = await listMembers("actorType=machineIdentity");
      expect(after.members.some((member) => member.id === identity.id)).toBe(false);

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

      expect((await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" })).statusCode).toBe(
        200
      );
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
            machineIdentityIds: [identity.id]
          })
        ).statusCode
      ).toBe(200);

      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(1);

      expect((await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] })).statusCode).toBe(200);

      expect(await grantRows(bundle.id, { actorIdentityId: identity.id })).toHaveLength(0);

      await deleteOrgIdentity(identity.id);
    });

    // Each refusal below asserts the rows as well as the status: a 400 that applied half the batch would
    // pass a status-only check.
    test("a member can be added by email alone, and the cap counts emails", async () => {
      // The add body is one object, not an intersection: zod parses each side of an intersection on its
      // own, so an id-side object would strip emails before the refines ran, 422ing this exact call.
      const byEmail = await inject("POST", membersUrl, { emails: [seedData1.email], role: "member" });
      expect(byEmail.statusCode).toBe(200);
      // The seed admin is already a member, and skipped echoes the identifier the caller sent -- the
      // email, not the uuid it resolved to.
      expect(JSON.parse(byEmail.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "user", id: seedData1.id, identifier: seedData1.email }]
      });

      const tooMany = await inject("POST", membersUrl, {
        userIds: ["00000000-0000-0000-0000-000000000001"],
        emails: Array.from({ length: 100 }, (_, i) => `av-cap-${i}@example.com`),
        role: "member"
      });
      expect(tooMany.statusCode).toBe(422);
    });

    test("a deactivated member is refused even while one of their groups is still active", async () => {
      const suffix = Date.now();
      const [user] = (await testDb("users")
        .insert({ username: `av-suspended-${suffix}@example.com`, isAccepted: true, isGhost: false })
        .returning("*")) as { id: string }[];
      const [group] = (await testDb("groups")
        .insert({ orgId: seedData1.organization.id, name: `av-active-${suffix}`, slug: `av-active-${suffix}` })
        .returning("*")) as { id: string }[];

      try {
        await testDb("memberships").insert({
          scope: AccessScope.Organization,
          scopeOrgId: seedData1.organization.id,
          actorUserId: user.id,
          status: "accepted",
          isActive: false
        });
        await testDb("memberships").insert({
          scope: AccessScope.Organization,
          scopeOrgId: seedData1.organization.id,
          actorGroupId: group.id,
          isActive: true
        });
        await testDb("user_group_membership").insert({ groupId: group.id, userId: user.id });

        // Their own membership is the authoritative one: deactivation suspends the person even while a
        // group they belong to stays active, so the group row must not vouch for them.
        const refused = await inject("POST", membersUrl, { userIds: [user.id], role: "member" });
        expect(refused.statusCode).toBe(400);
        // Named as deactivated rather than missing: reactivating is the remedy, not inviting.
        expect(JSON.parse(refused.payload).message).toContain("is deactivated in this organization");
      } finally {
        await testDb("user_group_membership").where({ userId: user.id }).delete();
        await testDb("memberships").where({ actorUserId: user.id }).delete();
        await testDb("memberships").where({ actorGroupId: group.id }).delete();
        await testDb("groups").where({ id: group.id }).delete();
        await testDb("users").where({ id: user.id }).delete();
      }
    });

    test("a batch that would leave no admin is refused whole, and nobody is removed", async () => {
      const projectId = await getProjectId();
      const one = await createOrgIdentity(`av-batch-admin-a-${Date.now()}`);
      const two = await createOrgIdentity(`av-batch-admin-b-${Date.now()}`);

      try {
        expect(
          (
            await inject("POST", membersUrl, {
              machineIdentityIds: [one.id, two.id],
              role: ProjectMembershipRole.Admin
            })
          ).statusCode
        ).toBe(200);

        const adminCount = async () =>
          (
            (await testDb("membership_roles")
              .join("memberships", "memberships.id", "membership_roles.membershipId")
              .where({ scope: AccessScope.Project, scopeProjectId: projectId, role: ProjectMembershipRole.Admin })
              .select("membership_roles.id")) as unknown[]
          ).length;

        const callerGroup = await makeCallerAdminOnlyThroughGroup(projectId);
        try {
          expect(await adminCount()).toBe(3);

          // Revoking any one of these on its own would pass the guard, because the other two are still
          // standing. Naming all three in one call is what the batch check exists for.
          const refused = await inject("DELETE", membersUrl, {
            groupIds: [callerGroup.groupId],
            machineIdentityIds: [one.id, two.id]
          });
          expect(refused.statusCode).toBe(400);
          expect(JSON.parse(refused.payload).message).toContain("must keep at least one admin");
          expect(await adminCount()).toBe(3);
        } finally {
          await callerGroup.restore();
        }
      } finally {
        await deleteOrgIdentity(one.id);
        await deleteOrgIdentity(two.id);
      }
    });

    test("naming yourself anywhere in a revoke refuses the whole call", async () => {
      const identity = await createOrgIdentity(`av-batch-self-${Date.now()}`);

      try {
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" })).statusCode
        ).toBe(200);

        const refused = await inject("DELETE", membersUrl, {
          userIds: [seedData1.id],
          machineIdentityIds: [identity.id]
        });
        expect(refused.statusCode).toBe(403);
        expect(JSON.parse(refused.payload).message).toContain("your own access");

        // The other actor named in the same call still has access.
        const listed = await listMembers("actorType=machineIdentity");
        expect(listed.members.some((member) => member.id === identity.id)).toBe(true);
      } finally {
        await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] });
        await deleteOrgIdentity(identity.id);
      }
    });

    test("a role change applies to the members it can and reports the rest as skipped", async () => {
      const projectId = await getProjectId();
      const toChange = await createOrgIdentity(`av-role-change-${Date.now()}`);
      const alreadyAdmin = await createOrgIdentity(`av-role-same-${Date.now()}`);
      const notMember = await createOrgIdentity(`av-role-none-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-role-group", ProjectMembershipRole.Member);

      try {
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [toChange.id], role: "member" })).statusCode
        ).toBe(200);
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [alreadyAdmin.id], role: "admin" })).statusCode
        ).toBe(200);

        const res = await inject("PATCH", membersUrl, {
          machineIdentityIds: [toChange.id, alreadyAdmin.id, notMember.id],
          groupIds: [group.id],
          role: "admin"
        });
        expect(res.statusCode).toBe(200);
        const { members, skipped } = JSON.parse(res.payload) as {
          members: { type: string; id: string; role: string }[];
          skipped: { type: string; id: string }[];
        };
        expect(members.map((member) => `${member.type}:${member.id}:${member.role}`).sort()).toEqual(
          [`group:${group.id}:admin`, `machineIdentity:${toChange.id}:admin`].sort()
        );
        expect(skipped.map((actor) => `${actor.type}:${actor.id}`).sort()).toEqual(
          [`machineIdentity:${alreadyAdmin.id}`, `machineIdentity:${notMember.id}`].sort()
        );

        const roleOf = async (actorType: string, id: string) =>
          (await listMembers(`actorType=${actorType}`)).members.find((member) => member.id === id)?.role;
        expect(await roleOf("machineIdentity", toChange.id)).toBe("admin");
        expect(await roleOf("machineIdentity", alreadyAdmin.id)).toBe("admin");
        expect(await roleOf("group", group.id)).toBe("admin");
        expect(await roleOf("machineIdentity", notMember.id)).toBeUndefined();
      } finally {
        await inject("DELETE", membersUrl, { machineIdentityIds: [toChange.id, alreadyAdmin.id] });
        await group.cleanup();
        await deleteOrgIdentity(toChange.id);
        await deleteOrgIdentity(alreadyAdmin.id);
        await deleteOrgIdentity(notMember.id);
      }
    });

    test("available lists the actors that are not members yet, and drops each one as it is added", async () => {
      const projectId = await getProjectId();
      const identity = await createOrgIdentity(`av-available-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-available-group", ProjectMembershipRole.Member);

      const listAvailable = async (query = "") => {
        const res = await inject("GET", `${membersUrl}/available${query ? `?${query}` : ""}`);
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.payload) as {
          actors: { type: string; id: string }[];
          totalCount: number;
        };
      };

      try {
        const idsOf = (actors: { id: string }[]) => actors.map((actor) => actor.id);

        // The identity is in the organization but not in Agent Vault, so it is offered. The group and the
        // seed admin are already members, so they are not.
        const before = await listAvailable("limit=100");
        expect(idsOf(before.actors)).toContain(identity.id);
        expect(idsOf(before.actors)).not.toContain(group.id);
        expect(idsOf(before.actors)).not.toContain(seedData1.id);

        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [identity.id], role: "member" })).statusCode
        ).toBe(200);

        const afterAdd = await listAvailable("limit=100");
        expect(idsOf(afterAdd.actors)).not.toContain(identity.id);
        expect(afterAdd.totalCount).toBe(before.totalCount - 1);

        // Revoking puts it back, so the list tracks membership rather than caching it.
        expect((await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] })).statusCode).toBe(200);
        const afterRevoke = await listAvailable("limit=100");
        expect(idsOf(afterRevoke.actors)).toContain(identity.id);
        expect(afterRevoke.totalCount).toBe(before.totalCount);

        // The filter and the search reach the same row.
        const identitiesOnly = await listAvailable("actorType=machineIdentity&limit=100");
        expect(identitiesOnly.actors.every((actor) => actor.type === "machineIdentity")).toBe(true);
        expect(idsOf(identitiesOnly.actors)).toContain(identity.id);

        const searched = await listAvailable(`search=${encodeURIComponent("av-available-")}`);
        expect(idsOf(searched.actors)).toContain(identity.id);

        // totalCount is the whole set, not the page, so a picker can say the list is truncated.
        const firstPage = await listAvailable("limit=1");
        expect(firstPage.actors).toHaveLength(1);
        expect(firstPage.totalCount).toBe(before.totalCount);
      } finally {
        await inject("DELETE", membersUrl, { machineIdentityIds: [identity.id] });
        await group.cleanup();
        await deleteOrgIdentity(identity.id);
      }
    });

    test("available rejects the same out-of-range query values the member list does", async () => {
      const availableUrl = `${membersUrl}/available`;
      expect((await inject("GET", `${availableUrl}?limit=0`)).statusCode).toBe(422);
      expect((await inject("GET", `${availableUrl}?limit=101`)).statusCode).toBe(422);
      expect((await inject("GET", `${availableUrl}?offset=10001`)).statusCode).toBe(422);
      expect((await inject("GET", `${availableUrl}?actorType=nonsense`)).statusCode).toBe(422);
    });

    test("one add names every actor kind at once, dedupes a repeat, and skips whoever already had access", async () => {
      const projectId = await getProjectId();
      const identity = await createOrgIdentity(`av-batch-add-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-batch-add-group", ProjectMembershipRole.Member);

      try {
        // The group is already a member from createProjectGroup, and so is the seed admin.
        const added = await inject("POST", membersUrl, {
          userIds: [seedData1.id, seedData1.id],
          groupIds: [group.id],
          machineIdentityIds: [identity.id],
          role: "member"
        });
        expect(added.statusCode).toBe(200);

        const { members, skipped } = JSON.parse(added.payload) as {
          members: { type: string; id: string }[];
          skipped: { type: string; id: string }[];
        };

        expect(members).toHaveLength(1);
        expect(members[0]).toMatchObject({ type: "machineIdentity", id: identity.id });
        expect(skipped.map((el) => el.id).sort()).toEqual([group.id, seedData1.id].sort());
      } finally {
        await group.cleanup();
        await deleteOrgIdentity(identity.id);
      }
    });

    test("the guards that keep the product administrable hold", async () => {
      const self = await inject("DELETE", membersUrl, { userIds: [seedData1.id] });
      expect(self.statusCode).toBe(403);

      const unknown = await inject("POST", membersUrl, {
        machineIdentityIds: ["00000000-0000-0000-0000-000000000000"],
        role: "member"
      });
      expect(unknown.statusCode).toBe(404);

      // Adding someone who already has access is not a failure, so the rest of a batch still lands.
      const duplicate = await inject("POST", membersUrl, { userIds: [seedData1.id], role: "member" });
      expect(duplicate.statusCode).toBe(200);
      expect(JSON.parse(duplicate.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "user", id: seedData1.id }]
      });

      const badRole = await inject("PATCH", membersUrl, { userIds: [seedData1.id], role: "viewer" });
      expect(badRole.statusCode).toBe(422);

      const noActors = await inject("PATCH", membersUrl, { role: "member" });
      expect(noActors.statusCode).toBe(422);

      const bystander = await createOrgIdentity(`av-role-self-${Date.now()}`);
      try {
        expect(
          (await inject("POST", membersUrl, { machineIdentityIds: [bystander.id], role: "member" })).statusCode
        ).toBe(200);

        const selfInBatch = await inject("PATCH", membersUrl, {
          userIds: [seedData1.id],
          machineIdentityIds: [bystander.id],
          role: "admin"
        });
        expect(selfInBatch.statusCode).toBe(403);
        expect(JSON.parse(selfInBatch.payload).message).toContain("your own role");

        // The other actor named in the same call keeps its role.
        const listed = await listMembers("actorType=machineIdentity");
        expect(listed.members.find((member) => member.id === bystander.id)?.role).toBe("member");
      } finally {
        await inject("DELETE", membersUrl, { machineIdentityIds: [bystander.id] });
        await deleteOrgIdentity(bystander.id);
      }

      const notAnId = await inject("DELETE", membersUrl, { userIds: ["not-a-uuid"] });
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
          `/api/v1/agent-vault/access-bundles/${unknown}/services`,
          { type: "http", name: "c", hostPattern: "api.foo.com", credential: { type: "passthrough" } }
        ],
        // The bundle is the path resource, so a missing one is still 404 even though a missing actor in
        // the body is reported as skipped.
        ["DELETE", `/api/v1/agent-vault/access-bundles/${unknown}/members`, { userIds: [seedData1.id] }]
      ];

      for await (const [method, url, body] of routes) {
        const res = await inject(method, url, body);
        expect([method, url, res.statusCode]).toEqual([method, url, 404]);
      }
    });
  });

  describe("app connections", async () => {
    test("an organization connection is out of reach here, and an Agent Vault one is not", async () => {
      const projectId = await getProjectId();

      const orgConnectionId = await createAwsAppConnection({
        name: `av-scope-org-${Date.now()}`,
        authToken: jwtAuthToken
      });

      const created = await inject("POST", "/api/v1/agent-vault/app-connections/aws", {
        name: `av-scope-own-${Date.now()}`,
        method: "access-key",
        credentials: { accessKeyId: "AKIAFAKEACCESSKEYID", secretAccessKey: "fake-secret-access-key" },
        projectId: seedData1.project.id
      });
      expect(created.statusCode, created.payload).toBe(200);
      const ownConnection = created.json().appConnection as { id: string };
      expect(ownConnection).not.toHaveProperty("projectId");
      const ownRow = (await testDb("app_connections").where({ id: ownConnection.id }).first()) as
        | { projectId: string }
        | undefined;
      expect(ownRow?.projectId).toBe(projectId);

      const listed = await inject("GET", "/api/v1/agent-vault/app-connections/aws");
      expect(listed.statusCode).toBe(200);
      const listedIds = (listed.json().appConnections as { id: string }[]).map((row) => row.id);
      expect(listedIds).toContain(ownConnection.id);
      expect(listedIds).not.toContain(orgConnectionId);

      const byId = (connectionId: string) => `/api/v1/agent-vault/app-connections/aws/${connectionId}`;
      const reaching: ["GET" | "PATCH" | "DELETE", string, Record<string, unknown>?][] = [
        ["GET", byId(orgConnectionId)],
        ["PATCH", byId(orgConnectionId), { description: "reached from the wrong scope" }],
        ["DELETE", byId(orgConnectionId)]
      ];
      for await (const [method, url, body] of reaching) {
        const res = await inject(method, url, body);
        expect([method, res.statusCode]).toEqual([method, 404]);
      }

      const survived = await inject("GET", `/api/v1/app-connections/aws/${orgConnectionId}`);
      expect(survived.statusCode).toBe(200);

      const missingId = crypto.randomUUID();
      const outOfScope = await inject("GET", byId(orgConnectionId));
      const missing = await inject("GET", byId(missingId));
      expect(outOfScope.json().message.replace(orgConnectionId, "<id>")).toBe(
        missing.json().message.replace(missingId, "<id>")
      );

      const [otherApp] = (await testDb("app_connections")
        .insert({
          name: `av-scope-gh-${Date.now()}`,
          app: AppConnection.GitHub,
          method: "pat",
          encryptedCredentials: Buffer.from("never-decrypted"),
          orgId: seedData1.organization.id
        })
        .returning("id")) as { id: string }[];
      try {
        expect((await inject("GET", byId(otherApp.id))).statusCode).toBe(404);
      } finally {
        await testDb("app_connections").where({ id: otherApp.id }).delete();
      }

      const member = await createMemberIdentity(`av-scope-member-${Date.now()}`);
      try {
        expect((await member.as("GET", byId(orgConnectionId))).statusCode).toBe(404);
        expect((await member.as("GET", byId(ownConnection.id))).statusCode).toBe(403);
      } finally {
        await member.cleanup();
      }

      expect((await inject("GET", byId(ownConnection.id))).statusCode).toBe(200);
      expect(
        (await inject("PATCH", byId(ownConnection.id), { description: "reached from its own scope" })).statusCode
      ).toBe(200);
      expect((await inject("DELETE", byId(ownConnection.id))).statusCode).toBe(200);

      await deleteAwsAppConnection({ connectionId: orgConnectionId, authToken: jwtAuthToken });
    });

    test("an update through another app's route is refused before it writes, like a delete", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/app-connections/aws", {
        name: `av-wrong-app-own-${Date.now()}`,
        method: "access-key",
        credentials: { accessKeyId: "AKIAFAKEACCESSKEYID", secretAccessKey: "fake-secret-access-key" }
      });
      expect(created.statusCode, created.payload).toBe(200);
      const ownAws = await testDb("app_connections").where({ id: created.json().appConnection.id }).first();
      const orgAwsId = await createAwsAppConnection({
        name: `av-wrong-app-org-${Date.now()}`,
        authToken: jwtAuthToken
      });
      const orgAws = await testDb("app_connections").where({ id: orgAwsId }).first();

      // Rows only, so a GitHub connection can sit where the create path would never put one.
      const githubRow = (name: string, projectId: string | null, encryptedCredentials: Buffer) => ({
        name,
        app: AppConnection.GitHub,
        method: "pat",
        encryptedCredentials,
        orgId: seedData1.organization.id,
        projectId
      });
      const [inAgentVault] = (await testDb("app_connections")
        .insert(githubRow(`av-wrong-app-gh-${Date.now()}`, ownAws.projectId, ownAws.encryptedCredentials))
        .returning("*")) as { id: string }[];
      const [inOrg] = (await testDb("app_connections")
        .insert(githubRow(`org-wrong-app-gh-${Date.now()}`, null, orgAws.encryptedCredentials))
        .returning("*")) as { id: string }[];

      try {
        const routes = [
          [inAgentVault.id, `/api/v1/agent-vault/app-connections/aws/${inAgentVault.id}`],
          [inOrg.id, `/api/v1/app-connections/aws/${inOrg.id}`]
        ] as const;
        for await (const [id, url] of routes) {
          const res = await inject("PATCH", url, { description: "through the wrong route" });
          expect([url, res.statusCode]).toEqual([url, 400]);
          expect(res.json().message).toBe(`App Connection with ID ${id} is not for App "aws"`);
          expect((await testDb("app_connections").where({ id }).first()).description).toBeNull();
        }
      } finally {
        await testDb("app_connections").whereIn("id", [inAgentVault.id, inOrg.id, ownAws.id, orgAwsId]).delete();
      }
    });

    test("only AWS is offered under Agent Vault", async () => {
      const res = await inject("GET", `/api/v1/app-connections/options?projectType=${ProjectType.AgentVault}`);
      expect(res.statusCode).toBe(200);
      const apps = (res.json().appConnectionOptions as { app: string }[]).map((option) => option.app);
      expect(apps).toEqual(["aws"]);
    });

    test("the shared route refuses a non-AWS connection in the Agent Vault project", async () => {
      const projectId = await getProjectId();

      const res = await inject("POST", "/api/v1/app-connections/humanitec", {
        name: `av-non-aws-${Date.now()}`,
        method: "api-token",
        credentials: { apiToken: "fake-api-token" },
        projectId
      });
      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json().message).toBe("Humanitec Connections can't be used in this project. It supports: AWS.");
    });
  });

  describe("sessions", async () => {
    test("a session reads by id, and one you may not see is indistinguishable from one that is not there", async () => {
      const bundle = await createAccessBundle(`session-by-id-${Date.now()}`);
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h"
      });
      expect(mint.statusCode).toBe(200);
      const { session } = JSON.parse(mint.payload) as { session: { id: string } };

      const mine = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}`);
      expect(mine.statusCode).toBe(200);
      expect(mine.json().session).toMatchObject({
        id: session.id,
        status: "active",
        actor: expect.objectContaining({
          type: "user",
          id: seedData1.id,
          username: seedData1.username,
          email: seedData1.email
        }),
        accessBundles: [expect.objectContaining({ name: bundle.name })]
      });

      const member = await createMemberIdentity(`session-by-id-member-${Date.now()}`);
      try {
        expect((await member.as("GET", "/api/v1/agent-vault/sessions")).statusCode).toBe(200);

        const missingId = crypto.randomUUID();
        const somebodyElses = await member.as("GET", `/api/v1/agent-vault/sessions/${session.id}`);
        const neverExisted = await member.as("GET", `/api/v1/agent-vault/sessions/${missingId}`);

        expect([somebodyElses.statusCode, neverExisted.statusCode]).toEqual([404, 404]);
        expect(somebodyElses.json().message).toBe(`Session with ID '${session.id}' not found`);
        expect(neverExisted.json().message).toBe(`Session with ID '${missingId}' not found`);
        expect(somebodyElses.json().error).toBe(neverExisted.json().error);
      } finally {
        await member.cleanup();
      }
    });

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

    test("a label is optional, trimmed, returned on every read, and searchable", async () => {
      const bundle = await createAccessBundle(`session-label-${Date.now()}`);

      const unlabeled = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h"
      });
      expect(unlabeled.statusCode).toBe(200);
      expect(unlabeled.json().session.label).toBeNull();

      const labeled = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h",
        label: "  session-label nightly deploy  "
      });
      expect(labeled.statusCode).toBe(200);
      const { session } = labeled.json() as { session: { id: string; label: string | null } };
      expect(session.label).toBe("session-label nightly deploy");

      const byId = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}`);
      expect(byId.json().session.label).toBe("session-label nightly deploy");

      const search = await inject("GET", "/api/v1/agent-vault/sessions?search=nightly%20deploy");
      const found = search.json() as { sessions: { id: string; label: string | null }[]; totalCount: number };
      expect(found.totalCount).toBe(1);
      expect(found.sessions[0]).toMatchObject({ id: session.id, label: "session-label nightly deploy" });

      const tooLong = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h",
        label: "a".repeat(129)
      });
      expect(tooLong.statusCode).toBe(422);

      const withNewline = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h",
        label: "line one\nline two"
      });
      expect(withNewline.statusCode).toBe(422);
    });

    test("a label that would read differently from what is stored is rejected", async () => {
      const bundle = await createAccessBundle(`session-label-chars-${Date.now()}`);
      const mint = (label: unknown) =>
        inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h", label });

      const rejected = {
        tab: "a\tb",
        zeroWidthSpace: "\u200b",
        rightToLeftOverride: "revo \u202eltr",
        lineSeparator: "a\u2028b",
        paragraphSeparator: "a\u2029b",
        c1Control: "a\u0085b",
        privateUse: "a\ue000b",
        loneSurrogate: "a\ud800b"
      };
      for await (const [name, label] of Object.entries(rejected)) {
        const res = await mint(label);
        expect(res.statusCode, name).toBe(422);
        expect(JSON.stringify(res.json().message), name).toContain("invisible characters");
      }

      for await (const label of ["PR #123 (prod): café, 部署", "ship it 🚀"]) {
        const res = await mint(label);
        expect(res.statusCode).toBe(200);
        expect(res.json().session.label).toBe(label);
      }

      const explicitNull = await mint(null);
      expect(explicitNull.statusCode).toBe(200);
      expect(explicitNull.json().session.label).toBeNull();

      const blank = await mint("   ");
      expect(blank.json().session.label).toBeNull();
    });

    test("a label can be changed or removed later, only by someone who can see the session", async () => {
      const bundle = await createAccessBundle(`session-label-edit-${Date.now()}`);
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h" });
      const { id } = mint.json().session as { id: string };

      const set = await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "  first pass  " });
      expect(set.statusCode).toBe(200);
      expect(set.json().session).toMatchObject({ id, label: "first pass", status: "active" });
      expect((await inject("GET", `/api/v1/agent-vault/sessions/${id}`)).json().session.label).toBe("first pass");

      // The label is the only field, so leaving it out must not read as clearing it.
      expect((await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, {})).statusCode).toBe(422);
      expect((await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "a\u200bb" })).statusCode).toBe(422);
      expect((await inject("GET", `/api/v1/agent-vault/sessions/${id}`)).json().session.label).toBe("first pass");

      // Back to a label it held a moment ago: the write must land even though nothing looks changed from the
      // label two edits back.
      expect((await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "second pass" })).statusCode).toBe(
        200
      );
      const back = await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "first pass" });
      expect(back.json().session.label).toBe("first pass");
      expect((await testDb("agent_vault_sessions").where({ id }).first()).label).toBe("first pass");

      const cleared = await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: null });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().session.label).toBeNull();

      // A revoked session can still be labelled, for whoever reads it afterwards.
      expect((await inject("POST", `/api/v1/agent-vault/sessions/${id}/revoke`)).statusCode).toBe(200);
      const afterRevoke = await inject("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "done" });
      expect(afterRevoke.statusCode).toBe(200);
      expect(afterRevoke.json().session).toMatchObject({ label: "done", status: "revoked" });

      const member = await createMemberIdentity(`session-label-member-${Date.now()}`);
      try {
        const somebodyElses = await member.as("PATCH", `/api/v1/agent-vault/sessions/${id}`, { label: "mine now" });
        expect(somebodyElses.statusCode).toBe(404);
        expect((await inject("GET", `/api/v1/agent-vault/sessions/${id}`)).json().session.label).toBe("done");
      } finally {
        await member.cleanup();
      }
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
          sessions: { id: string; actor: Record<string, unknown>; accessBundles: { name: string }[] }[];
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
            expect(r.sessions[0].actor).toEqual({
              type: "user",
              id: null,
              username: "gone@example.com",
              email: "gone@example.com",
              firstName: "Gone Person",
              lastName: null
            });
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
          why: "search and status narrow together; the ownerless row reads as revoked, not active",
          query: "search=matrix-&status=active&limit=100",
          expect: (r) => expect(r.totalCount).toBe(6)
        },
        {
          why: "the ownerless row is the only revoked one inside the match",
          query: "search=matrix-&status=revoked&limit=100",
          expect: (r) => {
            expect(r.totalCount).toBe(1);
            expect(r.sessions[0].id).toBe(orphaned);
          }
        },
        {
          why: "a status with no members inside the match is empty",
          query: "search=matrix-&status=expired&limit=100",
          expect: (r) => expect(r.totalCount).toBe(0)
        },
        {
          why: "several statuses match any of them",
          query: "search=matrix-&status=active,revoked&limit=100",
          expect: (r) => expect(r.totalCount).toBe(7)
        },
        {
          why: "a status with no members adds nothing to one that has them",
          query: "search=matrix-&status=revoked,expired&limit=100",
          expect: (r) => {
            expect(r.totalCount).toBe(1);
            expect(r.sessions[0].id).toBe(orphaned);
          }
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

    test("ttl is a free-form duration with a one minute floor", async () => {
      const bundle = await createAccessBundle("session-ttl-free");
      const before = Date.now();
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "90m" });
      expect(mint.statusCode).toBe(200);
      const { session } = JSON.parse(mint.payload) as { session: { expiresAt: string } };
      const lifetimeMs = new Date(session.expiresAt).getTime() - before;
      expect(lifetimeMs).toBeGreaterThanOrEqual(90 * 60 * 1000 - 5_000);
      expect(lifetimeMs).toBeLessThanOrEqual(90 * 60 * 1000 + 60_000);

      const tooShort = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "30s"
      });
      expect(tooShort.statusCode).toBe(422);
      const garbage = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "soon"
      });
      expect(garbage.statusCode).toBe(422);
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
      expect(JSON.parse(first.payload).session).toMatchObject({
        status: "revoked",
        actor: { type: "user", id: seedData1.id }
      });
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
    const buildResolver = (
      overrides: Partial<
        Pick<Parameters<typeof agentVaultProxyServiceFactory>[0], "licenseService" | "agentVaultSessionLogConfigDAL">
      > = {}
    ) =>
      agentVaultProxyServiceFactory({
        agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
        agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
        agentVaultServiceCustomHeaderDAL: agentVaultServiceCustomHeaderDALFactory(testDb),
        agentVaultServiceSubstitutionDAL: agentVaultServiceSubstitutionDALFactory(testDb),
        agentVaultVariableDAL: agentVaultVariableDALFactory(testDb),
        agentVaultPersonalValueDAL: agentVaultPersonalValueDALFactory(testDb),
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        projectDAL: projectDALFactory(testDb),
        userDAL: userDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never,
        agentVaultOauthService: {} as never,
        ...overrides
      });

    const mintForResolve = async (name: string) => {
      const bundle = await createAccessBundle(name);
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "1h" });
      expect(mint.statusCode).toBe(200);
      const { session } = JSON.parse(mint.payload) as { session: { token: string } };
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name });
      expect(proxyRes.statusCode).toBe(200);
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };
      return { session, proxy };
    };

    const sessionLogConfig = (enabled: boolean) => ({
      findOne: () =>
        Promise.resolve({
          enabled,
          storageType: "external",
          appConnectionId: crypto.randomUUID(),
          bucket: "session-logs",
          region: "us-east-1",
          keyPrefix: null
        })
    });

    test("resolve reports session logs off when the plan lacks them", async () => {
      const { session, proxy } = await mintForResolve("resolve-session-logs-unlicensed");
      const getPlan = vi.fn(() => Promise.resolve({ agentVaultByoS3: false }));
      const resolver = buildResolver({
        licenseService: {
          getPlan,
          isServingFallbackPlan: () => Promise.resolve(false),
          getLastKnownPlan: () => Promise.resolve(null)
        } as never,
        agentVaultSessionLogConfigDAL: sessionLogConfig(true) as never
      });

      const resolved = await resolver.resolveSession({
        proxyId: proxy.id,
        orgId: seedData1.organization.id,
        sessionToken: session.token,
        hasSessionLogKey: true
      });

      expect(getPlan).toHaveBeenCalledWith(seedData1.organization.id);
      expect(resolved.sessionLogs).toEqual({ enabled: false, sessionKey: null });
    });

    test("while the plan can't be confirmed, a proxy that holds the key keeps recording and no new key goes out", async () => {
      const { session, proxy } = await mintForResolve("resolve-session-logs-plan-unknown");
      const resolver = buildResolver({
        licenseService: {
          getPlan: () => Promise.resolve({ agentVaultByoS3: false }),
          isServingFallbackPlan: () => Promise.resolve(true),
          getLastKnownPlan: () => Promise.resolve(null)
        } as never,
        agentVaultSessionLogConfigDAL: sessionLogConfig(true) as never
      });
      const resolve = (hasSessionLogKey: boolean) =>
        resolver.resolveSession({
          proxyId: proxy.id,
          orgId: seedData1.organization.id,
          sessionToken: session.token,
          hasSessionLogKey
        });

      expect((await resolve(true)).sessionLogs).toEqual({ enabled: true, sessionKey: null });
      expect((await resolve(false)).sessionLogs).toEqual({ enabled: false, sessionKey: null });
    });

    test("resolve does not read the plan while session logs are off", async () => {
      const { session, proxy } = await mintForResolve("resolve-session-logs-off");
      const getPlan = vi.fn(() => Promise.resolve({ agentVaultByoS3: true }));
      const resolver = buildResolver({
        licenseService: { getPlan } as never,
        agentVaultSessionLogConfigDAL: sessionLogConfig(false) as never
      });

      const resolved = await resolver.resolveSession({
        proxyId: proxy.id,
        orgId: seedData1.organization.id,
        sessionToken: session.token,
        hasSessionLogKey: true
      });

      expect(getPlan).not.toHaveBeenCalled();
      expect(resolved.sessionLogs.enabled).toBe(false);
    });

    test("resolve carries the policy and the decrypted transformations", async () => {
      const bundle = await createAccessBundle("resolve-transformations");
      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "github",
        hostPattern: "api.github.com",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/repos"],
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Org-Id", prefix: "Org", value: "org_secret" }],
        substitutions: [{ placeholder: "__GITHUB_PAT__", surfaces: ["header"], value: "ghp_secret" }]
      });
      expect(created.statusCode).toBe(200);

      const mint = await inject("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: [bundle.name],
        ttl: "1h"
      });
      expect(mint.statusCode).toBe(200);
      const { session } = JSON.parse(mint.payload) as { session: { token: string } };

      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", {
        name: "resolve-transformations"
      });
      expect(proxyRes.statusCode).toBe(200);
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };

      const resolver = agentVaultProxyServiceFactory({
        agentVaultProxyDAL: agentVaultProxyDALFactory(testDb),
        agentVaultResolveDAL: agentVaultResolveDALFactory(testDb),
        agentVaultServiceCustomHeaderDAL: agentVaultServiceCustomHeaderDALFactory(testDb),
        agentVaultServiceSubstitutionDAL: agentVaultServiceSubstitutionDALFactory(testDb),
        agentVaultVariableDAL: agentVaultVariableDALFactory(testDb),
        agentVaultPersonalValueDAL: agentVaultPersonalValueDALFactory(testDb),
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        projectDAL: projectDALFactory(testDb),
        userDAL: userDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () =>
            Promise.resolve({ decryptor: () => Buffer.from(JSON.stringify({ value: "unsealed" })) })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never,
        agentVaultOauthService: {} as never
      });

      const resolved = await resolver.resolveSession({
        proxyId: proxy.id,
        orgId: seedData1.organization.id,
        sessionToken: session.token,
        hasSessionLogKey: false
      });

      expect(resolved.services).toHaveLength(1);
      const [service] = resolved.services;
      expect(service.allowedMethods).toEqual(["GET"]);
      expect(service.allowedPathPrefixes).toEqual(["/repos"]);
      expect(service.customHeaders).toEqual([{ name: "X-Org-Id", prefix: "Org", value: "unsealed" }]);
      expect(service.substitutions).toEqual([
        { placeholder: "__GITHUB_PAT__", surfaces: ["header"], value: "unsealed" }
      ]);
    });

    test("a deactivated actor stops resolving, and resolves again once reactivated", async () => {
      const bundle = await createAccessBundle("resolve-deactivation");
      const service = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "passthrough" }
      });
      expect(service.statusCode).toBe(200);

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
          sessionToken: session.token,
          hasSessionLogKey: false
        });

      const membership = await testDb("memberships")
        .where({ scope: AccessScope.Organization, scopeOrgId: seedData1.organization.id, actorUserId: seedData1.id })
        .first();

      const before = await resolve();
      expect(before.services).toHaveLength(1);

      try {
        await testDb("memberships").where({ id: membership.id }).update({ isActive: false });
        await expect(resolve()).rejects.toThrow(UnauthorizedError);
      } finally {
        await testDb("memberships").where({ id: membership.id }).update({ isActive: true });
      }

      const after = await resolve();
      expect(after.services).toHaveLength(1);
    });
    // The actor columns are SET NULL so the row outlives its owner. A null id must never reach the
    // membership lookups: there it compiles to IS NULL, matches every user row, and once resolved as admin.
    test("a session whose user was deleted is refused before any lookup", async () => {
      const bundle = await createAccessBundle("resolve-deleted-user");
      await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "passthrough" }
      });
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "never" });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "resolve-deleted-user" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };
      const resolve = () =>
        buildResolver().resolveSession({
          proxyId: proxy.id,
          orgId: seedData1.organization.id,
          sessionToken: session.token,
          hasSessionLogKey: false
        });

      const [doomed] = (await testDb("users")
        .insert({ username: `doomed-${crypto.randomUUID()}`, isAccepted: true })
        .returning("*")) as { id: string }[];
      await testDb("agent_vault_sessions").where({ id: session.id }).update({ userId: doomed.id });
      await testDb("users").where({ id: doomed.id }).del();

      const row = await testDb("agent_vault_sessions").where({ id: session.id }).first();
      expect(row.userId).toBeNull();
      expect(row.identityId).toBeNull();
      await expect(resolve()).rejects.toThrow("The identity this session belonged to has been deleted");
    });

    test("a session whose machine identity was deleted is refused before any lookup", async () => {
      const bundle = await createAccessBundle("resolve-deleted-identity");
      await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "passthrough" }
      });
      const mint = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundle.name], ttl: "never" });
      const { session } = JSON.parse(mint.payload) as { session: { id: string; token: string } };
      const proxyRes = await inject("POST", "/api/v1/agent-vault/proxies", { name: "resolve-deleted-identity" });
      const { proxy } = JSON.parse(proxyRes.payload) as { proxy: { id: string } };
      const resolve = () =>
        buildResolver().resolveSession({
          proxyId: proxy.id,
          orgId: seedData1.organization.id,
          sessionToken: session.token,
          hasSessionLogKey: false
        });

      const identityName = `doomed-${crypto.randomUUID()}`;
      const identity = await createOrgIdentity(identityName);
      await testDb("agent_vault_sessions")
        .where({ id: session.id })
        .update({ userId: null, identityId: identity.id, actorType: "machineIdentity", actorName: identityName });
      await deleteOrgIdentity(identity.id);

      await expect(resolve()).rejects.toThrow("The identity this session belonged to has been deleted");

      // The list agrees with resolve: an ownerless session is shown as revoked, not active.
      const list = await inject("GET", "/api/v1/agent-vault/sessions?scope=all&limit=100");
      const { sessions } = JSON.parse(list.payload) as {
        sessions: { id: string; status: string; actor: Record<string, unknown> }[];
      };
      const row = sessions.find((listed) => listed.id === session.id);
      expect(row?.status).toBe("revoked");
      expect(row?.actor).toEqual({ type: "machineIdentity", id: null, name: identityName });
    });

    test("an expired time-limited role stops resolving even though its membership row remains", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const bundle = await createAccessBundle("resolve-temporary-role");
      await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        type: "http",
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
        agentVaultServiceCustomHeaderDAL: agentVaultServiceCustomHeaderDALFactory(testDb),
        agentVaultServiceSubstitutionDAL: agentVaultServiceSubstitutionDALFactory(testDb),
        agentVaultVariableDAL: agentVaultVariableDALFactory(testDb),
        agentVaultPersonalValueDAL: agentVaultPersonalValueDALFactory(testDb),
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        projectDAL: projectDALFactory(testDb),
        userDAL: userDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never,
        agentVaultOauthService: {} as never
      });
      const resolve = () =>
        resolver.resolveSession({
          proxyId: proxy.id,
          orgId: seedData1.organization.id,
          sessionToken: session.token,
          hasSessionLogKey: false
        });

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

      expect((await resolve()).services).toHaveLength(1);
    });
  });

  describe("skills", async () => {
    const skillsUrl = "/api/v1/agent-vault/skills";
    const bundleSkillsUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/skills`;

    // Names are unique across the org's Agent Vault and every test here shares it.
    beforeEach(async () => {
      const project = await testDb("projects")
        .where({ orgId: seedData1.organization.id, type: ProjectType.AgentVault })
        .first();
      if (project) await testDb("agent_vault_skills").where({ projectId: project.id }).del();
    });

    type TSkill = { id: string; name: string; description: string; latestVersion: number };
    type TListedSkill = TSkill & { accessBundles: { id: string; name: string }[] };
    type TSkillVersion = { id: string; version: number; sha256: string; sizeBytes: number; fileCount: number };
    type TFile = { path: string; mode: string; contentBase64: string };

    const skillFiles = (name: string, body = "Do the thing.", extra: TFile[] = []): TFile[] => [
      {
        path: "SKILL.md",
        mode: "0644",
        contentBase64: Buffer.from(`---\nname: ${name}\ndescription: ${body}\n---\n${body}\n`).toString("base64")
      },
      ...extra
    ];

    const createSkill = async (name: string, body?: string) => {
      const res = await inject("POST", skillsUrl, { files: skillFiles(name, body) });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.payload) as { skill: TSkill; version: TSkillVersion };
    };

    const publish = (skillId: string, files: TFile[]) => inject("PATCH", `${skillsUrl}/${skillId}`, { files });

    const sessionSkillsUrl = "/api/v1/agent-vault/session/skills";

    const mintFor = async (bundles: { name: string }[], mintAs = inject) => {
      const mint = await mintAs("POST", "/api/v1/agent-vault/sessions", {
        accessBundles: bundles.map((bundle) => bundle.name),
        ttl: "1h"
      });
      expect(mint.statusCode).toBe(200);
      return (JSON.parse(mint.payload) as { session: { id: string; token: string } }).session;
    };

    type TCreateAuditLog = (dto: { actor: unknown; orgId?: string; event: unknown }) => Promise<void>;
    // The route's audit calls, recorded as they are made: the e2e plan has no audit log retention, so none
    // reach the audit_logs table.
    const recordAuditLogs = () => {
      const { auditLog } = (
        globalThis as unknown as { testServices: { auditLog: { createAuditLog: TCreateAuditLog } } }
      ).testServices;
      return vi.spyOn(auditLog, "createAuditLog");
    };

    const fetchSessionSkills = (authorization?: string) =>
      testServer.inject({
        method: "GET",
        url: sessionSkillsUrl,
        headers: authorization === undefined ? {} : { authorization }
      });

    test("an admin creates, reads, lists and deletes a skill", async () => {
      const { skill, version } = await createSkill("crud-skill", "Reviews code");
      expect(skill).toMatchObject({
        name: "crud-skill",
        description: "Reviews code",
        latestVersion: 1
      });
      expect(skill).not.toHaveProperty("bundleCount");
      expect(version).toMatchObject({ version: 1, fileCount: 1 });
      expect(version.sha256).toMatch(/^[0-9a-f]{64}$/);

      const list = await inject("GET", skillsUrl);
      expect(list.statusCode).toBe(200);
      expect(JSON.parse(list.payload)).toMatchObject({
        skills: [{ name: "crud-skill", accessBundles: [] }],
        totalCount: 1
      });

      const bundle = await createAccessBundle("skills-crud-bundle");
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id })).statusCode).toBe(200);

      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({
        accessBundles: [{ id: bundle.id, name: bundle.name }],
        files: skillFiles("crud-skill", "Reviews code")
      });

      const files = await inject("GET", `${skillsUrl}/${skill.id}/versions/1`);
      expect(files.statusCode).toBe(200);
      const { version: withFiles } = JSON.parse(files.payload) as { version: TSkillVersion & { files: TFile[] } };
      expect(withFiles.files).toEqual(skillFiles("crud-skill", "Reviews code"));
      expect(withFiles.sha256).toBe(crypto.createHash("sha256").update(JSON.stringify(withFiles.files)).digest("hex"));

      const removed = await inject("DELETE", `${skillsUrl}/${skill.id}`);
      expect(removed.statusCode).toBe(200);
      expect(JSON.parse(removed.payload).skill).toMatchObject({ id: skill.id, name: "crud-skill" });

      expect((await inject("GET", `${skillsUrl}/${skill.id}`)).statusCode).toBe(404);
      const bundleSkills = await inject("GET", bundleSkillsUrl(bundle.id));
      expect(JSON.parse(bundleSkills.payload).skills).toEqual([]);
    });

    test("a duplicate name is a 409", async () => {
      await createSkill("dup-skill");
      const again = await inject("POST", skillsUrl, { files: skillFiles("dup-skill") });
      expect(again.statusCode).toBe(409);
      expect(JSON.parse(again.payload).message).toBe("A skill named 'dup-skill' already exists.");
    });

    test("lists page, search and filter by exact name", async () => {
      await createSkill("list-alpha", "Reviews code");
      await createSkill("list-beta", "Writes docs");
      await createSkill("list-gamma", "Reviews tests");

      const page = await inject("GET", `${skillsUrl}?limit=2&offset=1`);
      expect(page.statusCode).toBe(200);
      const paged = JSON.parse(page.payload) as { skills: TSkill[]; totalCount: number };
      expect(paged.skills.map((row) => row.name)).toEqual(["list-beta", "list-gamma"]);
      expect(paged.totalCount).toBe(3);

      const searched = JSON.parse((await inject("GET", `${skillsUrl}?search=reviews`)).payload) as {
        skills: TSkill[];
        totalCount: number;
      };
      expect(searched.skills.map((row) => row.name)).toEqual(["list-alpha", "list-gamma"]);
      expect(searched.totalCount).toBe(2);

      const named = JSON.parse((await inject("GET", `${skillsUrl}?name=list-beta`)).payload) as {
        skills: TSkill[];
        totalCount: number;
      };
      expect(named).toMatchObject({ skills: [{ name: "list-beta" }], totalCount: 1 });

      const none = JSON.parse((await inject("GET", `${skillsUrl}?name=list`)).payload) as { totalCount: number };
      expect(none.totalCount).toBe(0);
    });

    test("the list names each skill's access bundles, ordered by name", async () => {
      const { skill: shared } = await createSkill("bundles-shared");
      const { skill: single } = await createSkill("bundles-single");
      await createSkill("bundles-unused");
      const zeta = await createAccessBundle("skills-list-zeta");
      const alpha = await createAccessBundle("skills-list-alpha");
      for (const [bundle, skill] of [
        [zeta, shared],
        [alpha, shared],
        [zeta, single]
      ] as const) {
        // eslint-disable-next-line no-await-in-loop
        expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id })).statusCode).toBe(200);
      }

      const list = await inject("GET", `${skillsUrl}?search=bundles-`);
      expect(list.statusCode).toBe(200);
      const { skills } = JSON.parse(list.payload) as { skills: TListedSkill[] };
      expect(skills.map(({ name, accessBundles }) => ({ name, accessBundles }))).toEqual([
        {
          name: "bundles-shared",
          accessBundles: [
            { id: alpha.id, name: alpha.name },
            { id: zeta.id, name: zeta.name }
          ]
        },
        { name: "bundles-single", accessBundles: [{ id: zeta.id, name: zeta.name }] },
        { name: "bundles-unused", accessBundles: [] }
      ]);
    });

    test("a member reads only the latest version of skills on bundles it holds, and is refused every write", async () => {
      const { skill } = await createSkill("member-reader");
      expect((await publish(skill.id, skillFiles("member-reader", "Second."))).statusCode).toBe(200);
      const { skill: hidden } = await createSkill("member-hidden");
      await createSkill("member-no-bundle");
      const granted = await createAccessBundle("skills-member-granted");
      const other = await createAccessBundle("skills-member-other");
      for (const [bundle, bundleSkill] of [
        [granted, skill],
        [other, skill],
        [other, hidden]
      ] as const) {
        // eslint-disable-next-line no-await-in-loop
        expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: bundleSkill.id })).statusCode).toBe(200);
      }
      const member = await createMemberIdentity("skills-member");
      try {
        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${granted.id}/members`, {
              machineIdentityIds: [member.id]
            })
          ).statusCode
        ).toBe(200);

        const calls: [string, "GET" | "POST" | "PATCH" | "DELETE", string, number, Record<string, unknown>?][] = [
          ["list", "GET", skillsUrl, 200],
          ["get", "GET", `${skillsUrl}/${skill.id}`, 200],
          ["get unreachable", "GET", `${skillsUrl}/${hidden.id}`, 404],
          ["list versions", "GET", `${skillsUrl}/${skill.id}/versions`, 403],
          ["get latest version", "GET", `${skillsUrl}/${skill.id}/versions/2`, 200],
          ["get old version", "GET", `${skillsUrl}/${skill.id}/versions/1`, 404],
          ["get unreachable version", "GET", `${skillsUrl}/${hidden.id}/versions/1`, 404],
          ["bundle skills", "GET", bundleSkillsUrl(granted.id), 200],
          ["unreachable bundle skills", "GET", bundleSkillsUrl(other.id), 404],
          ["create", "POST", skillsUrl, 403, { files: skillFiles("member-made") }],
          ["delete", "DELETE", `${skillsUrl}/${skill.id}`, 403],
          ["update", "PATCH", `${skillsUrl}/${skill.id}`, 403, { files: skillFiles("member-reader", "x") }],
          ["restore", "POST", `${skillsUrl}/${skill.id}/versions/1/restore`, 403],
          ["add", "POST", bundleSkillsUrl(granted.id), 403, { skillId: skill.id }],
          ["remove", "DELETE", `${bundleSkillsUrl(granted.id)}/${skill.id}`, 403]
        ];
        const statuses = await Promise.all(
          calls.map(async ([label, method, url, , body]) => [label, (await member.as(method, url, body)).statusCode])
        );
        expect(statuses).toEqual(calls.map(([label, , , status]) => [label, status]));

        const listed = JSON.parse((await member.as("GET", skillsUrl)).payload) as {
          skills: TListedSkill[];
          totalCount: number;
        };
        expect(listed).toMatchObject({
          skills: [{ id: skill.id, accessBundles: [{ id: granted.id, name: granted.name }] }],
          totalCount: 1
        });
        expect(listed.skills).toHaveLength(1);
        expect(listed.skills[0].accessBundles).toHaveLength(1);

        const detail = JSON.parse((await member.as("GET", `${skillsUrl}/${skill.id}`)).payload) as {
          skill: TListedSkill & { files: TFile[] };
        };
        expect(detail.skill.accessBundles).toEqual([{ id: granted.id, name: granted.name }]);
        expect(detail.skill).toMatchObject({ latestVersion: 2, files: skillFiles("member-reader", "Second.") });

        const unreachable = await member.as("GET", bundleSkillsUrl(other.id));
        expect(JSON.parse(unreachable.payload).message).toBe(`Access bundle with ID '${other.id}' not found`);

        const files = JSON.parse((await member.as("GET", `${skillsUrl}/${skill.id}/versions/2`)).payload) as {
          version: { files: TFile[] };
        };
        expect(files.version.files).toEqual(skillFiles("member-reader", "Second."));
      } finally {
        await member.cleanup();
      }
    });

    test("file paths and header values are refused with a message naming the file or field", async () => {
      const refused = async (files: TFile[]) => {
        const res = await inject("POST", skillsUrl, { files });
        expect(res.statusCode).toBe(400);
        return JSON.parse(res.payload).message as string;
      };
      const extra = (path: string): TFile => ({ path, mode: "0644", contentBase64: "" });

      expect(await refused(skillFiles("p", "x", [extra("docs"), extra("docs/a.md")]))).toBe(
        "'docs' is a file, but 'docs/a.md' puts it inside a folder of the same name. Rename one of them."
      );
      expect(await refused(skillFiles("p", "x", [extra("SKILL.md/x")]))).toMatch(/^'SKILL.md' is a file/);
      expect(await refused(skillFiles("p", "x", [extra("Notes.md"), extra("notes.md")]))).toBe(
        "Files 'Notes.md' and 'notes.md' would be the same file on disk. File paths must be unique ignoring case."
      );
      expect(await refused(skillFiles("p", "x", [extra("caf\u00e9.md"), extra("cafe\u0301.md")]))).toMatch(
        /would be the same file on disk/
      );
      expect(await refused(skillFiles("p", "x", [extra("a?.md")]))).toMatch(
        /^File path 'a\?\.md' can't contain any of/
      );
      expect(await refused(skillFiles("p", "x", [extra("docs./a.md")]))).toMatch(/part ending in a dot or a space/);
      expect(await refused(skillFiles("p", "x", [extra("aux.md")]))).toMatch(/which is a reserved name/);

      const numeric = await refused([
        {
          path: "SKILL.md",
          mode: "0644",
          contentBase64: Buffer.from("---\nname: 12\ndescription: d\n---\n").toString("base64")
        }
      ]);
      expect(numeric).toBe("The 'name' in SKILL.md must be text. Put it in quotes.");
      expect(await refused(skillFiles("code--review"))).toBe(
        "The 'name' in SKILL.md is 'code--review'. A skill name can only use lowercase letters, numbers and single hyphens, and can't start or end with a hyphen."
      );
    });

    test("a single file over 1 MB gets the 400 that names it, not a body or schema error", async () => {
      const res = await inject("POST", skillsUrl, {
        files: skillFiles("big-file", "x", [
          {
            path: "data/big.bin",
            mode: "0644",
            contentBase64: Buffer.alloc(Math.round(1.05 * 1024 * 1024)).toString("base64")
          }
        ])
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toBe("File 'data/big.bin' is larger than 256 KB.");
    });

    test("the limits are refused with a message naming the problem", async () => {
      const missing = await inject("POST", skillsUrl, {
        files: [{ path: "README.md", mode: "0644", contentBase64: Buffer.from("hi").toString("base64") }]
      });
      expect(missing.statusCode).toBe(400);
      expect(JSON.parse(missing.payload).message).toBe("SKILL.md is missing.");

      const oversize = await inject("POST", skillsUrl, {
        files: skillFiles("too-big", "x", [
          { path: "scripts/x.sh", mode: "0755", contentBase64: Buffer.alloc(256 * 1024 + 1).toString("base64") }
        ])
      });
      expect(oversize.statusCode).toBe(400);
      expect(JSON.parse(oversize.payload).message).toBe("File 'scripts/x.sh' is larger than 256 KB.");

      const traversal = await inject("POST", skillsUrl, {
        files: skillFiles("escape", "x", [{ path: "../evil.sh", mode: "0755", contentBase64: "" }])
      });
      expect(traversal.statusCode).toBe(400);

      const badYaml = await inject("POST", skillsUrl, {
        files: [
          {
            path: "SKILL.md",
            mode: "0644",
            contentBase64: Buffer.from("---\nname: [oops\n---\n").toString("base64")
          }
        ]
      });
      expect(badYaml.statusCode).toBe(400);
      expect(JSON.parse(badYaml.payload).message).toBe(
        "Line 2 of SKILL.md: the 'name' value opens a '[' that never closes."
      );

      const unquotedColon = await inject("POST", skillsUrl, {
        files: [
          {
            path: "SKILL.md",
            mode: "0644",
            contentBase64: Buffer.from("---\nname: colon\ndescription: Review: then fix\n---\n").toString("base64")
          }
        ]
      });
      expect(unquotedColon.statusCode).toBe(400);
      expect(JSON.parse(unquotedColon.payload).message).toBe(
        "Line 3 of SKILL.md: the 'description' value contains ': '. Put the value in double quotes."
      );

      const controlCharacter = await inject("POST", skillsUrl, {
        files: [
          {
            path: "SKILL.md",
            mode: "0644",
            contentBase64: Buffer.from('---\nname: ctrl\ndescription: "x\\0y"\n---\n').toString("base64")
          }
        ]
      });
      expect(controlCharacter.statusCode).toBe(400);
      expect(JSON.parse(controlCharacter.payload).message).toBe(
        "The 'description' in SKILL.md contains a control character."
      );
    });

    test("getting a skill returns its latest files and records a version view, and the old publish route is gone", async () => {
      const { skill } = await createSkill("latest-files-skill", "First.");
      const second = skillFiles("latest-files-skill", "Second.", [
        { path: "scripts/run.sh", mode: "0755", contentBase64: Buffer.from("echo hi\n").toString("base64") }
      ]);
      expect((await publish(skill.id, second)).statusCode).toBe(200);

      const auditLogs = recordAuditLogs();
      try {
        const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
        expect(detail.statusCode).toBe(200);
        const { skill: got } = JSON.parse(detail.payload) as { skill: TListedSkill & { files: TFile[] } };
        expect(got).toMatchObject({ latestVersion: 2, description: "Second." });
        expect(got.files).toEqual(second);
        expect(auditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            event: {
              type: "agent-vault-skill-version-view",
              metadata: { skillId: skill.id, skillName: "latest-files-skill", version: 2 }
            }
          })
        );
      } finally {
        auditLogs.mockRestore();
      }

      const listed = JSON.parse((await inject("GET", skillsUrl)).payload) as { skills: Record<string, unknown>[] };
      expect(listed.skills[0]).not.toHaveProperty("files");

      expect((await inject("POST", `${skillsUrl}/${skill.id}/versions`, { files: second })).statusCode).toBe(404);
    });

    test("updating with the same content is a no-op, and a new name in SKILL.md renames the skill", async () => {
      const { skill, version } = await createSkill("publish-skill");

      const same = await publish(skill.id, skillFiles("publish-skill"));
      expect(same.statusCode).toBe(200);
      expect(JSON.parse(same.payload)).toMatchObject({
        unchanged: true,
        version: { version: 1, sha256: version.sha256 }
      });

      const changed = await publish(skill.id, skillFiles("publish-skill", "Now different."));
      expect(changed.statusCode).toBe(200);
      expect(JSON.parse(changed.payload)).toMatchObject({ unchanged: false, version: { version: 2 } });

      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({ latestVersion: 2, description: "Now different." });

      const renamed = await publish(skill.id, skillFiles("publish-renamed", "Now different."));
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload)).toMatchObject({ unchanged: false, version: { version: 3 } });
      const afterRename = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(afterRename.payload).skill).toMatchObject({ name: "publish-renamed", latestVersion: 3 });

      await createSkill("publish-taken");
      const taken = await publish(skill.id, skillFiles("publish-taken"));
      expect(taken.statusCode).toBe(409);
      expect(JSON.parse(taken.payload).message).toBe("A skill named 'publish-taken' already exists.");
      const unchanged = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(unchanged.payload).skill).toMatchObject({ name: "publish-renamed", latestVersion: 3 });

      // A rollback past the rename keeps the current name, in the skill row and in the restored SKILL.md.
      const restored = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(restored.statusCode).toBe(200);
      expect(JSON.parse(restored.payload)).toMatchObject({ unchanged: false, version: { version: 4 } });
      const afterRestore = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(afterRestore.payload).skill).toMatchObject({
        name: "publish-renamed",
        description: "Do the thing.",
        latestVersion: 4
      });
      const files = JSON.parse((await inject("GET", `${skillsUrl}/${skill.id}/versions/4`)).payload) as {
        version: { files: TFile[] };
      };
      expect(files.version.files).toEqual(skillFiles("publish-renamed"));
    });

    test("restore copies an old version forward as a new one", async () => {
      const { skill, version: first } = await createSkill("restore-skill", "First.");
      expect((await publish(skill.id, skillFiles("restore-skill", "Second."))).statusCode).toBe(200);

      const restored = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(restored.statusCode).toBe(200);
      expect(JSON.parse(restored.payload).version).toMatchObject({ version: 3, sha256: first.sha256 });

      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({ latestVersion: 3, description: "First." });

      expect((await inject("POST", `${skillsUrl}/${skill.id}/versions/99/restore`)).statusCode).toBe(404);
    });

    test("restoring a version with the latest version's files publishes nothing", async () => {
      const { skill } = await createSkill("restore-same-skill", "First.");
      expect((await publish(skill.id, skillFiles("restore-same-skill", "Second."))).statusCode).toBe(200);
      expect((await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`)).statusCode).toBe(200);

      const again = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(again.statusCode).toBe(200);
      expect(JSON.parse(again.payload)).toMatchObject({ unchanged: true, version: { version: 3 } });

      const fresh = await inject("POST", `${skillsUrl}/${skill.id}/versions/2/restore`);
      expect(JSON.parse(fresh.payload)).toMatchObject({ unchanged: false, version: { version: 4 } });
    });

    test("restoring a version whose SKILL.md no longer parses keeps the current description", async () => {
      const { skill } = await createSkill("legacy-skill", "Old.");
      expect((await publish(skill.id, skillFiles("legacy-skill", "Current."))).statusCode).toBe(200);

      // The API refuses a SKILL.md that does not parse, so a version saved under older header rules can only be
      // stood in for by sealing one directly over version 1.
      const files = skillFiles("legacy-skill", "d".repeat(1100));
      const serialized = Buffer.from(JSON.stringify(files));
      const { encryptor } = await projectCipher(
        (await testDb("agent_vault_skills").where({ id: skill.id }).first()).projectId
      );
      await testDb("agent_vault_skill_versions")
        .where({ skillId: skill.id, version: 1 })
        .update({
          encryptedFiles: encryptor({ plainText: serialized }).cipherTextBlob,
          sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
          sizeBytes: Buffer.from(files[0].contentBase64, "base64").length
        });

      const restored = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(restored.statusCode).toBe(200);
      expect(JSON.parse(restored.payload)).toMatchObject({ unchanged: false, version: { version: 3 } });

      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({ latestVersion: 3, description: "Current." });
    });

    test("restoring a version whose name line can't be rewritten to the current name is a 400", async () => {
      const { skill } = await createSkill("block-old");
      expect((await publish(skill.id, skillFiles("block-new"))).statusCode).toBe(200);

      // The API now refuses a name it could not rewrite, so a version saved before that rule can only be stood in
      // for by sealing one directly over version 1.
      const files = skillFiles("block-old");
      files[0].contentBase64 = Buffer.from(
        "---\nname: >-\n  block-old\ndescription: Do the thing.\n---\nDo the thing.\n"
      ).toString("base64");
      const serialized = Buffer.from(JSON.stringify(files));
      const { encryptor } = await projectCipher(
        (await testDb("agent_vault_skills").where({ id: skill.id }).first()).projectId
      );
      await testDb("agent_vault_skill_versions")
        .where({ skillId: skill.id, version: 1 })
        .update({
          encryptedFiles: encryptor({ plainText: serialized }).cipherTextBlob,
          sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
          sizeBytes: Buffer.from(files[0].contentBase64, "base64").length
        });

      const restored = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(restored.statusCode).toBe(400);
      expect(JSON.parse(restored.payload).message).toBe(
        "Version 1 of skill 'block-new' names 'block-old' in SKILL.md, and its 'name' line could not be changed to 'block-new'. Publish a new version instead."
      );
      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({ name: "block-new", latestVersion: 2 });
    });

    test("a restore that meets a rename made after it read the name is a 409, not a rename back", async () => {
      const { skill } = await createSkill("race-skill", "First.");
      expect((await publish(skill.id, skillFiles("race-skill", "Second."))).statusCode).toBe(200);

      // Holding the skill row queues the restore on it after it has read the name. The rename is written under the
      // same hold, standing in for a publish that renames, which would otherwise queue on the row too.
      const trx = await testDb.transaction();
      let restore: ReturnType<typeof inject> | undefined;
      try {
        const { rows } = await trx.raw("select pg_backend_pid() as pid");
        await trx("agent_vault_skills").where({ id: skill.id }).forUpdate().first();

        restore = inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
        await waitUntilBlockedBy(rows[0].pid);
        await trx("agent_vault_skills").where({ id: skill.id }).update({ name: "race-renamed" });
        await trx.commit();

        const res = await restore;
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.payload).message).toBe(
          "Skill 'race-skill' was renamed to 'race-renamed' while this version was being restored. Try again."
        );
      } catch (err) {
        if (!trx.isCompleted()) await trx.rollback();
        await restore?.catch(() => undefined);
        throw err;
      }

      const detail = await inject("GET", `${skillsUrl}/${skill.id}`);
      expect(JSON.parse(detail.payload).skill).toMatchObject({ name: "race-renamed", latestVersion: 2 });
    });

    test("a skill with more than 50 files is refused with a message saying so", async () => {
      const extra = Array.from({ length: 50 }, (_, i) => ({
        path: `docs/${i}.md`,
        mode: "0644",
        contentBase64: ""
      }));
      const res = await inject("POST", skillsUrl, { files: skillFiles("too-many-files", "x", extra) });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toBe("A skill can have at most 50 files.");
    });

    test("only the newest 20 versions are kept", async () => {
      const { skill } = await createSkill("prune-skill", "v1");
      for (let i = 2; i <= 21; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect((await publish(skill.id, skillFiles("prune-skill", `v${i}`))).statusCode).toBe(200);
      }

      const list = await inject("GET", `${skillsUrl}/${skill.id}/versions`);
      const { versions } = JSON.parse(list.payload) as { versions: TSkillVersion[] };
      expect(versions).toHaveLength(20);
      expect(versions[0].version).toBe(21);
      expect(versions[19].version).toBe(2);
      expect((await inject("GET", `${skillsUrl}/${skill.id}/versions/1`)).statusCode).toBe(404);
    });

    test("add and remove, and a second add is a 409", async () => {
      const { skill } = await createSkill("add-skill");
      const bundle = await createAccessBundle("skills-add-bundle");

      const added = await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id });
      expect(added.statusCode).toBe(200);
      expect(JSON.parse(added.payload).skill).toMatchObject({
        id: skill.id,
        name: "add-skill",
        latestVersion: 1
      });

      const again = await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id });
      expect(again.statusCode).toBe(409);
      expect(JSON.parse(again.payload).message).toBe(
        "The skill 'add-skill' is already in the access bundle 'skills-add-bundle'."
      );

      const listed = await inject("GET", bundleSkillsUrl(bundle.id));
      expect((JSON.parse(listed.payload) as { skills: TSkill[] }).skills.map((row) => row.id)).toEqual([skill.id]);

      expect((await inject("DELETE", `${bundleSkillsUrl(bundle.id)}/${skill.id}`)).statusCode).toBe(200);
      const missing = await inject("DELETE", `${bundleSkillsUrl(bundle.id)}/${skill.id}`);
      expect(missing.statusCode).toBe(404);
      expect(JSON.parse(missing.payload).message).toBe(
        "The skill 'add-skill' isn't in the access bundle 'skills-add-bundle'."
      );
    });

    test("an access bundle holds at most 25 skills", async () => {
      const bundle = await createAccessBundle("skills-cap-bundle");
      const created = await Promise.all(
        Array.from({ length: 26 }, (_, i) => createSkill(`cap-skill-${String(i).padStart(2, "0")}`))
      );
      for (const { skill } of created.slice(0, 25)) {
        // eslint-disable-next-line no-await-in-loop
        expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id })).statusCode).toBe(200);
      }

      const over = await inject("POST", bundleSkillsUrl(bundle.id), { skillId: created[25].skill.id });
      expect(over.statusCode).toBe(400);
      expect(JSON.parse(over.payload).message).toBe(
        "This access bundle already has 25 skills, the maximum. Remove one to add another."
      );

      const other = await createAccessBundle("skills-cap-other-bundle");
      expect((await inject("POST", bundleSkillsUrl(other.id), { skillId: created[25].skill.id })).statusCode).toBe(200);

      expect((await inject("DELETE", `${bundleSkillsUrl(bundle.id)}/${created[0].skill.id}`)).statusCode).toBe(200);
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: created[25].skill.id })).statusCode).toBe(
        200
      );
    });

    test("a session token gets every skill of the session's bundles in one call, and nothing from other bundles", async () => {
      const bundle = await createAccessBundle("skills-deliver-bundle");
      const otherBundle = await createAccessBundle("skills-deliver-other");
      const session = await mintFor([bundle]);
      const asSession = () => fetchSessionSkills(`Bearer ${session.token}`);

      const emptyAuditLogs = recordAuditLogs();
      try {
        const empty = await asSession();
        expect(empty.statusCode).toBe(200);
        expect(JSON.parse(empty.payload)).toEqual({ skills: [] });
        expect(emptyAuditLogs).not.toHaveBeenCalled();
      } finally {
        emptyAuditLogs.mockRestore();
      }

      const { skill: zeta, version: zetaV1 } = await createSkill("zeta-skill");
      const { skill: alpha } = await createSkill("alpha-skill");
      const { skill: foreign } = await createSkill("foreign-skill");
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: zeta.id })).statusCode).toBe(200);
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: alpha.id })).statusCode).toBe(200);
      expect((await inject("POST", bundleSkillsUrl(otherBundle.id), { skillId: foreign.id })).statusCode).toBe(200);
      const republished = await publish(
        alpha.id,
        skillFiles("alpha-skill", "Second.", [
          { path: "scripts/run.sh", mode: "0755", contentBase64: Buffer.from("echo hi\n").toString("base64") }
        ])
      );
      const { version: alphaV2 } = JSON.parse(republished.payload) as { version: TSkillVersion };

      const auditLogs = recordAuditLogs();
      let delivered: Awaited<ReturnType<typeof asSession>>;
      try {
        delivered = await asSession();
        expect(auditLogs).toHaveBeenCalledTimes(1);
        expect(auditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            orgId: seedData1.organization.id,
            actor: expect.objectContaining({
              type: ActorType.USER,
              metadata: expect.objectContaining({ userId: seedData1.id })
            }),
            event: {
              type: "agent-vault-skills-delivered",
              metadata: {
                sessionId: session.id,
                accessBundleId: bundle.id,
                accessBundleName: bundle.name,
                skills: [
                  { skillId: alpha.id, skillName: "alpha-skill", version: 2, sha256: alphaV2.sha256 },
                  { skillId: zeta.id, skillName: "zeta-skill", version: 1, sha256: zetaV1.sha256 }
                ]
              }
            }
          })
        );
      } finally {
        auditLogs.mockRestore();
      }
      expect(delivered.statusCode).toBe(200);
      const { skills } = JSON.parse(delivered.payload) as {
        skills: { id: string; name: string; version: number; sha256: string; files: TFile[] }[];
      };
      expect(skills.map((row) => row.name)).toEqual(["alpha-skill", "zeta-skill"]);
      expect(skills[0]).toEqual({
        id: alpha.id,
        name: "alpha-skill",
        version: 2,
        sha256: alphaV2.sha256,
        files: [
          ...skillFiles("alpha-skill", "Second."),
          { path: "scripts/run.sh", mode: "0755", contentBase64: Buffer.from("echo hi\n").toString("base64") }
        ]
      });
      expect(skills[0].sha256).toBe(crypto.createHash("sha256").update(JSON.stringify(skills[0].files)).digest("hex"));
      expect(skills.some((row) => row.id === foreign.id)).toBe(false);

      expect((await inject("DELETE", `${bundleSkillsUrl(bundle.id)}/${alpha.id}`)).statusCode).toBe(200);
      const afterRemove = JSON.parse((await asSession()).payload) as { skills: { id: string }[] };
      expect(afterRemove.skills.map((row) => row.id)).toEqual([zeta.id]);

      const revoked = await inject("POST", `/api/v1/agent-vault/sessions/${session.id}/revoke`);
      expect(revoked.statusCode).toBe(200);
      const afterRevoke = await asSession();
      expect(afterRevoke.statusCode).toBe(401);
      expect(JSON.parse(afterRevoke.payload).message).toBe("This session has been revoked");
    });

    test("the skills route refuses an expired, unknown or malformed session token with a 401", async () => {
      const bundle = await createAccessBundle("skills-refused-bundle");
      const session = await mintFor([bundle]);
      await testDb("agent_vault_sessions")
        .where({ id: session.id })
        .update({ expiresAt: new Date(Date.now() - 1000) });
      const expired = await fetchSessionSkills(`Bearer ${session.token}`);
      expect(expired.statusCode).toBe(401);
      expect(JSON.parse(expired.payload).message).toBe("This session has expired");

      const unknown = await fetchSessionSkills(`Bearer agv_${crypto.randomBytes(32).toString("base64url")}`);
      expect(unknown.statusCode).toBe(401);
      expect(JSON.parse(unknown.payload).message).toBe("This Agent Vault session token is not valid");

      const malformedMessage = "Send an Agent Vault session token in the Authorization header, as 'Bearer agv_...'.";
      const refused = await Promise.all(
        [
          undefined,
          "",
          session.token,
          `Basic ${session.token}`,
          `Bearer ${jwtAuthToken}`,
          "Bearer agv_",
          `Bearer agv_${"a".repeat(200)}`
        ].map((authorization) => fetchSessionSkills(authorization))
      );
      refused.forEach((res) => {
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.payload).message).toBe(malformedMessage);
      });
    });

    test("a member's session gets only the skills its owner still reaches", async () => {
      const bundle = await createAccessBundle("skills-lost-grant-bundle");
      const otherBundle = await createAccessBundle("skills-lost-grant-other");
      const { skill } = await createSkill("lost-grant-skill");
      const { skill: unreachable } = await createSkill("unreachable-skill");
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id })).statusCode).toBe(200);
      expect((await inject("POST", bundleSkillsUrl(otherBundle.id), { skillId: unreachable.id })).statusCode).toBe(200);
      const member = await createMemberIdentity("skills-lost-grant");
      try {
        const bundleMembersUrl = `/api/v1/agent-vault/access-bundles/${bundle.id}/members`;
        expect((await inject("POST", bundleMembersUrl, { machineIdentityIds: [member.id] })).statusCode).toBe(200);
        const session = await mintFor([bundle], member.as);
        const asSession = () => fetchSessionSkills(`Bearer ${session.token}`);

        const auditLogs = recordAuditLogs();
        let before: Awaited<ReturnType<typeof asSession>>;
        try {
          before = await asSession();
          expect(auditLogs).toHaveBeenCalledWith(
            expect.objectContaining({
              actor: expect.objectContaining({
                type: ActorType.IDENTITY,
                metadata: expect.objectContaining({ identityId: member.id, name: "skills-lost-grant" })
              })
            })
          );
        } finally {
          auditLogs.mockRestore();
        }
        expect(before.statusCode).toBe(200);
        expect((JSON.parse(before.payload) as { skills: { id: string }[] }).skills.map((row) => row.id)).toEqual([
          skill.id
        ]);

        expect((await inject("DELETE", bundleMembersUrl, { machineIdentityIds: [member.id] })).statusCode).toBe(200);

        const after = await asSession();
        expect(after.statusCode).toBe(200);
        expect(JSON.parse(after.payload)).toEqual({ skills: [] });
      } finally {
        await member.cleanup();
      }
    });
    test("Agent Vault holds at most 250 skills", async () => {
      const projectId = await getProjectId();
      // Seeded directly: 250 creates through the API would be slow, and the cap counts skill rows only.
      await testDb("agent_vault_skills").insert(
        Array.from({ length: AGENT_VAULT_MAX_SKILLS }, (_, i) => ({
          projectId,
          name: `seeded-skill-${String(i).padStart(3, "0")}`,
          description: "Seeded."
        }))
      );
      try {
        const over = await inject("POST", skillsUrl, { files: skillFiles("over-cap-skill") });
        expect(over.statusCode).toBe(400);
        expect(JSON.parse(over.payload).message).toBe(
          "This organization already has 250 skills, the most allowed. Delete an unused one first."
        );
        expect(await testDb("agent_vault_skills").where({ projectId, name: "over-cap-skill" })).toHaveLength(0);

        await testDb("agent_vault_skills").where({ projectId, name: "seeded-skill-000" }).del();
        await createSkill("over-cap-skill");
      } finally {
        await testDb("agent_vault_skills").where({ projectId }).del();
      }
    });

    test("publish and restore reply with the skill as it now stands", async () => {
      const { skill } = await createSkill("summary-skill");

      const renamed = await publish(skill.id, skillFiles("summary-renamed", "Renamed."));
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload)).toMatchObject({
        unchanged: false,
        skill: { id: skill.id, name: "summary-renamed", description: "Renamed.", latestVersion: 2 },
        version: { version: 2 }
      });

      const restored = await inject("POST", `${skillsUrl}/${skill.id}/versions/1/restore`);
      expect(restored.statusCode).toBe(200);
      expect(JSON.parse(restored.payload)).toMatchObject({
        unchanged: false,
        skill: { id: skill.id, name: "summary-renamed", description: "Do the thing.", latestVersion: 3 },
        version: { version: 3 }
      });
    });

    test("an update with a stale baseVersion is refused, and one with the latest or none goes through", async () => {
      const { skill } = await createSkill("base-version-skill");
      const skillUrl = `${skillsUrl}/${skill.id}`;
      expect((await publish(skill.id, skillFiles("base-version-skill", "Second."))).statusCode).toBe(200);

      const stale = await inject("PATCH", skillUrl, {
        files: skillFiles("base-version-skill", "Stale."),
        baseVersion: 1
      });
      expect(stale.statusCode).toBe(409);
      expect(JSON.parse(stale.payload).message).toBe(
        "Version 2 was published after you opened this skill. Review it, then save again."
      );
      expect(await testDb("agent_vault_skill_versions").where({ skillId: skill.id })).toHaveLength(2);

      const current = await inject("PATCH", skillUrl, {
        files: skillFiles("base-version-skill", "Third."),
        baseVersion: 2
      });
      expect(current.statusCode).toBe(200);
      expect(JSON.parse(current.payload)).toMatchObject({ unchanged: false, version: { version: 3 } });

      const omitted = await publish(skill.id, skillFiles("base-version-skill", "Fourth."));
      expect(omitted.statusCode).toBe(200);
      expect(JSON.parse(omitted.payload)).toMatchObject({ unchanged: false, version: { version: 4 } });
    });

    test("the Skills Delivered event is sent only when a session gets at least one skill", async () => {
      const { telemetry } = (
        globalThis as unknown as {
          testServices: { telemetry: { sendPostHogEvents: (event: unknown) => Promise<void> } };
        }
      ).testServices;
      const emptyBundle = await createAccessBundle("skills-event-empty-bundle");
      const bundle = await createAccessBundle("skills-event-bundle");
      const { skill } = await createSkill("event-skill");
      expect((await inject("POST", bundleSkillsUrl(bundle.id), { skillId: skill.id })).statusCode).toBe(200);
      const emptySession = await mintFor([emptyBundle]);
      const session = await mintFor([bundle]);

      const isSkillsDelivered = (call: unknown[]) =>
        (call[0] as { event: string }).event === PostHogEventTypes.AgentVaultSkillsDelivered;
      const sent = vi.spyOn(telemetry, "sendPostHogEvents").mockResolvedValue(undefined);
      try {
        const empty = await fetchSessionSkills(`Bearer ${emptySession.token}`);
        expect(empty.statusCode).toBe(200);
        expect(JSON.parse(empty.payload)).toEqual({ skills: [] });
        expect(sent.mock.calls.filter(isSkillsDelivered)).toHaveLength(0);

        const delivered = await fetchSessionSkills(`Bearer ${session.token}`);
        expect(delivered.statusCode).toBe(200);
        const events = sent.mock.calls.filter(isSkillsDelivered);
        expect(events).toHaveLength(1);
        expect(events[0][0]).toMatchObject({
          distinctId: `agent-vault-session-${session.id}`,
          organizationId: seedData1.organization.id,
          properties: { orgId: seedData1.organization.id, actorType: ActorType.USER, skillCount: 1 }
        });
      } finally {
        sent.mockRestore();
      }
    });
  });

  describe("proxies", async () => {
    test("an org can hold AGENT_VAULT_MAX_PROXIES_PER_ORG proxies, and the next create is refused", async () => {
      for (let i = 0; i < AGENT_VAULT_MAX_PROXIES_PER_ORG; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect((await inject("POST", "/api/v1/agent-vault/proxies", { name: `cap-${i}` })).statusCode).toBe(200);
      }

      const refused = await inject("POST", "/api/v1/agent-vault/proxies", { name: "cap-over" });
      expect(refused.statusCode).toBe(400);
      expect(JSON.parse(refused.payload).message).toContain(`up to ${AGENT_VAULT_MAX_PROXIES_PER_ORG} proxies`);
    });

    test("a create that omits the settings gets the documented defaults", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: "settings-defaults" });
      expect(created.statusCode).toBe(200);
      const { proxy } = JSON.parse(created.payload) as {
        proxy: { trafficPolicy: string; allowedHosts: string | null; pollInterval: number };
      };
      expect(proxy.trafficPolicy).toBe("any-host");
      expect(proxy.allowedHosts).toBeNull();
      expect(proxy.pollInterval).toBe(60);
    });

    test("create and rotate both hand back the proxy token at the top level", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: "flat-token-shape" });
      expect(created.statusCode).toBe(200);
      const body = JSON.parse(created.payload) as { proxy: { id: string }; proxyToken: string };
      expect(body.proxyToken).toBeTruthy();

      const rotated = await inject("POST", `/api/v1/agent-vault/proxies/${body.proxy.id}/token-auth/proxy-token`);
      expect(rotated.statusCode).toBe(200);
      const again = JSON.parse(rotated.payload) as { proxyToken: string };
      expect(again.proxyToken).toBeTruthy();
      expect(again.proxyToken).not.toBe(body.proxyToken);
    });

    test("revoking access bumps the token version and clears the heartbeat", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: "revoke-bumps-version" });
      expect(created.statusCode).toBe(200);
      const { proxy } = JSON.parse(created.payload) as { proxy: { id: string } };
      expect((await testDb("agent_vault_proxies").where({ id: proxy.id }).first()).tokenVersion).toBe(1);

      const revoked = await inject("POST", `/api/v1/agent-vault/proxies/${proxy.id}/revoke`);
      expect(revoked.statusCode).toBe(200);

      const row = await testDb("agent_vault_proxies").where({ id: proxy.id }).first();
      expect(row.tokenVersion).toBe(2);
      expect(row.heartbeat).toBeNull();
      expect(row.heartbeatTTL).toBeNull();
    });

    test("lowering the poll interval does not report a live proxy as unreachable", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", {
        name: "poll-interval-health",
        pollInterval: 60
      });
      expect(created.statusCode).toBe(200);
      const { proxy } = JSON.parse(created.payload) as { proxy: { id: string } };

      const isHealthy = async () => {
        const list = await inject("GET", "/api/v1/agent-vault/proxies");
        const found = (JSON.parse(list.payload) as { proxies: { id: string; isHealthy: boolean }[] }).proxies.find(
          (p) => p.id === proxy.id
        );
        return found?.isHealthy;
      };

      // A check-in 40s ago on a 60s interval: inside 60 x 3, and the proxy is still on that schedule.
      await testDb("agent_vault_proxies")
        .where({ id: proxy.id })
        .update({ heartbeat: new Date(Date.now() - 40_000), heartbeatTTL: 60 });
      expect(await isHealthy()).toBe(true);

      // Dropping to 10 would make 40s look like four missed check-ins, but the proxy has not been told
      // yet: it learns the new interval on its next poll, which is still 60s out from the last one.
      const patched = await inject("PATCH", `/api/v1/agent-vault/proxies/${proxy.id}`, { pollInterval: 10 });
      expect(patched.statusCode).toBe(200);
      expect(await isHealthy()).toBe(true);

      // Once it checks in, both sides are on 10 and the tighter window applies.
      await testDb("agent_vault_proxies")
        .where({ id: proxy.id })
        .update({ heartbeat: new Date(Date.now() - 40_000), heartbeatTTL: 10 });
      expect(await isHealthy()).toBe(false);
    });
  });

  describe("proxy tokens and Infisical-held CAs", async () => {
    type TRootCa = { certificate: string; privateKey: string };

    const fingerprintOf = (pem: string) => {
      const digest = crypto
        .createHash("sha256")
        .update(Buffer.from(new x509.X509Certificate(pem).rawData))
        .digest("hex")
        .toUpperCase();
      return `SHA256:${digest.match(/.{2}/g)!.join(":")}`;
    };

    const caPem = async ({
      isCa = true,
      rsa = false,
      notBefore = new Date(Date.now() - 60_000)
    }: { isCa?: boolean; rsa?: boolean; notBefore?: Date } = {}) => {
      const algorithm = rsa
        ? { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }
        : { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
      const keys = await globalThis.crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
      const certificate = await x509.X509CertificateGenerator.createSelfSigned({
        name: "CN=Agent Vault Test CA",
        serialNumber: "01",
        notBefore,
        notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
        signingAlgorithm: algorithm,
        keys,
        extensions: [
          new x509.BasicConstraintsExtension(isCa, undefined, true),
          // eslint-disable-next-line no-bitwise
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
        ]
      });
      return certificate.toString("pem");
    };

    const asProxy = (accessToken: string, url: string, body?: Record<string, unknown>) =>
      testServer.inject({
        method: "POST",
        url: `/api/v1/agent-vault/proxy/${url}`,
        headers: { authorization: `Bearer ${accessToken}` },
        body
      });

    const createProxy = async (name: string) => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name });
      expect(created.statusCode).toBe(200);
      return JSON.parse(created.payload) as {
        proxy: { id: string; rootCaFingerprint: string | null };
        proxyToken: string;
      };
    };

    const rotate = async (proxyId: string) => {
      const rotated = await inject("POST", `/api/v1/agent-vault/proxies/${proxyId}/token-auth/proxy-token`);
      expect(rotated.statusCode).toBe(200);
      return JSON.parse(rotated.payload) as { proxy: { rootCaFingerprint: string | null }; proxyToken: string };
    };

    test("create returns a proxy token and the fingerprint of the CA bootstrap returns", async () => {
      const created = await createProxy("token-create");
      expect(created.proxyToken).toBeTruthy();
      // Shown before anything starts, so it can be pinned without running a proxy first.
      expect(created.proxy.rootCaFingerprint).toMatch(/^SHA256:/);

      const boot = await asProxy(created.proxyToken, "bootstrap", {});
      expect(boot.statusCode).toBe(200);
      const body = JSON.parse(boot.payload) as { proxyId: string; rootCa: TRootCa; config: { pollInterval: number } };
      expect(body.proxyId).toBe(created.proxy.id);
      expect(body.config.pollInterval).toBe(60);
      expect(body.rootCa.privateKey).toContain("BEGIN PRIVATE KEY");
      expect(fingerprintOf(body.rootCa.certificate)).toBe(created.proxy.rootCaFingerprint);

      const again = JSON.parse((await asProxy(created.proxyToken, "bootstrap", {})).payload) as { rootCa: TRootCa };
      expect(again.rootCa.certificate).toBe(body.rootCa.certificate);

      expect((await asProxy(created.proxyToken, "heartbeat")).statusCode).toBe(200);
    });

    test("the generated CA is a P-256 CA valid for about ten years", async () => {
      const created = await createProxy("token-ca-shape");
      const { rootCa } = JSON.parse((await asProxy(created.proxyToken, "bootstrap", {})).payload) as {
        rootCa: TRootCa;
      };
      const cert = new x509.X509Certificate(rootCa.certificate);
      expect(cert.getExtension(x509.BasicConstraintsExtension)?.ca).toBe(true);
      expect((cert.publicKey.algorithm as { namedCurve?: string }).namedCurve).toBe("P-256");
      const years = (cert.notAfter.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
      expect(years).toBeGreaterThan(9.9);
      expect(years).toBeLessThan(10.1);

      // The CLI sends a CA it serves itself through the same parser, so Infisical's own CA must pass it too.
      expect(
        (await asProxy(created.proxyToken, "bootstrap", { servedCaCertificate: rootCa.certificate })).statusCode
      ).toBe(200);
    });

    test("rotating stops the old token, replaces the CA, and shows the new CA's fingerprint", async () => {
      const created = await createProxy("token-rotate");
      const first = JSON.parse((await asProxy(created.proxyToken, "bootstrap", {})).payload) as { rootCa: TRootCa };
      const next = await rotate(created.proxy.id);
      expect(next.proxy.rootCaFingerprint).toMatch(/^SHA256:/);
      expect(next.proxy.rootCaFingerprint).not.toBe(created.proxy.rootCaFingerprint);

      expect((await asProxy(created.proxyToken, "heartbeat")).statusCode).toBe(401);
      const boot = JSON.parse((await asProxy(next.proxyToken, "bootstrap", {})).payload) as { rootCa: TRootCa };
      expect(boot.rootCa.certificate).not.toBe(first.rootCa.certificate);
      expect(fingerprintOf(boot.rootCa.certificate)).toBe(next.proxy.rootCaFingerprint);
    });

    test("two rotations at once each return a token and CA that belong together, and the last one wins", async () => {
      const created = await createProxy("token-rotate-race");
      const [first, second] = await Promise.all([rotate(created.proxy.id), rotate(created.proxy.id)]);

      const results = await Promise.all(
        [first, second].map(async (r) => ({
          r,
          boot: await asProxy(r.proxyToken, "bootstrap", {})
        }))
      );
      const live = results.filter(({ boot }) => boot.statusCode === 200);
      expect(live).toHaveLength(1);
      const { rootCa } = JSON.parse(live[0].boot.payload) as { rootCa: TRootCa };

      const row = await testDb("agent_vault_proxies").where({ id: created.proxy.id }).first();
      expect(row.tokenVersion).toBe(3);
      expect(row.rootCaCertificate).toBe(rootCa.certificate);
      expect(row.rootCaFingerprint).toBe(fingerprintOf(rootCa.certificate));
    });

    test("revoking access stops the token, and rotating brings the proxy back", async () => {
      const created = await createProxy("token-revoke");
      expect((await inject("POST", `/api/v1/agent-vault/proxies/${created.proxy.id}/revoke`)).statusCode).toBe(200);
      expect((await asProxy(created.proxyToken, "bootstrap", {})).statusCode).toBe(401);

      const next = await rotate(created.proxy.id);
      expect((await asProxy(next.proxyToken, "bootstrap", {})).statusCode).toBe(200);
    });

    test("a member can't rotate a proxy's token", async () => {
      const created = await createProxy("token-member-rotate");
      const member = await createUaIdentity(`av-proxy-member-${Date.now()}`);
      try {
        expect(
          (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [member.id], role: "member" }))
            .statusCode
        ).toBe(200);
        const rotated = await member.asIdentity(
          "POST",
          `/api/v1/agent-vault/proxies/${created.proxy.id}/token-auth/proxy-token`
        );
        expect(rotated.statusCode).toBe(403);
      } finally {
        await deleteUaIdentity(member.id);
      }
    });

    test("a proxy serving its own CA reports it and gets no CA back", async () => {
      const created = await createProxy("token-own-ca");
      const own = await caPem();
      const boot = await asProxy(created.proxyToken, "bootstrap", { servedCaCertificate: own });
      expect(boot.statusCode).toBe(200);
      expect((JSON.parse(boot.payload) as { rootCa?: TRootCa }).rootCa).toBeUndefined();

      const row = await testDb("agent_vault_proxies").where({ id: created.proxy.id }).first();
      expect(row.rootCaFingerprint).toBe(fingerprintOf(own));
      expect(row.encryptedRootCaPrivateKey).not.toBeNull();
    });

    test("a served CA that isn't a CA, or isn't a certificate, is refused and changes nothing", async () => {
      const created = await createProxy("token-bad-served-ca");
      const before = await testDb("agent_vault_proxies").where({ id: created.proxy.id }).first();

      const leaf = await asProxy(created.proxyToken, "bootstrap", {
        servedCaCertificate: await caPem({ isCa: false })
      });
      expect(leaf.statusCode).toBe(400);
      const garbage = await asProxy(created.proxyToken, "bootstrap", { servedCaCertificate: "not a certificate" });
      expect(garbage.statusCode).toBe(400);
      const rsa = await asProxy(created.proxyToken, "bootstrap", { servedCaCertificate: await caPem({ rsa: true }) });
      expect(rsa.statusCode).toBe(400);
      expect((JSON.parse(rsa.payload) as { message: string }).message).toContain("P-256");
      const future = await asProxy(created.proxyToken, "bootstrap", {
        servedCaCertificate: await caPem({ notBefore: new Date(Date.now() + 60 * 60 * 1000) })
      });
      expect(future.statusCode).toBe(400);
      expect((JSON.parse(future.payload) as { message: string }).message).toContain("valid from");

      const after = await testDb("agent_vault_proxies").where({ id: created.proxy.id }).first();
      expect(after.rootCaFingerprint).toBe(before.rootCaFingerprint);
    });

    test("a CA that starts a little in the future is accepted, for a CLI whose clock is ahead", async () => {
      const created = await createProxy("token-clock-ahead");
      const own = await caPem({ notBefore: new Date(Date.now() + 2 * 60 * 1000) });
      expect((await asProxy(created.proxyToken, "bootstrap", { servedCaCertificate: own })).statusCode).toBe(200);
    });

    test("a proxy enrolled before tokens had no stored CA gets one at bootstrap, the same for every start", async () => {
      const created = await createProxy("token-legacy-ca");
      await testDb("agent_vault_proxies")
        .where({ id: created.proxy.id })
        .update({ rootCaCertificate: null, encryptedRootCaPrivateKey: null });

      const boots = await Promise.all([1, 2, 3].map(() => asProxy(created.proxyToken, "bootstrap", {})));
      boots.forEach((boot) => expect(boot.statusCode).toBe(200));
      const certificates = new Set(
        boots.map((boot) => (JSON.parse(boot.payload) as { rootCa: TRootCa }).rootCa.certificate)
      );
      expect(certificates.size).toBe(1);

      const row = await testDb("agent_vault_proxies").where({ id: created.proxy.id }).first();
      expect(row.rootCaFingerprint).toBe(fingerprintOf([...certificates][0]));
    });

    test("the enrollment routes are gone", async () => {
      const created = await createProxy("token-no-enrollment");
      expect(
        (await inject("POST", `/api/v1/agent-vault/proxies/${created.proxy.id}/token-auth/enrollment-token`)).statusCode
      ).toBe(404);
      const login = await testServer.inject({
        method: "POST",
        url: "/api/v1/agent-vault/proxy/login",
        body: { method: "token", token: "avp_x" }
      });
      expect(login.statusCode).toBe(404);
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

  describe("generic project routes", async () => {
    // The org-level pages reach the Agent Vault project through the platform's own membership routes, so the
    // last-admin rule has to hold there too, not only on the product routes.
    const projectFor = async () =>
      (JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as { projectId: string }).projectId;
    const seedMembership = async (projectId: string) =>
      testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
        .first();
    const clearSeedPermissionCache = (projectId: string) =>
      testKeyStore.deleteItemsByKeyIn([
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault)
      ]);

    test("the generic role change refuses to demote the last Agent Vault admin", async () => {
      const projectId = await projectFor();
      const membership = await seedMembership(projectId);

      const res = await inject("PATCH", `/api/v1/projects/${projectId}/memberships/${membership.id}`, {
        roles: [{ role: ProjectMembershipRole.Member }]
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("must keep at least one admin");

      const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
      expect(role.role).toBe(ProjectMembershipRole.Admin);
    });

    test("leaving through the generic route refuses when you are the last Agent Vault admin", async () => {
      const projectId = await projectFor();

      const res = await inject("DELETE", `/api/v1/projects/${projectId}/leave`);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("must keep at least one admin");
      expect(await seedMembership(projectId)).toBeTruthy();
    });

    test("the generic role change goes through once another admin exists", async () => {
      const projectId = await projectFor();
      const membership = await seedMembership(projectId);
      const other = await createOrgIdentity(`av-second-admin-${Date.now()}`);
      expect(
        (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [other.id], role: "admin" }))
          .statusCode
      ).toBe(200);

      try {
        const demoted = await inject("PATCH", `/api/v1/projects/${projectId}/memberships/${membership.id}`, {
          roles: [{ role: ProjectMembershipRole.Member }]
        });
        expect(demoted.statusCode).toBe(200);
        const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
        expect(role.role).toBe(ProjectMembershipRole.Member);
      } finally {
        await testDb("membership_roles")
          .where({ membershipId: membership.id })
          .update({ role: ProjectMembershipRole.Admin });
        await clearSeedPermissionCache(projectId);
        await deleteOrgIdentity(other.id);
      }
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

    test("an org admin who never opened Agent Vault is joined as admin by inviting with access", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      // getProjectPermission caches the membership rows for ten seconds, so the cache is cleared around
      // each direct edit or the server keeps seeing the row that was just removed.
      const cacheKeys = [
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault)
      ];
      const inviterMembership = () =>
        testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
          .first();

      // Remove the inviter's own membership so they look like an org admin arriving fresh.
      const before = await inviterMembership();
      await testDb("memberships").where({ id: before.id }).del();
      await testKeyStore.deleteItemsByKeyIn(cacheKeys);

      try {
        const inviteeEmail = `agent-vault-invite-fresh-${crypto.randomUUID()}@localhost.local`;
        const res = await inject("POST", "/api/v1/invite-org/signup", {
          inviteeEmails: [inviteeEmail],
          organizationId: seedData1.organization.id,
          grantAgentVaultAccess: true
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.payload).grantFailures).toBeUndefined();

        const inviter = await inviterMembership();
        expect(inviter).toBeTruthy();
        const inviterRole = await testDb("membership_roles").where({ membershipId: inviter.id }).first();
        expect(inviterRole.role).toBe(ProjectMembershipRole.Admin);

        const user = await testDb("users").where({ username: inviteeEmail }).first();
        const invitee = await testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: user.id })
          .first();
        expect(invitee).toBeTruthy();
      } finally {
        // Later tests act as this admin, so put the membership back if the self-join did not.
        if (!(await inviterMembership())) {
          const [restored] = (await testDb("memberships")
            .insert({
              scope: AccessScope.Project,
              scopeProjectId: projectId,
              scopeOrgId: seedData1.organization.id,
              actorUserId: seedData1.id
            })
            .returning("*")) as { id: string }[];
          await testDb("membership_roles").insert({ membershipId: restored.id, role: ProjectMembershipRole.Admin });
        }
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);
      }
    });

    test("an org admin who is an Agent Vault member is not promoted by inviting with access", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const cacheKeys = [
        KeyStorePrefixes.ProjectPermissionMarker(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault),
        KeyStorePrefixes.ProjectPermissionData(projectId, ActorType.USER, seedData1.id, ActionProjectType.AgentVault)
      ];
      const membership = await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: seedData1.id })
        .first();
      await testDb("membership_roles")
        .where({ membershipId: membership.id })
        .update({ role: ProjectMembershipRole.Member });
      await testKeyStore.deleteItemsByKeyIn(cacheKeys);

      try {
        const inviteeEmail = `agent-vault-invite-member-${crypto.randomUUID()}@localhost.local`;
        const res = await inject("POST", "/api/v1/invite-org/signup", {
          inviteeEmails: [inviteeEmail],
          organizationId: seedData1.organization.id,
          grantAgentVaultAccess: true
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.payload).grantFailures?.agentVaultAccess).toBe(true);

        const role = await testDb("membership_roles").where({ membershipId: membership.id }).first();
        expect(role.role).toBe(ProjectMembershipRole.Member);
      } finally {
        await testDb("membership_roles")
          .where({ membershipId: membership.id })
          .update({ role: ProjectMembershipRole.Admin });
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);
      }
    });
  });

  describe("membership", async () => {
    test("a grant to someone outside the Agent Vault project is refused", async () => {
      const bundle = await createAccessBundle("member-outside-project");

      const outsider = await createOrgIdentity(`av-outsider-${Date.now()}`);

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        machineIdentityIds: [outsider.id]
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
          machineIdentityIds: [insider.id]
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
        machineIdentityIds: [],
        groupIds: []
      });
      expect(empty.statusCode).toBe(422);

      const notAnId = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        userIds: ["not-a-uuid"]
      });
      expect(notAnId.statusCode).toBe(422);
    });

    test("listing members discriminates the user, machine identity and group arms", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("member-arms");
      const group = await createProjectGroup(projectId, "av-arms-group", ProjectMembershipRole.Member);
      const identity = await createOrgIdentity(`av-arms-identity-${Date.now()}`);

      try {
        expect(
          (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [identity.id], role: "member" }))
            .statusCode
        ).toBe(200);

        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
              groupIds: [group.id],
              machineIdentityIds: [identity.id]
            })
          ).statusCode
        ).toBe(200);

        const res = await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`);
        expect(res.statusCode).toBe(200);
        const { members } = JSON.parse(res.payload) as {
          members: { type: string; id: string; name?: string; username?: string; grantedAt: string }[];
        };

        // The creator's own grant is already there, so all three arms are on one response.
        const byType = Object.fromEntries(members.map((member) => [member.type, member]));
        expect(Object.keys(byType).sort()).toEqual(["group", "machineIdentity", "user"]);

        expect(byType.group).toMatchObject({ type: "group", id: group.id, name: "av-arms-group" });
        expect(byType.machineIdentity).toMatchObject({ type: "machineIdentity", id: identity.id });
        expect(byType.user).toMatchObject({ type: "user", id: seedData1.id });
        expect(byType.user.username).toBeTruthy();

        members.forEach((member) => {
          expect(member.grantedAt).toEqual(expect.any(String));
          expect(member).not.toHaveProperty("actor");
          expect(member).not.toHaveProperty("createdAt");
          expect(member).not.toHaveProperty("accessBundleId");
          expect(member).not.toHaveProperty("userId");
          expect(member).not.toHaveProperty("identityId");
          expect(member).not.toHaveProperty("groupId");
          expect(member).not.toHaveProperty("user");
          expect(member).not.toHaveProperty("identity");
          expect(member).not.toHaveProperty("group");
        });
      } finally {
        await deleteOrgIdentity(identity.id);
        await group.cleanup();
      }
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
        expect(JSON.parse(granted.payload)).toMatchObject({ skipped: [] });
        expect(JSON.parse(granted.payload).members).toHaveLength(2);
        expect(await grantRows(bundle.id, { actorGroupId: first.id })).toHaveLength(1);
        expect(await grantRows(bundle.id, { actorGroupId: second.id })).toHaveLength(1);

        const again = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          groupIds: [first.id, second.id]
        });
        expect(again.statusCode).toBe(200);
        const repeat = JSON.parse(again.payload) as {
          members: unknown[];
          skipped: { type: string; id: string }[];
        };
        expect(repeat.members).toEqual([]);
        expect(repeat.skipped.map((actor) => actor.id).sort()).toEqual([first.id, second.id].sort());
        expect(repeat.skipped.every((actor) => actor.type === "group")).toBe(true);
      } finally {
        await first.cleanup();
        await second.cleanup();
      }
    });

    test("two overlapping demotions cannot both slip past the last-admin guard", async () => {
      const projectId = await getProjectId();
      const one = await createUaIdentity(`av-race-a-${Date.now()}`);
      const two = await createUaIdentity(`av-race-b-${Date.now()}`);
      let callerGroup: Awaited<ReturnType<typeof makeCallerAdminOnlyThroughGroup>> | undefined;

      try {
        for await (const identity of [one, two]) {
          const added = await inject("POST", "/api/v1/agent-vault/members", {
            machineIdentityIds: [identity.id],
            role: ProjectMembershipRole.Admin
          });
          expect(added.statusCode).toBe(200);
        }
        callerGroup = await makeCallerAdminOnlyThroughGroup(projectId);
        const { groupId } = callerGroup;

        // Holding the lock until both requests queue behind it means both have passed their permission
        // checks first. Otherwise the second can rebuild them after the first demotes the caller's group,
        // and is refused with a 403 before it ever reaches the guard.
        let lockHeld!: () => void;
        let releaseLock!: () => void;
        const held = new Promise<void>((resolve) => {
          lockHeld = resolve;
        });
        const released = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        const holder = testDb.transaction(async (trx) => {
          await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", projectId)]);
          lockHeld();
          await released;
        });
        await held;

        // Either batch alone leaves an admin standing. Together they would leave none, so one has to be
        // refused whichever commits first.
        const pending = Promise.all(
          [one, two].map((identity) =>
            inject("PATCH", "/api/v1/agent-vault/members", {
              groupIds: [groupId],
              machineIdentityIds: [identity.id],
              role: ProjectMembershipRole.Member
            })
          )
        );
        // Released in finally: a poll that times out would otherwise leave the lock held and the queued
        // requests blocked, hanging the run instead of failing the test.
        try {
          await pollUntil({
            describe: "both demotions to wait on the last-admin lock",
            read: async () =>
              Number(
                (
                  (await testDb.raw(
                    "SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
                  )) as { rows: { waiting: string }[] }
                ).rows[0].waiting
              ),
            done: (waiting) => waiting >= 2
          });
        } finally {
          releaseLock();
          await holder;
          await Promise.allSettled([pending]);
        }
        const results = await pending;
        expect(results.map((res) => res.statusCode).sort()).toEqual([200, 400]);
        const refused = results.find((res) => res.statusCode === 400)!;
        expect(JSON.parse(refused.payload).message).toContain("must keep at least one admin");

        const remainingAdmins = (await testDb("membership_roles")
          .join("memberships", "memberships.id", "membership_roles.membershipId")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, role: ProjectMembershipRole.Admin })
          .select("memberships.id")) as unknown[];
        expect(remainingAdmins).toHaveLength(1);
      } finally {
        await callerGroup?.restore();
        await deleteUaIdentity(one.id);
        await deleteUaIdentity(two.id);
      }
    });

    test("an actor from outside the organization is refused, and an unknown id does not 500", async () => {
      const stranger = await inject("POST", "/api/v1/agent-vault/members", {
        userIds: ["99999999-8888-7777-6666-555555555555"],
        emails: [],
        role: ProjectMembershipRole.Member
      });
      expect(stranger.statusCode).toBe(400);
      expect(JSON.parse(stranger.payload).message).toContain("is not a member of this organization");

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
        const res = await inject("POST", "/api/v1/agent-vault/members", {
          machineIdentityIds: [identityId],
          role: ProjectMembershipRole.Member
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.payload).message).toContain("is deactivated in this organization");
      } finally {
        await testDb("memberships").where({ id: orgMembership.id }).update({ isActive: true });
      }
    });

    test("a deactivated admin can be demoted, but a deactivated member cannot be promoted", async () => {
      const identity = await createOrgIdentity(`av-deactivated-role-${Date.now()}`);

      try {
        expect(
          (
            await inject("POST", "/api/v1/agent-vault/members", {
              machineIdentityIds: [identity.id],
              role: ProjectMembershipRole.Admin
            })
          ).statusCode
        ).toBe(200);
        await testDb("memberships")
          .where({ scope: AccessScope.Organization, actorIdentityId: identity.id })
          .update({ isActive: false });

        const demoted = await inject("PATCH", "/api/v1/agent-vault/members", {
          machineIdentityIds: [identity.id],
          role: ProjectMembershipRole.Member
        });
        expect(demoted.statusCode).toBe(200);
        expect(JSON.parse(demoted.payload).members).toMatchObject([{ id: identity.id, role: "member" }]);

        const promoted = await inject("PATCH", "/api/v1/agent-vault/members", {
          machineIdentityIds: [identity.id],
          role: ProjectMembershipRole.Admin
        });
        expect(promoted.statusCode).toBe(400);
        expect(JSON.parse(promoted.payload).message).toContain("is deactivated in this organization");
      } finally {
        await deleteOrgIdentity(identity.id);
      }
    });

    test("simultaneous role changes leave a member with exactly one role", async () => {
      const projectId = await getProjectId();
      const identity = await createOrgIdentity(`av-role-race-${Date.now()}`);

      try {
        expect(
          (
            await inject("POST", "/api/v1/agent-vault/members", {
              machineIdentityIds: [identity.id],
              role: ProjectMembershipRole.Member
            })
          ).statusCode
        ).toBe(200);

        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            inject("PATCH", "/api/v1/agent-vault/members", {
              machineIdentityIds: [identity.id],
              role: i % 2 ? ProjectMembershipRole.Member : ProjectMembershipRole.Admin
            })
          )
        );
        expect(results.every((res) => res.statusCode === 200)).toBe(true);

        const membership = await testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorIdentityId: identity.id })
          .first();
        expect(await testDb("membership_roles").where({ membershipId: membership.id })).toHaveLength(1);
      } finally {
        await deleteOrgIdentity(identity.id);
      }
    });

    test("a machine identity inherits a group's access bundles, on mint and on resolve", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("group-inheritance");
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
            type: "http",
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
          agentVaultServiceCustomHeaderDAL: agentVaultServiceCustomHeaderDALFactory(testDb),
          agentVaultServiceSubstitutionDAL: agentVaultServiceSubstitutionDALFactory(testDb),
          agentVaultVariableDAL: agentVaultVariableDALFactory(testDb),
          agentVaultPersonalValueDAL: agentVaultPersonalValueDALFactory(testDb),
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          projectDAL: projectDALFactory(testDb),
          userDAL: userDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
          resourceAuthMethodService: {} as never,
          agentVaultOauthService: {} as never
        });
        const resolve = () =>
          resolver.resolveSession({
            proxyId: proxy.id,
            orgId: seedData1.organization.id,
            sessionToken: session.token,
            hasSessionLogKey: false
          });

        expect((await resolve()).services).toHaveLength(1);

        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${second.id}/members`, {
              groupIds: [group.id]
            })
          ).statusCode
        ).toBe(200);
        expect((await resolve()).services).toHaveLength(1);

        expect(
          (
            await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
              groupIds: [group.id]
            })
          ).statusCode
        ).toBe(200);
        expect((await resolve()).services).toHaveLength(0);

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
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
            type: "http",
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
        (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [agent.id], role: "member" }))
          .statusCode
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
          agentVaultServiceCustomHeaderDAL: agentVaultServiceCustomHeaderDALFactory(testDb),
          agentVaultServiceSubstitutionDAL: agentVaultServiceSubstitutionDALFactory(testDb),
          agentVaultVariableDAL: agentVaultVariableDALFactory(testDb),
          agentVaultPersonalValueDAL: agentVaultPersonalValueDALFactory(testDb),
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          projectDAL: projectDALFactory(testDb),
          userDAL: userDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
          resourceAuthMethodService: {} as never,
          agentVaultOauthService: {} as never
        });
        const resolve = () =>
          resolver.resolveSession({
            proxyId: proxy.id,
            orgId: seedData1.organization.id,
            sessionToken: session.token,
            hasSessionLogKey: false
          });
        expect((await resolve()).services).toHaveLength(1);

        const groupMembership = await testDb("memberships")
          .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorGroupId: group.id })
          .first();
        await testDb("membership_roles")
          .where({ membershipId: groupMembership.id })
          .update({ isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) });
        await testKeyStore.deleteItemsByKeyIn(cacheKeys);

        expect((await resolve()).services).toHaveLength(0);
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

    test("available lists the members who could still be granted the bundle, and drops each as it is granted", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle(`available-grantees-${Date.now()}`);
      const other = await createAccessBundle(`available-grantees-other-${Date.now()}`);
      const group = await createProjectGroup(projectId, "av-grantee-group", ProjectMembershipRole.Member);
      const availableUrl = `/api/v1/agent-vault/access-bundles/${bundle.id}/members/available`;

      const listAvailable = async (query = "") => {
        const res = await inject("GET", `${availableUrl}${query ? `?${query}` : ""}`);
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.payload) as {
          members: { type: string; id: string }[];
          totalCount: number;
        };
      };

      try {
        const idsOf = (members: { id: string }[]) => members.map((member) => member.id);

        // Candidates are the product's own members, and the bundle is new, so nobody holds it yet.
        const before = await listAvailable("limit=100");
        expect(idsOf(before.members)).toContain(group.id);

        expect(
          (await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, { groupIds: [group.id] }))
            .statusCode
        ).toBe(200);

        const afterGrant = await listAvailable("limit=100");
        expect(idsOf(afterGrant.members)).not.toContain(group.id);
        expect(afterGrant.totalCount).toBe(before.totalCount - 1);

        // The grant is per bundle, so holding one leaves the actor a candidate for every other.
        const otherRes = await inject(
          "GET",
          `/api/v1/agent-vault/access-bundles/${other.id}/members/available?limit=100`
        );
        expect(otherRes.statusCode).toBe(200);
        expect(idsOf((JSON.parse(otherRes.payload) as { members: { id: string }[] }).members)).toContain(group.id);

        expect(
          (
            await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
              groupIds: [group.id]
            })
          ).statusCode
        ).toBe(200);
        const afterRevoke = await listAvailable("limit=100");
        expect(idsOf(afterRevoke.members)).toContain(group.id);
        expect(afterRevoke.totalCount).toBe(before.totalCount);

        // totalCount counts the whole set rather than the page, so a picker can say it is truncated.
        const firstPage = await listAvailable("limit=1");
        expect(firstPage.members).toHaveLength(1);
        expect(firstPage.totalCount).toBe(before.totalCount);
      } finally {
        await group.cleanup();
        await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
        await inject("DELETE", `/api/v1/agent-vault/access-bundles/${other.id}`);
      }
    });

    test("available on a bundle rejects the out-of-range query values the member list does", async () => {
      const bundle = await createAccessBundle(`available-grantees-query-${Date.now()}`);
      const availableUrl = `/api/v1/agent-vault/access-bundles/${bundle.id}/members/available`;

      try {
        expect((await inject("GET", `${availableUrl}?limit=0`)).statusCode).toBe(422);
        expect((await inject("GET", `${availableUrl}?limit=101`)).statusCode).toBe(422);
        expect((await inject("GET", `${availableUrl}?offset=10001`)).statusCode).toBe(422);

        // An unreachable bundle is a 404 here as everywhere else, never a 403 confirming it exists.
        const unknown = await inject(
          "GET",
          `/api/v1/agent-vault/access-bundles/${crypto.randomUUID()}/members/available`
        );
        expect(unknown.statusCode).toBe(404);
      } finally {
        await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      }
    });

    test("a revoke is confined to the named bundle, actor and actor type", async () => {
      const projectId = await getProjectId();
      const [held, other] = [await createAccessBundle("revoke-held"), await createAccessBundle("revoke-other")];
      const group = await createProjectGroup(projectId, "av-revoke-group", ProjectMembershipRole.Member);

      try {
        const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${held.id}/members`, {
          groupIds: [group.id]
        });
        expect(granted.statusCode).toBe(200);
        expect(JSON.parse(granted.payload)).toEqual({
          members: [{ type: "group", id: group.id, grantedAt: expect.any(String) }],
          skipped: []
        });

        const stillGranted = async () => (await grantRows(held.id, { actorGroupId: group.id })).length;
        const revoke = (accessBundleId: string, body: Record<string, unknown>) =>
          inject("DELETE", `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, body);

        // Every miss below is a 200 with the actor reported in skipped, not a 404: a batch cannot fail
        // wholesale on one absent id and stay useful, and the grant it does not name has to survive.
        // That surviving grant is the assertion that matters; the status alone would not catch a revoke
        // that reached the wrong bundle.
        const wrongBundle = await revoke(other.id, { groupIds: [group.id] });
        expect(wrongBundle.statusCode).toBe(200);
        expect(JSON.parse(wrongBundle.payload)).toMatchObject({
          members: [],
          skipped: [{ type: "group", id: group.id }]
        });
        expect(await stillGranted()).toBe(1);

        // The same id sent as the wrong actor kind names nobody, so the group's grant stands.
        const wrongType = await revoke(held.id, { userIds: [group.id] });
        expect(wrongType.statusCode).toBe(200);
        expect(JSON.parse(wrongType.payload).skipped).toMatchObject([{ type: "user", id: group.id }]);
        expect(await stillGranted()).toBe(1);

        const unknownActor = await revoke(held.id, { userIds: [crypto.randomUUID()] });
        expect(unknownActor.statusCode).toBe(200);
        expect(JSON.parse(unknownActor.payload).members).toHaveLength(0);
        expect(await stillGranted()).toBe(1);

        const correct = await revoke(held.id, { groupIds: [group.id] });
        expect(correct.statusCode).toBe(200);
        expect(JSON.parse(correct.payload)).toEqual({
          members: [{ type: "group", id: group.id }],
          skipped: []
        });
        expect(await stillGranted()).toBe(0);

        // Repeating it changes nothing, which is what makes the bulk call safe to retry.
        const again = await revoke(held.id, { groupIds: [group.id] });
        expect(again.statusCode).toBe(200);
        expect(JSON.parse(again.payload)).toMatchObject({ members: [], skipped: [{ type: "group", id: group.id }] });
      } finally {
        await group.cleanup();
      }
    });

    test("a revoke reaches only this bundle's grant for this actor, and grants are not seats", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("scoped-member-ids");
      const identity = await createOrgIdentity(`av-seats-${Date.now()}`);
      expect(
        (await inject("POST", "/api/v1/agent-vault/members", { machineIdentityIds: [identity.id], role: "member" }))
          .statusCode
      ).toBe(200);

      const seatsBefore = await usageCounterDALFactory(testDb).countAgentVaultIdentities(seedData1.organization.id);

      const projectMembership = await testDb("memberships")
        .where({ scope: AccessScope.Project, scopeProjectId: projectId, actorIdentityId: identity.id })
        .first();
      // The actor holds a project membership but no grant on this bundle, so the revoke reports it as
      // skipped and, crucially, leaves the project membership alone. That is the property this test
      // defends: the two scopes share one table, so a revoke that lost its scope filter would take it.
      const refused = await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        machineIdentityIds: [identity.id]
      });
      expect(refused.statusCode).toBe(200);
      expect(JSON.parse(refused.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "machineIdentity", id: identity.id }]
      });
      expect(await testDb("memberships").where({ id: projectMembership.id })).toHaveLength(1);

      for (const name of ["seats-a", "seats-b", "seats-c"]) {
        // eslint-disable-next-line no-await-in-loop
        const extra = await createAccessBundle(name);
        // eslint-disable-next-line no-await-in-loop
        const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${extra.id}/members`, {
          machineIdentityIds: [identity.id]
        });
        expect(granted.statusCode).toBe(200);
      }
      const duplicate = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        machineIdentityIds: [identity.id]
      });
      expect(duplicate.statusCode).toBe(200);
      const again = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
        machineIdentityIds: [identity.id]
      });
      expect(again.statusCode).toBe(200);
      expect(JSON.parse(again.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "machineIdentity", id: identity.id }]
      });

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
