import { randomUUID } from "node:crypto";

import { createMongoAbility, ForbiddenError, MongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  AccessScope,
  OrgMembershipStatus,
  ProjectType,
  TableName,
  TDynamicSecretLeasesInsert,
  TDynamicSecretsInsert,
  TIdentitiesInsert,
  TMembershipsInsert,
  TOrganizationsInsert,
  TProjectEnvironmentsInsert,
  TProjectsInsert,
  TSecretFoldersInsert,
  TUsersInsert
} from "@app/db/schemas";
import { dynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory } from "@app/ee/services/insights/insights-service";
import { TOrgInsightsDTO } from "@app/ee/services/insights/insights-types";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { orgDALFactory } from "@app/services/org/org-dal";

import {
  passThroughKeyStore,
  projectScopedInsightsDepStubs,
  unreachableGetProjectPermission
} from "./testUtils/insights";

declare const testDb: Knex;

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const ids = {
  // users: only uCounted satisfies accepted + active + non-ghost
  uCounted: randomUUID(),
  uGhost: randomUUID(),
  uInvited: randomUUID(),
  uDeactivated: randomUUID(),
  // identities: only the two with an org-scoped membership count
  iOrgA: randomUUID(),
  iOrgB: randomUUID(),
  iProjectOnly: randomUUID()
};

// One project per lease-visibility rule, so each filter in countLeasesForOrg is exercised
// independently. Only `counted` may contribute.
const scopes = {
  counted: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), dynamicSecretId: randomUUID() },
  otherProductType: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    dynamicSecretId: randomUUID()
  },
  deletedProject: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    dynamicSecretId: randomUUID()
  },
  deletedEnvironment: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    dynamicSecretId: randomUUID()
  },
  otherOrg: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), dynamicSecretId: randomUUID() }
};

const scopeList = Object.values(scopes);

const buildPermission = (canRead: boolean): MongoAbility<OrgPermissionSet> =>
  createMongoAbility<OrgPermissionSet>(
    canRead
      ? [
          {
            action: OrgPermissionSecretsManagementInsightsActions.Read,
            subject: OrgPermissionSubjects.SecretsManagementInsights
          }
        ]
      : []
  );

let canReadInsights = true;
let planHasInsights = true;

const permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission"> = {
  ...unreachableGetProjectPermission,
  getOrgPermission: async () => ({
    permission: buildPermission(canReadInsights),
    memberships: [],
    hasRole: () => false
  })
};

const licenseService = {
  getPlan: async () => ({ secretAccessInsights: planHasInsights }) as unknown as TFeatureSet
};

const insightsService = insightsServiceFactory({
  ...projectScopedInsightsDepStubs,
  permissionService,
  licenseService,
  orgDAL: orgDALFactory(testDb),
  identityOrgMembershipDAL: identityOrgDALFactory(testDb),
  dynamicSecretLeaseDAL: dynamicSecretLeaseDALFactory(testDb),
  insightsDAL: insightsDALFactory(testDb),
  keyStore: passThroughKeyStore
});

const actor = (orgId: string): TOrgInsightsDTO => ({
  actor: ActorType.USER,
  actorId: ids.uCounted,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: orgId,
  orgId
});

const lease = (dynamicSecretId: string): TDynamicSecretLeasesInsert & { id: string } => {
  const id = randomUUID();
  return {
    id,
    version: 1,
    externalEntityId: `ext-${id}`,
    expireAt: new Date(Date.now() + 60 * 60 * 1000),
    dynamicSecretId
  };
};

