import { randomUUID } from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  ProjectType,
  ProjectVersion,
  TableName,
  TOrganizationsInsert,
  TProjectEnvironmentsInsert,
  TProjectsInsert,
  TSecretFoldersInsert,
  TSecretsV2Insert
} from "@app/db/schemas";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory, TInsightsServiceFactoryDep } from "@app/ee/services/insights/insights-service";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { buildOrgInsightsGateStubs, projectScopedInsightsDepStubs, usageInsightsDepStubs } from "./testUtils/insights";

declare const testDb: Knex;
declare const testKeyStore: TKeyStoreFactory;

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const projects = {
  here: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `dup-here-${suffix}` },
  elsewhere: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `dup-else-${suffix}` }
};
const projectList = Object.values(projects);

const gate = buildOrgInsightsGateStubs();

let grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues];

const insightsService = insightsServiceFactory({
  ...projectScopedInsightsDepStubs,
  ...usageInsightsDepStubs,
  permissionService: {
    ...gate.permissionService,
    getOrgPermission: async () => ({
      permission: createMongoAbility<OrgPermissionSet>(
        grantedInsightsActions.map((action) => ({ action, subject: OrgPermissionSubjects.SecretsManagementInsights }))
      ),
      memberships: [],
      hasRole: () => false
    }),
    getProjectPermission: async () => ({
      permission: createMongoAbility([
        { action: ProjectPermissionInsightsActions.Read, subject: ProjectPermissionSub.Insights }
      ])
    })
  } as unknown as TInsightsServiceFactoryDep["permissionService"],
  licenseService: gate.licenseService,
  orgDAL: { ...usageInsightsDepStubs.orgDAL, findById: orgDALFactory(testDb).findById },
  projectDAL: { findById: projectDALFactory(testDb).findById },
  // The project query builds its decryptor up front. No secret here carries an encrypted value, so
  // it is never invoked.
  kmsService: {
    createCipherPairWithDataKey: async () =>
      ({
        decryptor: () => {
          throw new Error("insights duplication spec: no secret carries an encrypted value to decrypt");
        }
      }) as never
  },
  folderDAL: {
    ...projectScopedInsightsDepStubs.folderDAL,
    findSecretPathByFolderIds: secretFolderDALFactory(testDb).findSecretPathByFolderIds
  },
  secretV2BridgeDAL: secretV2BridgeDALFactory({ db: testDb, keyStore: testKeyStore }),
  insightsDAL: insightsDALFactory(testDb),
  keyStore: testKeyStore
});

const orgActor = {
  actor: ActorType.USER,
  actorId: USER_ID,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ORG_ID,
  orgId: ORG_ID
};

// encryptedValue is left empty so the reference filter keeps every group without a KMS round trip.
const secret = (folderId: string, key: string, digest: string): TSecretsV2Insert & { id: string } => ({
  id: randomUUID(),
  key,
  folderId,
  secretValueBlindIndex: `project-${digest}`,
  secretValueOrgBlindIndex: `org-${digest}`
});

const projectActor = {
  type: ActorType.USER,
  id: USER_ID,
  authMethod: AuthMethod.EMAIL,
  orgId: ORG_ID,
  rootOrgId: ORG_ID,
  parentOrgId: ORG_ID
};

const clearCaches = async () => {
  await testKeyStore.deleteItem(KeyStorePrefixes.InsightsCache(ORG_ID, "org-secrets-duplication"));
  await testKeyStore.deleteItem(KeyStorePrefixes.InsightsCache(projects.here.projectId, "secrets-duplication"));
};

