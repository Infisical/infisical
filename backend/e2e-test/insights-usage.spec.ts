import { randomUUID } from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  AccessScope,
  OrgMembershipStatus,
  ProjectType,
  ProjectVersion,
  TableName,
  TDynamicSecretLeasesInsert,
  TDynamicSecretsInsert,
  TGroupsInsert,
  TIdentitiesInsert,
  TIdentityGroupMembershipInsert,
  TMembershipsInsert,
  TOrganizationsInsert,
  TProjectEnvironmentsInsert,
  TProjectsInsert,
  TSecretFoldersInsert,
  TUserGroupMembershipInsert,
  TUsersInsert
} from "@app/db/schemas";
import { dynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory } from "@app/ee/services/insights/insights-service";
import { TOrgInsightsDTO } from "@app/ee/services/insights/insights-types";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { orgDALFactory } from "@app/services/org/org-dal";

import { buildOrgInsightsGateStubs, passThroughKeyStore, projectScopedInsightsDepStubs } from "./testUtils/insights";

declare const testDb: Knex;

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

// Users and identities are counted from memberships of live SecretManager V3 projects, so every actor
// below is placed to exercise exactly one rule of that count.
const ids = {
  // Counted: a direct membership, and one that only exists through a group.
  uDirect: randomUUID(),
  uViaGroup: randomUUID(),
  // Excluded, one user per filter.
  uGhost: randomUUID(),
  uInactive: randomUUID(),
  uOrgScopeOnly: randomUUID(),
  uOtherProductType: randomUUID(),
  uDeletedProject: randomUUID(),
  uLegacyProject: randomUUID(),
  uOtherOrg: randomUUID(),
  // Identities mirror the user cases; the identity count has no ghost equivalent.
  iDirect: randomUUID(),
  iViaGroup: randomUUID(),
  iInactive: randomUUID(),
  iOrgScopeOnly: randomUUID(),
  iOtherProductType: randomUUID(),
  iDeletedProject: randomUUID(),
  iLegacyProject: randomUUID(),
  iOtherOrg: randomUUID()
};

const groupIds = {
  users: randomUUID(),
  identities: randomUUID()
};

// One project per visibility rule, so each filter is exercised independently. Only `counted` may
// contribute to any of the three metrics.
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
  legacyVersion: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    dynamicSecretId: randomUUID()
  },
  otherOrg: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), dynamicSecretId: randomUUID() }
};

const scopeList = Object.values(scopes);

const { permissionService, licenseService, setCanReadInsights, setPlanHasInsights } = buildOrgInsightsGateStubs();

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
  actorId: ids.uDirect,
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

type TActorRef = Pick<TMembershipsInsert, "actorUserId" | "actorIdentityId" | "actorGroupId">;

const projectMembership = (
  projectId: string,
  actorRef: TActorRef,
  overrides: Partial<TMembershipsInsert> = {}
): TMembershipsInsert & { id: string } => ({
  id: randomUUID(),
  scope: AccessScope.Project,
  scopeOrgId: ORG_ID,
  scopeProjectId: projectId,
  isActive: true,
  ...actorRef,
  ...overrides
});