describe("insights secrets usage insights", () => {
  beforeAll(async () => {
    // The generated *Insert types omit the immutable `id` key, and TS's excess-property check only
    // fires on fresh object literals, so fixtures are held in typed consts to set explicit ids.
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ORG_ID, name: `insights-${suffix}`, slug: `insights-${suffix}` },
      { id: OTHER_ORG_ID, name: `insights-other-${suffix}`, slug: `insights-other-${suffix}` }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    const userRows: (TUsersInsert & { id: string })[] = [
      { id: ids.uCounted, username: `counted-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uGhost, username: `ghost-${suffix}`, isAccepted: true, isGhost: true },
      { id: ids.uInvited, username: `invited-${suffix}`, isAccepted: false, isGhost: false },
      { id: ids.uDeactivated, username: `deactivated-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const identityRows: (TIdentitiesInsert & { id: string })[] = [
      { id: ids.iOrgA, name: `identity-a-${suffix}`, orgId: ORG_ID },
      { id: ids.iOrgB, name: `identity-b-${suffix}`, orgId: ORG_ID },
      { id: ids.iProjectOnly, name: `identity-project-${suffix}`, orgId: ORG_ID }
    ];
    await testDb(TableName.Identity).insert(identityRows);

    const projectRows: (TProjectsInsert & { id: string })[] = [
      {
        id: scopes.counted.projectId,
        name: `sm-${suffix}`,
        slug: `sm-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager
      },
      {
        id: scopes.otherProductType.projectId,
        name: `pam-${suffix}`,
        slug: `pam-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.PAM
      },
      {
        id: scopes.deletedProject.projectId,
        name: `sm-del-${suffix}`,
        slug: `sm-del-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager,
        deleteAfter: new Date()
      },
      {
        id: scopes.deletedEnvironment.projectId,
        name: `sm-del-env-${suffix}`,
        slug: `sm-del-env-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager
      },
      {
        id: scopes.otherOrg.projectId,
        name: `sm-other-org-${suffix}`,
        slug: `sm-other-org-${suffix}`,
        orgId: OTHER_ORG_ID,
        type: ProjectType.SecretManager
      }
    ];
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = scopeList.map((scope, index) => ({
      id: scope.envId,
      name: "Development",
      slug: "dev",
      position: index + 1,
      projectId: scope.projectId,
      ...(scope === scopes.deletedEnvironment ? { deleteAfter: new Date() } : {})
    }));
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = scopeList.map((scope) => ({
      id: scope.folderId,
      name: "root",
      envId: scope.envId,
      parentId: null
    }));
    await testDb(TableName.SecretFolder).insert(folderRows);

    const dynamicSecretRows: (TDynamicSecretsInsert & { id: string })[] = scopeList.map((scope) => ({
      id: scope.dynamicSecretId,
      name: `dyn-${scope.folderId}`,
      version: 1,
      type: "sql-database",
      defaultTTL: "1h",
      folderId: scope.folderId,
      encryptedInput: Buffer.from("{}")
    }));
    await testDb(TableName.DynamicSecret).insert(dynamicSecretRows);

    const membershipRows: (TMembershipsInsert & { id: string })[] = [
      // Users.
      {
        id: randomUUID(),
        scope: AccessScope.Organization,
        scopeOrgId: ORG_ID,
        actorUserId: ids.uCounted,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      },
      {
        id: randomUUID(),
        scope: AccessScope.Organization,
        scopeOrgId: ORG_ID,
        actorUserId: ids.uGhost,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      },
      {
        id: randomUUID(),
        scope: AccessScope.Organization,
        scopeOrgId: ORG_ID,
        actorUserId: ids.uInvited,
        status: OrgMembershipStatus.Invited,
        isActive: true
      },
      {
        id: randomUUID(),
        scope: AccessScope.Organization,
        scopeOrgId: ORG_ID,
        actorUserId: ids.uDeactivated,
        status: OrgMembershipStatus.Accepted,
        isActive: false
      },
      // Identities.
      { id: randomUUID(), scope: AccessScope.Organization, scopeOrgId: ORG_ID, actorIdentityId: ids.iOrgA },
      { id: randomUUID(), scope: AccessScope.Organization, scopeOrgId: ORG_ID, actorIdentityId: ids.iOrgB },
      {
        id: randomUUID(),
        scope: AccessScope.Project,
        scopeOrgId: ORG_ID,
        scopeProjectId: scopes.counted.projectId,
        actorIdentityId: ids.iProjectOnly
      }
    ];
    await testDb(TableName.Membership).insert(membershipRows);

    // Two leases in the only visible scope, one in each scope that must be filtered out.
    await testDb(TableName.DynamicSecretLease).insert([
      lease(scopes.counted.dynamicSecretId),
      lease(scopes.counted.dynamicSecretId),
      lease(scopes.otherProductType.dynamicSecretId),
      lease(scopes.deletedProject.dynamicSecretId),
      lease(scopes.deletedEnvironment.dynamicSecretId),
      lease(scopes.otherOrg.dynamicSecretId)
    ]);
  });

  afterAll(async () => {
    const orgIds = [ORG_ID, OTHER_ORG_ID];
    await testDb(TableName.DynamicSecretLease)
      .whereIn(
        "dynamicSecretId",
        scopeList.map((scope) => scope.dynamicSecretId)
      )
      .delete();
    await testDb(TableName.DynamicSecret)
      .whereIn(
        "id",
        scopeList.map((scope) => scope.dynamicSecretId)
      )
      .delete();
    await testDb(TableName.SecretFolder)
      .whereIn(
        "id",
        scopeList.map((scope) => scope.folderId)
      )
      .delete();
    await testDb(TableName.Environment)
      .whereIn(
        "id",
        scopeList.map((scope) => scope.envId)
      )
      .delete();
    await testDb(TableName.Membership).whereIn("scopeOrgId", orgIds).delete();
    await testDb(TableName.Project).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Identity).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Users).whereIn("id", Object.values(ids)).delete();
    await testDb(TableName.Organization).whereIn("id", orgIds).delete();
  });

  test("returns the three usage counts for the organization", async () => {
    const insights = await insightsService.getSecretsUsageInsights(actor(ORG_ID));

    // uCounted only: the ghost, the invited and the deactivated membership are all excluded.
    expect(insights.users).toBe(1);
    // iOrgA + iOrgB: iProjectOnly has no org-scoped membership.
    expect(insights.identities).toBe(2);
    // The two leases in the live SecretManager project. The PAM project, the soft-deleted project,
    // the soft-deleted environment and the other org each contribute nothing.
    expect(insights.activeLeases).toBe(2);
  });

  test("activeLeases drops when a lease is revoked", async () => {
    const revoked = await testDb(TableName.DynamicSecretLease)
      .where({ dynamicSecretId: scopes.counted.dynamicSecretId })
      .first();
    expect(revoked).toBeDefined();

    // Revocation hard-deletes the row, which is why the metric is active leases rather than
    // every lease ever created.
    await testDb(TableName.DynamicSecretLease).where({ id: revoked!.id }).delete();

    const insights = await insightsService.getSecretsUsageInsights(actor(ORG_ID));
    expect(insights.activeLeases).toBe(1);

    await testDb(TableName.DynamicSecretLease).insert(lease(scopes.counted.dynamicSecretId));
    expect((await insightsService.getSecretsUsageInsights(actor(ORG_ID))).activeLeases).toBe(2);
  });

  test("an organization with no resources reports zeroes", async () => {
    const insights = await insightsService.getSecretsUsageInsights(actor(randomUUID()));
    expect(insights).toEqual({ activeLeases: 0, users: 0, identities: 0 });
  });

  test("throws when the actor cannot read secrets management insights", async () => {
    canReadInsights = false;
    try {
      await expect(insightsService.getSecretsUsageInsights(actor(ORG_ID))).rejects.toBeInstanceOf(
        ForbiddenError
      );
    } finally {
      canReadInsights = true;
    }
  });

  test("throws when the plan does not include secret access insights", async () => {
    planHasInsights = false;
    try {
      await expect(insightsService.getSecretsUsageInsights(actor(ORG_ID))).rejects.toThrow(/Upgrade your plan/);
    } finally {
      planHasInsights = true;
    }
  });
});