describe("insights secrets duplication", () => {
  beforeAll(async () => {
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ORG_ID, name: `dup-${suffix}`, slug: `dup-${suffix}`, orgWideSecretValueTrackingEnabled: true }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    const projectRows: (TProjectsInsert & { id: string })[] = projectList.map((p) => ({
      id: p.projectId,
      name: p.name,
      slug: p.name,
      orgId: ORG_ID,
      type: ProjectType.SecretManager,
      version: ProjectVersion.V3,
      secretBlindIndexEnabled: true
    }));
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = projectList.map((p, index) => ({
      id: p.envId,
      name: "Development",
      slug: "dev",
      position: index + 1,
      projectId: p.projectId
    }));
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = projectList.map((p) => ({
      id: p.folderId,
      name: "root",
      envId: p.envId,
      parentId: null
    }));
    await testDb(TableName.SecretFolder).insert(folderRows);

    await testDb(TableName.SecretV2).insert([
      // Three copies inside one project
      secret(projects.here.folderId, "LOCAL_A", "local"),
      secret(projects.here.folderId, "LOCAL_B", "local"),
      secret(projects.here.folderId, "LOCAL_C", "local"),
      // Two copies across two projects: fewer rows, but the wider spread
      secret(projects.here.folderId, "SHARED_HERE", "shared"),
      secret(projects.elsewhere.folderId, "SHARED_ELSEWHERE", "shared")
    ]);

    await clearCaches();
  });

  afterAll(async () => {
    await clearCaches();
    const folderIds = projectList.map((p) => p.folderId);
    await testDb(TableName.SecretV2).whereIn("folderId", folderIds).delete();
    await testDb(TableName.SecretFolder).whereIn("id", folderIds).delete();
    await testDb(TableName.Environment)
      .whereIn(
        "id",
        projectList.map((p) => p.envId)
      )
      .delete();
    await testDb(TableName.Project)
      .whereIn(
        "id",
        projectList.map((p) => p.projectId)
      )
      .delete();
    await testDb(TableName.Organization).where("id", ORG_ID).delete();
  });

  describe("organization scope", () => {
    test("groups a value across projects and ranks the widest spread first", async () => {
      await clearCaches();
      const { result } = await insightsService.getOrgSecretsDuplication(orgActor);

      expect(result.orgWideSecretValueTrackingEnabled).toBe(true);
      expect(result.groups.map((g) => [g.projectCount, g.locationCount, g.secrets.length])).toEqual([
        [2, 2, 2],
        [1, 1, 3]
      ]);

      const [crossProject] = result.groups;
      expect(crossProject.secrets.map((s) => [s.key, s.projectId, s.projectName, s.secretPath]).sort()).toEqual(
        [
          ["SHARED_ELSEWHERE", projects.elsewhere.projectId, projects.elsewhere.name, "/"],
          ["SHARED_HERE", projects.here.projectId, projects.here.name, "/"]
        ].sort()
      );
    });

    test("answers from the cache until it expires", async () => {
      await clearCaches();
      await insightsService.getOrgSecretsDuplication(orgActor);

      const extra = secret(projects.elsewhere.folderId, "LATE_ARRIVAL", "shared");
      await testDb(TableName.SecretV2).insert(extra);
      try {
        const cached = await insightsService.getOrgSecretsDuplication(orgActor);
        expect(cached.result.groups[0].secrets).toHaveLength(2);
        expect(cached.remainingTTL).toBeGreaterThan(0);

        await clearCaches();
        const recomputed = await insightsService.getOrgSecretsDuplication(orgActor);
        expect(recomputed.result.groups[0].secrets).toHaveLength(3);
      } finally {
        await testDb(TableName.SecretV2).where("id", extra.id).delete();
      }
    });

    // The groups name every project a value lives in, so reading the insights page is not enough.
    test("refuses a viewer who may read insights but not search all secret values", async () => {
      grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.Read];
      try {
        await expect(insightsService.getOrgSecretsDuplication(orgActor)).rejects.toThrow(ForbiddenError);
      } finally {
        grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues];
      }
    });

    test("says tracking is off rather than returning an empty answer", async () => {
      await testDb(TableName.Organization).where("id", ORG_ID).update({ orgWideSecretValueTrackingEnabled: false });
      try {
        const { result } = await insightsService.getOrgSecretsDuplication(orgActor);
        expect(result).toEqual({ orgWideSecretValueTrackingEnabled: false, groups: [] });
      } finally {
        await testDb(TableName.Organization).where("id", ORG_ID).update({ orgWideSecretValueTrackingEnabled: true });
      }
    });
  });

  describe("project scope", () => {
    const dto = { projectId: projects.here.projectId };

    test("answers from the cache until it expires", async () => {
      await clearCaches();
      await insightsService.getSecretsDuplication(dto, projectActor);

      const extra = secret(projects.here.folderId, "LATE_LOCAL", "local");
      await testDb(TableName.SecretV2).insert(extra);
      try {
        const localGroupSize = (r: Awaited<ReturnType<typeof insightsService.getSecretsDuplication>>) =>
          r.result.groups.find((g) => g.secrets.some((s) => s.key === "LOCAL_A"))?.secrets.length;

        expect(localGroupSize(await insightsService.getSecretsDuplication(dto, projectActor))).toBe(3);

        await clearCaches();
        expect(localGroupSize(await insightsService.getSecretsDuplication(dto, projectActor))).toBe(4);
      } finally {
        await testDb(TableName.SecretV2).where("id", extra.id).delete();
      }
    });
  });
});