const orgMembership = (actorRef: TActorRef): TMembershipsInsert & { id: string } => ({
  id: randomUUID(),
  scope: AccessScope.Organization,
  scopeOrgId: ORG_ID,
  status: OrgMembershipStatus.Accepted,
  isActive: true,
  ...actorRef
});

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
      { id: ids.uDirect, username: `direct-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uViaGroup, username: `via-group-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uGhost, username: `ghost-${suffix}`, isAccepted: true, isGhost: true },
      { id: ids.uInactive, username: `inactive-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uOrgScopeOnly, username: `org-scope-only-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uOtherProductType, username: `other-product-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uDeletedProject, username: `deleted-project-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uLegacyProject, username: `legacy-project-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.uOtherOrg, username: `other-org-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const identityRows: (TIdentitiesInsert & { id: string })[] = [
      { id: ids.iDirect, name: `identity-direct-${suffix}`, orgId: ORG_ID },
      { id: ids.iViaGroup, name: `identity-via-group-${suffix}`, orgId: ORG_ID },
      { id: ids.iInactive, name: `identity-inactive-${suffix}`, orgId: ORG_ID },
      { id: ids.iOrgScopeOnly, name: `identity-org-scope-${suffix}`, orgId: ORG_ID },
      { id: ids.iOtherProductType, name: `identity-other-product-${suffix}`, orgId: ORG_ID },
      { id: ids.iDeletedProject, name: `identity-deleted-project-${suffix}`, orgId: ORG_ID },
      { id: ids.iLegacyProject, name: `identity-legacy-project-${suffix}`, orgId: ORG_ID },
      { id: ids.iOtherOrg, name: `identity-other-org-${suffix}`, orgId: OTHER_ORG_ID }
    ];
    await testDb(TableName.Identity).insert(identityRows);

    // Every project other than `legacyVersion` is V3, so each exclusion below is caused by the one
    // rule it is named for rather than by the version filter.
    const projectRows: (TProjectsInsert & { id: string })[] = [
      {
        id: scopes.counted.projectId,
        name: `sm-${suffix}`,
        slug: `sm-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V3
      },
      {
        id: scopes.otherProductType.projectId,
        name: `pam-${suffix}`,
        slug: `pam-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.PAM,
        version: ProjectVersion.V3
      },
      {
        id: scopes.deletedProject.projectId,
        name: `sm-del-${suffix}`,
        slug: `sm-del-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V3,
        deleteAfter: new Date()
      },
      {
        id: scopes.deletedEnvironment.projectId,
        name: `sm-del-env-${suffix}`,
        slug: `sm-del-env-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V3
      },
      {
        id: scopes.legacyVersion.projectId,
        name: `sm-legacy-${suffix}`,
        slug: `sm-legacy-${suffix}`,
        orgId: ORG_ID,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V1
      },
      {
        id: scopes.otherOrg.projectId,
        name: `sm-other-org-${suffix}`,
        slug: `sm-other-org-${suffix}`,
        orgId: OTHER_ORG_ID,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V3
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

    const groupRows: (TGroupsInsert & { id: string })[] = [
      { id: groupIds.users, orgId: ORG_ID, name: `group-users-${suffix}`, slug: `group-users-${suffix}` },
      { id: groupIds.identities, orgId: ORG_ID, name: `group-ids-${suffix}`, slug: `group-ids-${suffix}` }
    ];
    await testDb(TableName.Groups).insert(groupRows);

    // uDirect and iDirect are in the group as well as holding a direct membership: the count has to
    // reach the group members without double counting anyone who arrives on both paths.
    const userGroupRows: (TUserGroupMembershipInsert & { id: string })[] = [
      { id: randomUUID(), groupId: groupIds.users, userId: ids.uDirect },
      { id: randomUUID(), groupId: groupIds.users, userId: ids.uViaGroup }
    ];
    await testDb(TableName.UserGroupMembership).insert(userGroupRows);

    const identityGroupRows: (TIdentityGroupMembershipInsert & { id: string })[] = [
      { id: randomUUID(), groupId: groupIds.identities, identityId: ids.iDirect },
      { id: randomUUID(), groupId: groupIds.identities, identityId: ids.iViaGroup }
    ];
    await testDb(TableName.IdentityGroupMembership).insert(identityGroupRows);

    const membershipRows: (TMembershipsInsert & { id: string })[] = [
      // Users.
      projectMembership(scopes.counted.projectId, { actorUserId: ids.uDirect }),
      projectMembership(scopes.counted.projectId, { actorGroupId: groupIds.users }),
      projectMembership(scopes.counted.projectId, { actorUserId: ids.uGhost }),
      projectMembership(scopes.counted.projectId, { actorUserId: ids.uInactive }, { isActive: false }),
      orgMembership({ actorUserId: ids.uOrgScopeOnly }),
      projectMembership(scopes.otherProductType.projectId, { actorUserId: ids.uOtherProductType }),
      projectMembership(scopes.deletedProject.projectId, { actorUserId: ids.uDeletedProject }),
      projectMembership(scopes.legacyVersion.projectId, { actorUserId: ids.uLegacyProject }),
      projectMembership(scopes.otherOrg.projectId, { actorUserId: ids.uOtherOrg }, { scopeOrgId: OTHER_ORG_ID }),
      // Identities.
      projectMembership(scopes.counted.projectId, { actorIdentityId: ids.iDirect }),
      projectMembership(scopes.counted.projectId, { actorGroupId: groupIds.identities }),
      projectMembership(scopes.counted.projectId, { actorIdentityId: ids.iInactive }, { isActive: false }),
      orgMembership({ actorIdentityId: ids.iOrgScopeOnly }),
      projectMembership(scopes.otherProductType.projectId, { actorIdentityId: ids.iOtherProductType }),
      projectMembership(scopes.deletedProject.projectId, { actorIdentityId: ids.iDeletedProject }),
      projectMembership(scopes.legacyVersion.projectId, { actorIdentityId: ids.iLegacyProject }),
      projectMembership(scopes.otherOrg.projectId, { actorIdentityId: ids.iOtherOrg }, { scopeOrgId: OTHER_ORG_ID })
    ];
    await testDb(TableName.Membership).insert(membershipRows);

    // Two leases in the only visible scope, one in each scope that must be filtered out.
    await testDb(TableName.DynamicSecretLease).insert([
      lease(scopes.counted.dynamicSecretId),
      lease(scopes.counted.dynamicSecretId),
      lease(scopes.otherProductType.dynamicSecretId),
      lease(scopes.deletedProject.dynamicSecretId),
      lease(scopes.deletedEnvironment.dynamicSecretId),
      lease(scopes.legacyVersion.dynamicSecretId),
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
    await testDb(TableName.UserGroupMembership).whereIn("groupId", Object.values(groupIds)).delete();
    await testDb(TableName.IdentityGroupMembership).whereIn("groupId", Object.values(groupIds)).delete();
    await testDb(TableName.Groups).whereIn("id", Object.values(groupIds)).delete();
    await testDb(TableName.Project).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Identity).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Users).whereIn("id", Object.values(ids)).delete();
    await testDb(TableName.Organization).whereIn("id", orgIds).delete();
  });

  test("returns the three usage counts for the organization", async () => {
    const insights = await insightsService.getSecretsUsageInsights(actor(ORG_ID));

    // uDirect and uViaGroup. uDirect holds both a direct and a group membership and is counted once.
    expect(insights.users).toBe(2);
    // iDirect and iViaGroup, on the same two paths.
    expect(insights.identities).toBe(2);
    // The two leases in the live SecretManager V3 project. The PAM project, the soft-deleted
    // project, the soft-deleted environment, the V1 project and the other org each contribute nothing.
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
    setCanReadInsights(false);
    try {
      await expect(insightsService.getSecretsUsageInsights(actor(ORG_ID))).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      setCanReadInsights(true);
    }
  });

  test("throws when the plan does not include secret access insights", async () => {
    setPlanHasInsights(false);
    try {
      await expect(insightsService.getSecretsUsageInsights(actor(ORG_ID))).rejects.toThrow(/Upgrade your plan/);
    } finally {
      setPlanHasInsights(true);
    }
  });
});
