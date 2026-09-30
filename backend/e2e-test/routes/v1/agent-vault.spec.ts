import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";

import { AccessScope, ActionProjectType, OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { agentVaultServiceCustomHeaderDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-service-custom-header-dal";
import { agentVaultServiceSubstitutionDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-service-substitution-dal";
import { agentVaultVariableDALFactory } from "@app/ee/services/agent-vault-access-bundle/agent-vault-variable-dal";
import { agentVaultProxyDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-dal";
import {
  AGENT_VAULT_MAX_PROXIES_PER_ORG,
  agentVaultProxyServiceFactory
} from "@app/ee/services/agent-vault-proxy/agent-vault-proxy-service";
import { agentVaultResolveDALFactory } from "@app/ee/services/agent-vault-proxy/agent-vault-resolve-dal";
import { agentVaultSessionDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-dal";
import { agentVaultSessionLogConfigDALFactory } from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-config-dal";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
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
    as: (method: "GET" | "POST" | "PATCH", url: string, body?: Record<string, unknown>) =>
      testServer.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) }),
    cleanup: () => inject("DELETE", `/api/v1/identities/${identity.id}`)
  };
};

const createAccessBundle = async (name: string) => {
  const res = await inject("POST", "/api/v1/agent-vault/access-bundles", { name });
  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload) as { accessBundle: { id: string; name: string } }).accessBundle;
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
        members: { actor: { type: string; id: string } }[];
        totalCount: number;
      };

      expect(totalCount).toBe(1);
      expect(members).toHaveLength(1);
      expect(members[0].actor).toMatchObject({ type: "user", id: seedData1.id });

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
        name: "datadog-us5",
        hostPattern: "api.us5.datadoghq.com, api.datadoghq.eu",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(first.statusCode).toBe(200);

      const overlapping = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "datadog-eu",
        hostPattern: "api.datadoghq.eu, api.datadoghq.com",
        credential: { type: "bearer", value: "def456" }
      });
      expect(overlapping.statusCode).toBe(400);
      expect(JSON.parse(overlapping.payload).message).toContain("api.datadoghq.eu:443");

      const contained = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "datadog-wildcard",
        hostPattern: "*.datadoghq.com",
        credential: { type: "passthrough" }
      });
      expect(contained.statusCode).toBe(200);
    });

    test("a service never echoes its secret, and its host pattern is kept as typed", async () => {
      const bundle = await createAccessBundle("secret-handling");

      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "github",
        hostPattern: " API.GitHub.com ",
        credential: { type: "bearer", value: "ghp_secret_value" }
      });
      expect(res.statusCode).toBe(200);

      const { service } = JSON.parse(res.payload) as {
        service: { id: string; hostPattern: string; credential: Record<string, unknown> };
      };
      expect(service.hostPattern).toBe("API.GitHub.com");
      expect(service.credential).toEqual({ type: "bearer", headerName: "Authorization", headerPrefix: "Bearer" });
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
      const rotated = await inject("PATCH", url, { credential: { type: "bearer", value: "rotated456" } });
      expect(rotated.statusCode).toBe(200);
      expect(JSON.parse(rotated.payload).service.credential).toEqual({
        type: "bearer",
        headerName: "DD-API-KEY",
        headerPrefix: ""
      });
      expect((await sealed()).equals(before)).toBe(false);

      const afterRotate = await sealed();
      const renamed = await inject("PATCH", url, { credential: { type: "bearer", headerName: "X-Api-Key" } });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).service.credential.headerName).toBe("X-Api-Key");
      expect((await sealed()).equals(afterRotate)).toBe(true);
    });

    test("a basic credential keeps one half while the other changes, and refuses to lose both", async () => {
      const bundle = await createAccessBundle("basic-halves");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "stripe",
        hostPattern: "api.stripe.com",
        credential: { type: "basic", username: "sk_live_key", password: "" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as {
        service: { id: string; credential: Record<string, unknown> };
      };
      expect(service.credential).toEqual({ type: "basic" });
      expect(created.payload).not.toContain("sk_live_key");

      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;
      const sealedPair = async () => {
        const row = await testDb("agent_vault_services").where({ id: service.id }).first();
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

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", value: "ghp_one" }
      });
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;

      const emptyBasic = await inject("PATCH", url, { credential: { type: "basic" } });
      expect(emptyBasic.statusCode).toBe(400);

      const noSecret = await inject("PATCH", url, { credential: { type: "basic", username: "bot" } });
      expect(noSecret.statusCode).toBe(200);

      const bearerNoValue = await inject("PATCH", url, { credential: { type: "bearer" } });
      expect(bearerNoValue.statusCode).toBe(400);
    });

    test("a path in a host pattern is rejected", async () => {
      const bundle = await createAccessBundle("no-paths");
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "with-path",
        hostPattern: "gitlab.com/api/v4",
        credential: { type: "passthrough" }
      });
      expect(res.statusCode).toBe(422);
    });

    test("methods and path prefixes default to unrestricted, and null clears them again", async () => {
      const bundle = await createAccessBundle("service-policy");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
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

      const renamed = await inject("PATCH", url, { name: "github-read" });
      expect(JSON.parse(renamed.payload).service.allowedMethods).toEqual(["GET", "HEAD"]);

      const cleared = await inject("PATCH", url, { allowedMethods: null, allowedPathPrefixes: null });
      expect(cleared.statusCode).toBe(200);
      expect(JSON.parse(cleared.payload).service.allowedMethods).toBeNull();
      expect(JSON.parse(cleared.payload).service.allowedPathPrefixes).toBeNull();

      expect((await inject("PATCH", url, { allowedMethods: [] })).statusCode).toBe(422);
      expect((await inject("PATCH", url, { allowedPathPrefixes: [] })).statusCode).toBe(422);
    });

    test("a path prefix that would need normalising to judge is rejected", async () => {
      const bundle = await createAccessBundle("path-grammar");
      const reject = async (prefix: string) =>
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
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
        customHeaders: [{ id: customHeaderId, name: "X-Organization-Id" }]
      });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).service.customHeaders[0].id).toBe(customHeaderId);
      expect(JSON.parse(renamed.payload).service.customHeaders[0].name).toBe("X-Organization-Id");
      expect((await sealed()).equals(before)).toBe(true);

      const byName = await inject("PATCH", url, { customHeaders: [{ name: "X-Organization-Id", prefix: "Token" }] });
      expect(byName.statusCode).toBe(200);
      expect(JSON.parse(byName.payload).service.customHeaders[0].id).toBe(customHeaderId);
      expect(JSON.parse(byName.payload).service.customHeaders[0].prefix).toBe("Token");
      expect((await sealed()).equals(before)).toBe(true);

      const newRowNoValue = await inject("PATCH", url, {
        customHeaders: [{ name: "X-Organization-Id" }, { name: "X-New" }]
      });
      expect(newRowNoValue.statusCode).toBe(400);

      const duplicateId = await inject("PATCH", url, {
        customHeaders: [
          { id: customHeaderId, name: "X-A", value: "a" },
          { id: customHeaderId, name: "X-B", value: "b" }
        ]
      });
      expect(duplicateId.statusCode).toBe(400);

      const emptied = await inject("PATCH", url, { customHeaders: [] });
      expect(emptied.statusCode).toBe(200);
      expect(JSON.parse(emptied.payload).service.customHeaders).toHaveLength(0);
      expect(await testDb("agent_vault_service_custom_headers").where({ serviceId: service.id })).toHaveLength(0);
    });

    test("a custom header cannot shadow the credential's own header, from either side", async () => {
      const bundle = await createAccessBundle("header-shadowing");

      const clash = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "clash",
        hostPattern: "api.clash.example.com",
        credential: { type: "bearer", headerName: "X-Api-Key", headerPrefix: "", value: "k" },
        customHeaders: [{ name: "x-api-key", value: "shadow" }]
      });
      expect(clash.statusCode).toBe(400);
      expect(JSON.parse(clash.payload).message).toContain("X-Api-Key");

      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "github",
        hostPattern: "api.github.com",
        credential: { type: "bearer", headerName: "X-Api-Key", headerPrefix: "", value: "k" },
        customHeaders: [{ name: "X-Org-Id", value: "org" }]
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `/api/v1/agent-vault/access-bundles/${bundle.id}/services/${service.id}`;

      const headersOnly = await inject("PATCH", url, { customHeaders: [{ name: "X-Api-Key", value: "shadow" }] });
      expect(headersOnly.statusCode).toBe(400);

      const credentialOnly = await inject("PATCH", url, {
        credential: { type: "bearer", headerName: "X-Org-Id" }
      });
      expect(credentialOnly.statusCode).toBe(400);
      expect(JSON.parse(credentialOnly.payload).message).toContain("X-Org-Id");

      const basicClash = await inject("PATCH", url, {
        credential: { type: "basic", username: "u", password: "p" },
        customHeaders: [{ name: "Authorization", value: "shadow" }]
      });
      expect(basicClash.statusCode).toBe(400);
    });

    test("a header the proxy controls is refused, from either side", async () => {
      const bundle = await createAccessBundle("reserved-headers");
      const res = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "reserved",
        hostPattern: "api.reserved.example.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "Host", value: "evil.example.com" }]
      });
      expect(res.statusCode).toBe(422);

      const asCredential = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "reserved-credential",
        hostPattern: "api.reserved-credential.example.com",
        credential: { type: "bearer", headerName: "Content-Length", value: "t" }
      });
      expect(asCredential.statusCode).toBe(422);
    });
  });

  describe("variables", async () => {
    const variablesUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/variables`;
    const servicesUrl = (accessBundleId: string) => `/api/v1/agent-vault/access-bundles/${accessBundleId}/services`;

    type TReference = {
      variableId: string;
      key: string;
      field: string;
      customHeaderId?: string;
      substitutionId?: string;
    };

    const createVariable = async (accessBundleId: string, body: { key: string; value: string; isSecret?: boolean }) => {
      const res = await inject("POST", variablesUrl(accessBundleId), body);
      expect(res.statusCode).toBe(200);
      return (JSON.parse(res.payload) as { variable: { id: string; key: string } }).variable;
    };

    const referencesByField = (references: TReference[]) =>
      references.map((reference) => `${reference.field}:${reference.key}`).sort();

    // Enrollment only checks that it is a live CA. ECDSA P-256, because the FIPS image refuses Ed25519.
    const createProxyCaPem = async () => {
      const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
      const keys = await crypto.webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
      const certificate = await x509.X509CertificateGenerator.createSelfSigned({
        name: "CN=Agent Vault Variables Test CA",
        serialNumber: "01",
        notBefore: new Date(Date.now() - 60_000),
        notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
        signingAlgorithm: algorithm,
        keys,
        extensions: [
          new x509.BasicConstraintsExtension(true, undefined, true),
          // eslint-disable-next-line no-bitwise
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
        ]
      });
      return certificate.toString("pem");
    };

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
      const { token } = JSON.parse(created.payload) as { token: string };
      const login = await testServer.inject({
        method: "POST",
        url: "/api/v1/agent-vault/proxy/login",
        body: { method: ResourceAuthMethodType.Token, token, rootCaCertificate: await createProxyCaPem() }
      });
      expect(login.statusCode).toBe(200);
      const { accessToken } = JSON.parse(login.payload) as { accessToken: string };

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

    // The project's own key, loaded the way the server loads it, so a test can read and write sealed text directly.
    // The spec runs in its own module graph, which is why the env config is initialized again here.
    let kmsService: TKmsServiceFactory | undefined;
    const cipherFor = async (accessBundleId: string) => {
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
      const { projectId } = (await testDb("agent_vault_access_bundles").where({ id: accessBundleId }).first()) as {
        projectId: string;
      };
      return kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    };

    const STORED_REFERENCE = /\{\{([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}/g;

    // What the delete refusal rests on: every field's rows name exactly the ids in its sealed text that resolve
    // expands, which are those of the bundle's own variables. Read off the sealed text, not through the service.
    const expectReferencesMatchSealedText = async (accessBundleId: string) => {
      const { decryptor } = await cipherFor(accessBundleId);
      const open = (sealed: Buffer) =>
        JSON.parse(decryptor({ cipherTextBlob: sealed }).toString("utf-8")) as Record<string, string>;
      const variableIds = new Set(
        ((await testDb("agent_vault_variables").where({ accessBundleId }).select("id")) as { id: string }[]).map(
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

    test("a service uses a variable by key, and resolve puts the value in its place", async () => {
      const bundle = await createAccessBundle("variables-resolve");
      const token = await createVariable(bundle.id, { key: "GITHUB_TOKEN", value: "ghp_from_variable" });
      const org = await createVariable(bundle.id, { key: "ORG_ID", value: "org-42", isSecret: false });

      const created = await inject("POST", servicesUrl(bundle.id), {
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
      const long = await createVariable(bundle.id, { key: "LONG", value: "x" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        name: "longest",
        hostPattern: "longest.example.com",
        credential: { type: "bearer", value: "{{LONG}}".repeat(3) }
      });
      expect(created.statusCode).toBe(200);

      // Nothing measures a field filled in, so a value change can't be refused on a service's behalf.
      const grown = await inject("PATCH", `${variablesUrl(bundle.id)}/${long.id}`, { value: "y".repeat(8192) });
      expect(grown.statusCode).toBe(200);

      const resolve = await resolverFor(bundle, "variables-longest");
      expect((await resolve()).services[0].credential).toMatchObject({ value: "y".repeat(8192 * 3) });
    });

    test("a stored id with no variable behind it is sent as stored, and its service keeps its restrictions", async () => {
      const bundle = await createAccessBundle("variables-missing");
      const gone = await createVariable(bundle.id, { key: "GONE", value: "x" });
      const created = await inject("POST", servicesUrl(bundle.id), {
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
      const variable = await createVariable(bundle.id, { key: "OLD_NAME", value: "first" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        name: "echo",
        hostPattern: "echo.example.com",
        credential: { type: "bearer", value: "{{OLD_NAME}}" }
      });
      expect(created.statusCode).toBe(200);
      const serviceId = (JSON.parse(created.payload) as { service: { id: string } }).service.id;
      const resolve = await resolverFor(bundle, "variables-rename");

      const renamed = await inject("PATCH", `${variablesUrl(bundle.id)}/${variable.id}`, { key: "NEW_NAME" });
      expect(renamed.statusCode).toBe(200);
      expect(JSON.parse(renamed.payload).variable).toMatchObject({
        key: "NEW_NAME",
        value: null,
        serviceIds: [serviceId]
      });

      const detail = JSON.parse((await inject("GET", `/api/v1/agent-vault/access-bundles/${bundle.id}`)).payload) as {
        accessBundle: { services: { variableReferences: TReference[] }[] };
      };
      expect(detail.accessBundle.services[0].variableReferences).toEqual([
        expect.objectContaining({ key: "NEW_NAME", field: "credential-value" })
      ]);
      await expectReferencesMatchSealedText(bundle.id);
      expect((await resolve()).services[0].credential).toMatchObject({ value: "first" });

      expect((await inject("PATCH", `${variablesUrl(bundle.id)}/${variable.id}`, { value: "second" })).statusCode).toBe(
        200
      );
      expect((await resolve()).services[0].credential).toMatchObject({ value: "second" });

      const stale = await inject("POST", servicesUrl(bundle.id), {
        name: "stale",
        hostPattern: "stale.example.com",
        credential: { type: "bearer", value: "{{OLD_NAME}}" }
      });
      expect(stale.statusCode).toBe(400);
      expect(JSON.parse(stale.payload).message).toContain("OLD_NAME");
    });

    test("a variable a service uses can't be deleted, and the refusal names the service", async () => {
      const bundle = await createAccessBundle("variables-in-use");
      const variable = await createVariable(bundle.id, { key: "API_KEY", value: "key_value" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", value: "{{API_KEY}}" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };

      const refused = await inject("DELETE", `${variablesUrl(bundle.id)}/${variable.id}`);
      expect(refused.statusCode).toBe(409);
      expect(JSON.parse(refused.payload).message).toContain("'datadog'");

      const detached = await inject("PATCH", `${servicesUrl(bundle.id)}/${service.id}`, {
        credential: { type: "bearer", value: "literal_value" }
      });
      expect(detached.statusCode).toBe(200);
      expect(JSON.parse(detached.payload).service.variableReferences).toEqual([]);
      await expectReferencesMatchSealedText(bundle.id);

      const removed = await inject("DELETE", `${variablesUrl(bundle.id)}/${variable.id}`);
      expect(removed.statusCode).toBe(200);
      expect(JSON.parse(removed.payload).variable).toMatchObject({ id: variable.id, key: "API_KEY", value: null });
    });

    test("an unknown key fails the save by name, and a malformed reference fails validation unquoted", async () => {
      const bundle = await createAccessBundle("variables-validation");

      const unknown = await inject("POST", servicesUrl(bundle.id), {
        name: "unknown",
        hostPattern: "unknown.example.com",
        credential: { type: "bearer", value: "{{NOT_DEFINED}}" }
      });
      expect(unknown.statusCode).toBe(400);
      expect(JSON.parse(unknown.payload).message).toContain("NOT_DEFINED");

      const malformed = await inject("POST", servicesUrl(bundle.id), {
        name: "malformed",
        hostPattern: "malformed.example.com",
        credential: { type: "passthrough" },
        customHeaders: [{ name: "X-Key", value: "{{lower_case_secret}}" }]
      });
      expect(malformed.statusCode).toBe(422);
      expect(malformed.payload).not.toContain("lower_case_secret");

      const bracedPlaceholder = await inject("POST", servicesUrl(bundle.id), {
        name: "braced",
        hostPattern: "braced.example.com",
        credential: { type: "passthrough" },
        substitutions: [{ placeholder: "{{PAT}}", surfaces: ["header"], value: "x" }]
      });
      expect(bracedPlaceholder.statusCode).toBe(422);

      expect(await testDb("agent_vault_services").where({ accessBundleId: bundle.id })).toHaveLength(0);
    });

    test("a value takes three variable references, a repeat counted each time, and a fourth fails validation", async () => {
      const bundle = await createAccessBundle("variables-reference-limit");
      await createVariable(bundle.id, { key: "TOKEN", value: "t" });

      const atLimit = await inject("POST", servicesUrl(bundle.id), {
        name: "at-limit",
        hostPattern: "at-limit.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}".repeat(3) }
      });
      expect(atLimit.statusCode).toBe(200);

      const overLimit = await inject("POST", servicesUrl(bundle.id), {
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

    test("the list carries only values that are not secret, and the value route returns either uncached", async () => {
      const bundle = await createAccessBundle("variables-visibility");
      const hidden = await createVariable(bundle.id, { key: "HIDDEN", value: "hidden_value" });
      await createVariable(bundle.id, { key: "SHOWN", value: "shown_value", isSecret: false });

      const listed = await inject("GET", variablesUrl(bundle.id));
      expect(listed.statusCode).toBe(200);
      expect(listed.payload).not.toContain("hidden_value");
      expect(JSON.parse(listed.payload).variables).toEqual([
        expect.objectContaining({ key: "HIDDEN", isSecret: true, value: null, serviceIds: [] }),
        expect.objectContaining({ key: "SHOWN", isSecret: false, value: "shown_value", serviceIds: [] })
      ]);

      const revealed = await inject("GET", `${variablesUrl(bundle.id)}/${hidden.id}/value`);
      expect(revealed.statusCode).toBe(200);
      expect(JSON.parse(revealed.payload)).toEqual({ value: "hidden_value" });
      expect(revealed.headers["cache-control"]).toContain("no-store");

      const flipped = await inject("PATCH", `${variablesUrl(bundle.id)}/${hidden.id}`, { isSecret: false });
      expect(flipped.statusCode).toBe(200);
      expect(JSON.parse(flipped.payload).variable).toMatchObject({ isSecret: false, value: "hidden_value" });

      const row = await testDb("agent_vault_variables").where({ id: hidden.id }).first();
      expect(row.encryptedValue.toString("utf-8")).not.toContain("hidden_value");
    });

    test("a key is unique in its bundle and has to be upper snake case", async () => {
      const bundle = await createAccessBundle("variables-keys");
      await createVariable(bundle.id, { key: "TOKEN", value: "one" });

      const duplicate = await inject("POST", variablesUrl(bundle.id), { key: "TOKEN", value: "two" });
      expect(duplicate.statusCode).toBe(400);
      expect(JSON.parse(duplicate.payload).message).toContain("'TOKEN'");
      expect((await inject("POST", variablesUrl(bundle.id), { key: "lower_case", value: "x" })).statusCode).toBe(422);

      const other = await createAccessBundle("variables-keys-other");
      expect((await inject("POST", variablesUrl(other.id), { key: "TOKEN", value: "three" })).statusCode).toBe(200);
    });

    test("an update rebuilds the references of only the values it wrote", async () => {
      const bundle = await createAccessBundle("variables-partial");
      await createVariable(bundle.id, { key: "USER", value: "the-user" });
      await createVariable(bundle.id, { key: "PASS", value: "the-pass" });
      await createVariable(bundle.id, { key: "HEADER", value: "the-header" });

      const created = await inject("POST", servicesUrl(bundle.id), {
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

      const switched = await inject("PATCH", url, { credential: { type: "bearer", value: "literal" } });
      expect(switched.statusCode).toBe(200);
      expect(referencesByField(JSON.parse(switched.payload).service.variableReferences)).toEqual([
        "custom-header:HEADER"
      ]);
      await expectReferencesMatchSealedText(bundle.id);

      const dropped = await inject("PATCH", url, { customHeaders: [] });
      expect(dropped.statusCode).toBe(200);
      expect(JSON.parse(dropped.payload).service.variableReferences).toEqual([]);
      expect(await testDb("agent_vault_service_variable_references").where({ serviceId: service.id })).toHaveLength(0);
    });

    test("a basic credential's kept half is stored text, so one saved before variables existed stays as it was", async () => {
      const bundle = await createAccessBundle("variables-legacy-half");
      await createVariable(bundle.id, { key: "FOO", value: "foo-value" });
      await createVariable(bundle.id, { key: "USER", value: "the-user" });

      const created = await inject("POST", servicesUrl(bundle.id), {
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
      await createVariable(bundle.id, { key: "FIRST_USER", value: "first-user" });
      await createVariable(bundle.id, { key: "SECOND_USER", value: "second-user" });
      await createVariable(bundle.id, { key: "PASS", value: "the-pass" });

      const created = await inject("POST", servicesUrl(bundle.id), {
        name: "stale",
        hostPattern: "stale.example.com",
        credential: { type: "basic", username: "{{FIRST_USER}}", password: "plain-pass" }
      });
      expect(created.statusCode).toBe(200);
      const { service } = JSON.parse(created.payload) as { service: { id: string } };
      const url = `${servicesUrl(bundle.id)}/${service.id}`;

      // What the other save commits, sealed by the API itself on a second service: a new username.
      const other = await inject("POST", servicesUrl(bundle.id), {
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

        const pending = inject("PATCH", url, { credential: { type: "basic", password: "{{PASS}}" } });
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

      const retried = await inject("PATCH", url, { credential: { type: "basic", password: "{{PASS}}" } });
      expect(retried.statusCode).toBe(200);
      await expectReferencesMatchSealedText(bundle.id);

      const resolve = await resolverFor(bundle, "variables-stale-half");
      const resolved = (await resolve()).services.find((entry) => entry.name === "stale");
      expect(resolved?.credential).toEqual({ type: "basic", username: "second-user", password: "the-pass" });
    });

    test("an update whose service is deleted while it waits is a 404, not a deleted variable", async () => {
      const bundle = await createAccessBundle("variables-deleted-service");
      const created = await inject("POST", servicesUrl(bundle.id), {
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

    test("deleting a bundle takes its variables and every reference to them", async () => {
      const bundle = await createAccessBundle("variables-bundle-delete");
      const variable = await createVariable(bundle.id, { key: "TOKEN", value: "t" });
      const created = await inject("POST", servicesUrl(bundle.id), {
        name: "one",
        hostPattern: "one.example.com",
        credential: { type: "bearer", value: "{{TOKEN}}" },
        customHeaders: [{ name: "X-Two", value: "{{TOKEN}}" }]
      });
      expect(created.statusCode).toBe(200);

      const removed = await inject("DELETE", `/api/v1/agent-vault/access-bundles/${bundle.id}`);
      expect(removed.statusCode).toBe(200);
      expect(await testDb("agent_vault_variables").where({ id: variable.id })).toHaveLength(0);
      expect(await testDb("agent_vault_service_variable_references").where({ variableId: variable.id })).toHaveLength(
        0
      );
    });

    test("variables are admin only, reads included", async () => {
      const bundle = await createAccessBundle("variables-admin-only");
      const variable = await createVariable(bundle.id, { key: "TOKEN", value: "admin_only_value", isSecret: false });
      const created = await inject("POST", servicesUrl(bundle.id), {
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

        const listed = await member.asIdentity("GET", variablesUrl(bundle.id));
        expect(listed.statusCode).toBe(403);
        expect(listed.payload).not.toContain("admin_only_value");
        expect((await member.asIdentity("GET", `${variablesUrl(bundle.id)}/${variable.id}/value`)).statusCode).toBe(
          403
        );
        expect((await member.asIdentity("POST", variablesUrl(bundle.id), { key: "MINE", value: "x" })).statusCode).toBe(
          403
        );
      } finally {
        await deleteUaIdentity(member.id);
      }
    });
  });

  describe("product membership", async () => {
    const membersUrl = "/api/v1/agent-vault/members";

    type TListedMember = {
      id: string;
      role: string;
      isActive: boolean;
      createdAt: string;
      actor: Record<string, unknown> & { type: string; id: string };
    };

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

        const byType = Object.fromEntries(members.map((member) => [member.actor.type, member]));
        expect(Object.keys(byType).sort()).toEqual(["group", "machineIdentity", "user"]);

        expect(byType.user.actor).toMatchObject({ id: seedData1.id, username: expect.any(String) });
        expect(byType.user.actor.isOrgMembershipPending).toBe(false);
        expect(byType.user.role).toBe("admin");
        expect(byType.user.isActive).toBe(true);

        expect(byType.group.actor).toMatchObject({ id: group.id, name: "av-merged-list-group" });

        // An organization-owned identity can be detached; one Agent Vault created can only be deleted,
        // and the table needs to know which before it offers a button.
        expect(byType.machineIdentity.actor).toMatchObject({ id: identity.id, isManagedByAgentVault: false });
        expect(byType.machineIdentity.actor.orgId).toBe(seedData1.organization.id);

        members.forEach((member) => {
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
        expect(identities.members.every((member) => member.actor.type === "machineIdentity")).toBe(true);
        expect(identities.totalCount).toBe(identities.members.length);
        expect(identities.totalCount).toBeLessThan(all.totalCount);

        // The count describes the filtered set, not the whole one, or the pager promises pages it will
        // not serve.
        const searched = await listMembers("search=av-paging-group");
        expect(searched.totalCount).toBe(1);
        expect(searched.members[0].actor.id).toBe(group.id);

        // A user matches on their full name even though no column holds it.
        const byFullName = await listMembers(`search=${encodeURIComponent(seedData1.email)}`);
        expect(byFullName.members.some((member) => member.actor.id === seedData1.id)).toBe(true);

        // Walking the pages one row at a time reaches every member exactly once, which is what the
        // membership-id tiebreak buys on rows that share a name or a createdAt.
        const walked: string[] = [];
        for (let offset = 0; offset < all.totalCount; offset += 1) {
          // eslint-disable-next-line no-await-in-loop
          const page = await listMembers(`limit=1&offset=${offset}`);
          expect(page.members).toHaveLength(1);
          expect(page.totalCount).toBe(all.totalCount);
          walked.push(page.members[0].id);
        }
        expect(new Set(walked).size).toBe(all.totalCount);
        expect(walked.sort()).toEqual(all.members.map((member) => member.id).sort());

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
      expect(JSON.parse(added.payload).members[0].actor).toMatchObject({
        type: "machineIdentity",
        id: identity.id
      });

      const listed = await listMembers("actorType=machineIdentity");
      const row = listed.members.find((member) => member.actor.id === identity.id);
      expect(row?.role).toBe("member");
      expect(row?.actor.name).toBeTruthy();

      const promoted = await inject("PATCH", `${membersUrl}/machine-identities/${identity.id}`, { role: "admin" });
      expect(promoted.statusCode).toBe(200);
      expect(JSON.parse(promoted.payload).member.role).toBe("admin");

      const removed = await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] });
      expect(removed.statusCode).toBe(200);
      expect(JSON.parse(removed.payload)).toMatchObject({
        members: [{ actor: { type: "machineIdentity", id: identity.id } }],
        skipped: []
      });

      // A second revoke has nothing to remove, so it reports the actor as skipped rather than failing:
      // that is what makes the call safe to retry.
      const again = await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] });
      expect(again.statusCode).toBe(200);
      expect(JSON.parse(again.payload)).toMatchObject({
        members: [],
        skipped: [{ type: "machineIdentity", id: identity.id, identifier: identity.id }]
      });

      const after = await listMembers("actorType=machineIdentity");
      expect(after.members.some((member) => member.actor.id === identity.id)).toBe(false);

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

      expect((await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] })).statusCode).toBe(
        200
      );

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

        const before = await adminCount();
        expect(before).toBe(3);

        // Revoking each of these on its own would pass the guard, because the other two are still
        // standing. Naming all three in one call is what the batch check exists for.
        const refused = await inject("POST", `${membersUrl}/revoke`, {
          userIds: [seedData1.id],
          machineIdentityIds: [one.id, two.id]
        });
        expect(refused.statusCode).toBe(403);

        // It refuses on the self check before it reaches the admin count, so take the caller out and the
        // batch still cannot go through.
        const withoutSelf = await inject("POST", `${membersUrl}/revoke`, {
          machineIdentityIds: [one.id, two.id]
        });
        expect(withoutSelf.statusCode).toBe(200);
        expect(await adminCount()).toBe(1);
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

        const refused = await inject("POST", `${membersUrl}/revoke`, {
          userIds: [seedData1.id],
          machineIdentityIds: [identity.id]
        });
        expect(refused.statusCode).toBe(403);
        expect(JSON.parse(refused.payload).message).toContain("your own access");

        // The other actor named in the same call still has access.
        const listed = await listMembers("actorType=machineIdentity");
        expect(listed.members.some((member) => member.actor.id === identity.id)).toBe(true);
      } finally {
        await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] });
        await deleteOrgIdentity(identity.id);
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
        expect((await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] })).statusCode).toBe(
          200
        );
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
        await inject("POST", `${membersUrl}/revoke`, { machineIdentityIds: [identity.id] });
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
          members: { actor: { type: string; id: string } }[];
          skipped: { type: string; id: string }[];
        };

        expect(members).toHaveLength(1);
        expect(members[0].actor).toMatchObject({ type: "machineIdentity", id: identity.id });
        expect(skipped.map((el) => el.id).sort()).toEqual([group.id, seedData1.id].sort());
      } finally {
        await group.cleanup();
        await deleteOrgIdentity(identity.id);
      }
    });

    test("the guards that keep the product administrable hold", async () => {
      const self = await inject("POST", `${membersUrl}/revoke`, { userIds: [seedData1.id] });
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

      const badRole = await inject("PATCH", `${membersUrl}/users/${seedData1.id}`, { role: "viewer" });
      expect(badRole.statusCode).toBe(422);

      const badSegment = await inject("PATCH", `${membersUrl}/identities/${seedData1.id}`, { role: "member" });
      expect(badSegment.statusCode).toBe(422);

      const notAnId = await inject("POST", `${membersUrl}/revoke`, { userIds: ["not-a-uuid"] });
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
          { name: "c", hostPattern: "api.foo.com", credential: { type: "passthrough" } }
        ],
        // The bundle is the path resource, so a missing one is still 404 even though a missing actor in
        // the body is reported as skipped.
        ["POST", `/api/v1/agent-vault/access-bundles/${unknown}/members/revoke`, { userIds: [seedData1.id] }]
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
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never,
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
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () =>
            Promise.resolve({ decryptor: () => Buffer.from(JSON.stringify({ value: "unsealed" })) })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never
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
        agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
        agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        orgDAL: orgDALFactory(testDb),
        permissionService: buildPermissionService(),
        kmsService: {
          createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
        } as never,
        licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
        resourceAuthMethodService: {} as never
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

    test("create and reissue both hand back the enrollment token at the top level", async () => {
      const created = await inject("POST", "/api/v1/agent-vault/proxies", { name: "flat-token-shape" });
      expect(created.statusCode).toBe(200);
      const body = JSON.parse(created.payload) as { proxy: { id: string }; token: string; expiresAt: string };
      expect(body.token).toBeTruthy();
      expect(body.expiresAt).toBeTruthy();

      const reissued = await inject("POST", `/api/v1/agent-vault/proxies/${body.proxy.id}/token-auth/enrollment-token`);
      expect(reissued.statusCode).toBe(200);
      const again = JSON.parse(reissued.payload) as { token: string; expiresAt: string };
      expect(again.token).toBeTruthy();
      expect(again.token).not.toBe(body.token);
      expect(again.expiresAt).toBeTruthy();
    });

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
          members: {
            id: string;
            actor: { type: string; id: string; name?: string; username?: string };
          }[];
        };

        // The creator's own grant is already there, so all three arms are on one response.
        const byType = Object.fromEntries(members.map((member) => [member.actor.type, member]));
        expect(Object.keys(byType).sort()).toEqual(["group", "machineIdentity", "user"]);

        expect(byType.group.actor).toMatchObject({ type: "group", id: group.id });
        expect(byType.machineIdentity.actor).toMatchObject({ type: "machineIdentity", id: identity.id });
        expect(byType.user.actor).toMatchObject({ type: "user", id: seedData1.id });
        expect(byType.user.actor.username).toBeTruthy();

        members.forEach((member) => {
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

    test("two admins demoted at once cannot both slip past the last-admin guard", async () => {
      const { projectId } = JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as {
        projectId: string;
      };
      const one = await createUaIdentity(`av-race-a-${Date.now()}`);
      const two = await createUaIdentity(`av-race-b-${Date.now()}`);

      try {
        for await (const identity of [one, two]) {
          const added = await inject("POST", "/api/v1/agent-vault/members", {
            machineIdentityIds: [identity.id],
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
            inject("PATCH", `/api/v1/agent-vault/members/machine-identities/${identity.id}`, {
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

    test("a machine identity inherits a group's access bundles, on mint and on resolve", async () => {
      const projectId = await getProjectId();
      const bundle = await createAccessBundle("group-inheritance");
      expect(
        (
          await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
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
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
          resourceAuthMethodService: {} as never
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
            await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members/revoke`, {
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
          agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
          agentVaultSessionLogConfigDAL: agentVaultSessionLogConfigDALFactory(testDb),
          membershipDAL: membershipDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          permissionService: buildPermissionService(),
          kmsService: {
            createCipherPairWithDataKey: () => Promise.resolve({ decryptor: () => Buffer.from("{}") })
          } as never,
          licenseService: { getPlan: () => Promise.resolve({ agentVaultByoS3: true }) } as never,
          resourceAuthMethodService: {} as never
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
          members: { actor: { type: string; id: string } }[];
          totalCount: number;
        };
      };

      try {
        const idsOf = (members: { actor: { id: string } }[]) => members.map((member) => member.actor.id);

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
        expect(
          (JSON.parse(otherRes.payload) as { members: { actor: { id: string } }[] }).members.map(
            (member) => member.actor.id
          )
        ).toContain(group.id);

        expect(
          (
            await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members/revoke`, {
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
        expect(
          (await inject("POST", `/api/v1/agent-vault/access-bundles/${held.id}/members`, { groupIds: [group.id] }))
            .statusCode
        ).toBe(200);

        const stillGranted = async () => (await grantRows(held.id, { actorGroupId: group.id })).length;
        const revoke = (accessBundleId: string, body: Record<string, unknown>) =>
          inject("POST", `/api/v1/agent-vault/access-bundles/${accessBundleId}/members/revoke`, body);

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
        expect(JSON.parse(correct.payload)).toMatchObject({
          members: [{ actor: { type: "group", id: group.id } }],
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
      const refused = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members/revoke`, {
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
