import { randomUUID } from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  ProjectType,
  ProjectVersion,
  TableName,
  TAppConnectionsInsert,
  TDynamicSecretLeasesInsert,
  TDynamicSecretsInsert,
  TOrganizationsInsert,
  TProjectEnvironmentsInsert,
  TProjectsInsert,
  TSecretFoldersInsert,
  TSecretRotationsV2Insert,
  TSecretsV2Insert,
  TSecretSyncsInsert,
  TUsersInsert
} from "@app/db/schemas";
import { DynamicSecretLeaseStatus } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-types";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory, TInsightsServiceFactoryDep } from "@app/ee/services/insights/insights-service";
import { TGetSecretsProjectWarningsDTO } from "@app/ee/services/insights/insights-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { orgDALFactory } from "@app/services/org/org-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSyncStatus } from "@app/services/secret-sync/secret-sync-types";
import { secretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import {
  buildOrgInsightsGateStubs,
  passThroughKeyStore,
  projectScopedInsightsDepStubs,
  usageInsightsDepStubs
} from "./testUtils/insights";

declare const testDb: Knex;
declare const testKeyStore: TKeyStoreFactory;

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const USER_ID = randomUUID();
const CONNECTION_ID = randomUUID();

// Project names are chosen so the severity tiebreak (name asc) yields a
// deterministic order: warn ranks first by score, then clean/noBlindIndex/
// deletedEnv alphabetically.
const projects = {
  // Every issue type at once
  warn: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `zz-warn-${suffix}` },
  // No issues at all
  clean: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `aa-clean-${suffix}` },
  // Blind indexing disabled: duplicated metric must be null even with matching indexes
  noBlindIndex: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    name: `bb-noblind-${suffix}`
  },
  // Live project whose only environment is soft-deleted: all counts must be zero
  deletedEnv: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `cc-delenv-${suffix}` },
  // Filtered out of the listing entirely
  otherProductType: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `pam-${suffix}` },
  deletedProject: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `del-${suffix}` },
  oldVersion: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `v1-${suffix}` },
  otherOrg: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `other-${suffix}` }
};

const projectList = Object.values(projects);

const DYNAMIC_SECRET_ID = randomUUID();

const { permissionService, licenseService, setCanReadInsights, setPlanHasInsights } = buildOrgInsightsGateStubs();

const insightsService = insightsServiceFactory({
  ...projectScopedInsightsDepStubs,
  permissionService,
  licenseService,
  ...usageInsightsDepStubs,
  insightsDAL: insightsDALFactory(testDb),
  keyStore: passThroughKeyStore
});

const actor = (orgId: string, page?: { offset: number; limit: number }): TGetSecretsProjectWarningsDTO => ({
  actor: ActorType.USER,
  actorId: USER_ID,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: orgId,
  orgId,
  offset: page?.offset ?? 0,
  limit: page?.limit ?? 20
});

const secret = (folderId: string, overrides: Partial<TSecretsV2Insert> = {}): TSecretsV2Insert & { id: string } => ({
  id: randomUUID(),
  key: `SECRET_${randomUUID().slice(0, 8)}`,
  folderId,
  ...overrides
});

describe("insights secrets project warnings", () => {
  beforeAll(async () => {
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ORG_ID, name: `warnings-${suffix}`, slug: `warnings-${suffix}` },
      { id: OTHER_ORG_ID, name: `warnings-other-${suffix}`, slug: `warnings-other-${suffix}` }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    // Owner of the personal-override secret that must be excluded from counts
    const userRows: (TUsersInsert & { id: string })[] = [
      { id: USER_ID, username: `warnings-user-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const projectRows: (TProjectsInsert & { id: string })[] = projectList.map((p) => ({
      id: p.projectId,
      name: p.name,
      slug: p.name,
      orgId: p === projects.otherOrg ? OTHER_ORG_ID : ORG_ID,
      type: p === projects.otherProductType ? ProjectType.PAM : ProjectType.SecretManager,
      // The listing only covers v3 projects (the column defaults to v1)
      version: p === projects.oldVersion ? ProjectVersion.V1 : ProjectVersion.V3,
      ...(p === projects.deletedProject ? { deleteAfter: new Date() } : {}),
      ...(p === projects.noBlindIndex ? { secretBlindIndexEnabled: false } : { secretBlindIndexEnabled: true })
    }));
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = projectList.map((p, index) => ({
      id: p.envId,
      name: "Development",
      slug: "dev",
      position: index + 1,
      projectId: p.projectId,
      ...(p === projects.deletedEnv ? { deleteAfter: new Date() } : {})
    }));
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = projectList.map((p) => ({
      id: p.folderId,
      name: "root",
      envId: p.envId,
      parentId: null
    }));
    await testDb(TableName.SecretFolder).insert(folderRows);

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 100);

    // The stale fixtures set updatedAt at INSERT time: secrets_v2 has an
    // on-update trigger that resets updatedAt to now() on every UPDATE, so
    // backdating after the fact is impossible. The typed insert omits the
    // immutable updatedAt column, hence the cast.
    const backdated = { updatedAt: staleDate } as Partial<TSecretsV2Insert>;
    const secretRows: (TSecretsV2Insert & { id: string })[] = [
      // warn: 2 duplicates + 1 stale + 1 fresh = 4 shared secrets
      secret(projects.warn.folderId, { secretValueBlindIndex: `dup-${suffix}` }),
      secret(projects.warn.folderId, { secretValueBlindIndex: `dup-${suffix}` }),
      secret(projects.warn.folderId, { secretValueBlindIndex: `stale-${suffix}`, ...backdated }),
      secret(projects.warn.folderId),
      // personal override: excluded from every count
      secret(projects.warn.folderId, { userId: USER_ID, type: "personal" }),
      // clean: a single fresh secret
      secret(projects.clean.folderId),
      // noBlindIndex: matching indexes, but the project has blind indexing disabled
      secret(projects.noBlindIndex.folderId, { secretValueBlindIndex: `dup-nbi-${suffix}` }),
      secret(projects.noBlindIndex.folderId, { secretValueBlindIndex: `dup-nbi-${suffix}` }),
      // deletedEnv: a stale secret behind a soft-deleted environment must not count
      secret(projects.deletedEnv.folderId, { secretValueBlindIndex: `stale-denv-${suffix}`, ...backdated })
    ];
    await testDb(TableName.SecretV2).insert(secretRows);

    const connectionRows: (TAppConnectionsInsert & { id: string })[] = [
      {
        id: CONNECTION_ID,
        name: `conn-${suffix}`,
        app: "postgres",
        method: "username-and-password",
        encryptedCredentials: Buffer.from("{}"),
        orgId: ORG_ID
      }
    ];
    await testDb(TableName.AppConnection).insert(connectionRows);

    const rotation = (folderId: string, rotationStatus: string): TSecretRotationsV2Insert & { id: string } => ({
      id: randomUUID(),
      name: `rot-${randomUUID().slice(0, 8)}`,
      type: "postgres-credentials",
      parameters: {},
      secretsMapping: {},
      encryptedGeneratedCredentials: Buffer.from("{}"),
      folderId,
      connectionId: CONNECTION_ID,
      rotationInterval: 30,
      rotateAtUtc: { hours: 0, minutes: 0 },
      rotationStatus,
      lastRotationAttemptedAt: new Date(),
      lastRotatedAt: new Date()
    });
    await testDb(TableName.SecretRotationV2).insert([
      rotation(projects.warn.folderId, SecretRotationStatus.Failed),
      // successful rotations must not count
      rotation(projects.warn.folderId, SecretRotationStatus.Success),
      // failed rotation behind a soft-deleted environment must not count
      rotation(projects.deletedEnv.folderId, SecretRotationStatus.Failed)
    ]);

    const sync = (projectId: string, syncStatus: string): TSecretSyncsInsert & { id: string } => ({
      id: randomUUID(),
      name: `sync-${randomUUID().slice(0, 8)}`,
      destination: "aws-parameter-store",
      destinationConfig: {},
      syncOptions: {},
      projectId,
      connectionId: CONNECTION_ID,
      syncStatus
    });
    await testDb(TableName.SecretSync).insert([
      sync(projects.warn.projectId, SecretSyncStatus.Failed),
      // succeeded syncs must not count
      sync(projects.warn.projectId, SecretSyncStatus.Succeeded),
      // failed sync in a soft-deleted project must not count
      sync(projects.deletedProject.projectId, SecretSyncStatus.Failed)
    ]);

    const dynamicSecretRows: (TDynamicSecretsInsert & { id: string })[] = [
      {
        id: DYNAMIC_SECRET_ID,
        name: `dyn-${suffix}`,
        version: 1,
        type: "sql-database",
        defaultTTL: "1h",
        folderId: projects.warn.folderId,
        encryptedInput: Buffer.from("{}")
      }
    ];
    await testDb(TableName.DynamicSecret).insert(dynamicSecretRows);

    const lease = (status?: string): TDynamicSecretLeasesInsert & { id: string } => ({
      id: randomUUID(),
      version: 1,
      externalEntityId: `ext-${randomUUID().slice(0, 8)}`,
      expireAt: new Date(Date.now() + 60 * 60 * 1000),
      dynamicSecretId: DYNAMIC_SECRET_ID,
      ...(status ? { status } : {})
    });
    await testDb(TableName.DynamicSecretLease).insert([
      lease(DynamicSecretLeaseStatus.FailedDeletion),
      // healthy active leases must not count as orphaned
      lease()
    ]);
  });

  afterAll(async () => {
    const orgIds = [ORG_ID, OTHER_ORG_ID];
    await testDb(TableName.DynamicSecretLease).where("dynamicSecretId", DYNAMIC_SECRET_ID).delete();
    await testDb(TableName.DynamicSecret).where("id", DYNAMIC_SECRET_ID).delete();
    await testDb(TableName.SecretRotationV2).where("connectionId", CONNECTION_ID).delete();
    await testDb(TableName.SecretSync).where("connectionId", CONNECTION_ID).delete();
    await testDb(TableName.AppConnection).where("id", CONNECTION_ID).delete();
    await testDb(TableName.SecretV2)
      .whereIn(
        "folderId",
        projectList.map((p) => p.folderId)
      )
      .delete();
    await testDb(TableName.SecretFolder)
      .whereIn(
        "id",
        projectList.map((p) => p.folderId)
      )
      .delete();
    await testDb(TableName.Environment)
      .whereIn(
        "id",
        projectList.map((p) => p.envId)
      )
      .delete();
    await testDb(TableName.Project).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Users).where("id", USER_ID).delete();
    await testDb(TableName.Organization).whereIn("id", orgIds).delete();
  });

  test("returns all secret-manager projects ordered by severity with correct counts", async () => {
    const result = await insightsService.getSecretsProjects(actor(ORG_ID));

    // warn, clean, noBlindIndex, deletedEnv. The PAM project, the soft-deleted
    // project, the v1 project and the other org's project are excluded from the listing.
    expect(result.totalProjects).toBe(4);
    expect(result.projectsWithIssues).toBe(1);
    expect(result.projects).toHaveLength(4);

    // warn ranks first by score; the rest tie at zero and sort by name.
    expect(result.projects.map((p) => p.projectName)).toEqual([
      projects.warn.name,
      projects.clean.name,
      projects.noBlindIndex.name,
      projects.deletedEnv.name
    ]);

    const warn = result.projects[0];
    expect(warn).toMatchObject({
      projectId: projects.warn.projectId,
      // The personal override secret is excluded
      totalSecrets: 4,
      warnings: {
        duplicatedSecrets: 2,
        staleSecrets: 1,
        failedRotations: 1,
        failedSyncs: 1,
        orphanedLeases: 1
      }
    });
    expect(warn.severityScore).toBeGreaterThan(0);

    const clean = result.projects.find((p) => p.projectId === projects.clean.projectId);
    expect(clean).toMatchObject({
      totalSecrets: 1,
      severityScore: 0,
      warnings: {
        duplicatedSecrets: 0,
        staleSecrets: 0,
        failedRotations: 0,
        failedSyncs: 0,
        orphanedLeases: 0
      }
    });

    // Blind indexing disabled: the duplicated metric is unknowable, not zero
    const noBlindIndex = result.projects.find((p) => p.projectId === projects.noBlindIndex.projectId);
    expect(noBlindIndex?.warnings.duplicatedSecrets).toBeNull();
    expect(noBlindIndex?.severityScore).toBe(0);

    // Soft-deleted environment: its stale secret and failed rotation contribute nothing
    const deletedEnv = result.projects.find((p) => p.projectId === projects.deletedEnv.projectId);
    expect(deletedEnv).toMatchObject({
      totalSecrets: 0,
      severityScore: 0,
      warnings: { staleSecrets: 0, failedRotations: 0 }
    });
  });

  test("pagination slices rows while window totals stay constant", async () => {
    const page = await insightsService.getSecretsProjects(actor(ORG_ID, { offset: 1, limit: 2 }));

    expect(page.totalProjects).toBe(4);
    expect(page.projectsWithIssues).toBe(1);
    expect(page.offset).toBe(1);
    expect(page.limit).toBe(2);
    expect(page.projects.map((p) => p.projectName)).toEqual([projects.clean.name, projects.noBlindIndex.name]);
  });

  test("an organization with no projects reports empty results", async () => {
    const result = await insightsService.getSecretsProjects(actor(randomUUID()));
    expect(result.projects).toEqual([]);
    expect(result.totalProjects).toBe(0);
    expect(result.projectsWithIssues).toBe(0);
  });

  test("throws when the actor cannot read secrets management insights", async () => {
    setCanReadInsights(false);
    try {
      await expect(insightsService.getSecretsProjects(actor(ORG_ID))).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      setCanReadInsights(true);
    }
  });

  test("throws when the plan does not include secret access insights", async () => {
    setPlanHasInsights(false);
    try {
      await expect(insightsService.getSecretsProjects(actor(ORG_ID))).rejects.toThrow(/Upgrade your plan/);
    } finally {
      setPlanHasInsights(true);
    }
  });
});

const DUP_ORG_ID = randomUUID();
const DUP_USER_ID = randomUUID();

const dupProjects = {
  here: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `dup-here-${suffix}` },
  elsewhere: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `dup-else-${suffix}` }
};
const dupProjectList = Object.values(dupProjects);

const dupGate = buildOrgInsightsGateStubs();

let grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues];

const dupInsightsService = insightsServiceFactory({
  ...projectScopedInsightsDepStubs,
  ...usageInsightsDepStubs,
  permissionService: {
    ...dupGate.permissionService,
    getOrgPermission: async () => ({
      permission: createMongoAbility<OrgPermissionSet>(
        grantedInsightsActions.map((action) => ({ action, subject: OrgPermissionSubjects.SecretsManagementInsights }))
      ),
      memberships: [],
      hasRole: () => false
    })
  } as unknown as TInsightsServiceFactoryDep["permissionService"],
  licenseService: dupGate.licenseService,
  orgDAL: { ...usageInsightsDepStubs.orgDAL, findById: orgDALFactory(testDb).findById },
  // No secret here carries an encrypted value, so the decryptor is never invoked.
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
  keyStore: passThroughKeyStore
});

const dupOrgActor = {
  actor: ActorType.USER,
  actorId: DUP_USER_ID,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: DUP_ORG_ID,
  orgId: DUP_ORG_ID
};

// encryptedValue is left empty so the reference filter keeps every group without a KMS round trip.
const dupSecret = (folderId: string, key: string, digest: string): TSecretsV2Insert & { id: string } => ({
  id: randomUUID(),
  key,
  folderId,
  secretValueBlindIndex: `project-${digest}`,
  secretValueOrgBlindIndex: `org-${digest}`
});

describe("insights secrets duplication", () => {
  beforeAll(async () => {
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: DUP_ORG_ID, name: `dup-${suffix}`, slug: `dup-${suffix}`, orgWideSecretValueTrackingEnabled: true }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    const projectRows: (TProjectsInsert & { id: string })[] = dupProjectList.map((p) => ({
      id: p.projectId,
      name: p.name,
      slug: p.name,
      orgId: DUP_ORG_ID,
      type: ProjectType.SecretManager,
      version: ProjectVersion.V3,
      secretBlindIndexEnabled: true
    }));
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = dupProjectList.map((p, index) => ({
      id: p.envId,
      name: "Development",
      slug: "dev",
      position: index + 1,
      projectId: p.projectId
    }));
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = dupProjectList.map((p) => ({
      id: p.folderId,
      name: "root",
      envId: p.envId,
      parentId: null
    }));
    await testDb(TableName.SecretFolder).insert(folderRows);

    await testDb(TableName.SecretV2).insert([
      // Three copies inside one project
      dupSecret(dupProjects.here.folderId, "LOCAL_A", "local"),
      dupSecret(dupProjects.here.folderId, "LOCAL_B", "local"),
      dupSecret(dupProjects.here.folderId, "LOCAL_C", "local"),
      // Two copies across two projects: fewer rows, but the wider spread
      dupSecret(dupProjects.here.folderId, "SHARED_HERE", "shared"),
      dupSecret(dupProjects.elsewhere.folderId, "SHARED_ELSEWHERE", "shared")
    ]);
  });

  afterAll(async () => {
    const folderIds = dupProjectList.map((p) => p.folderId);
    await testDb(TableName.SecretV2).whereIn("folderId", folderIds).delete();
    await testDb(TableName.SecretFolder).whereIn("id", folderIds).delete();
    await testDb(TableName.Environment)
      .whereIn(
        "id",
        dupProjectList.map((p) => p.envId)
      )
      .delete();
    await testDb(TableName.Project)
      .whereIn(
        "id",
        dupProjectList.map((p) => p.projectId)
      )
      .delete();
    await testDb(TableName.Organization).where("id", DUP_ORG_ID).delete();
  });

  test("groups a value across projects and ranks the widest spread first", async () => {
    const { result } = await dupInsightsService.getOrgSecretsDuplication(dupOrgActor);

    expect(result.orgWideSecretValueTrackingEnabled).toBe(true);
    expect(result.groups.map((g) => [g.projectCount, g.locationCount, g.secrets.length])).toEqual([
      [2, 2, 2],
      [1, 1, 3]
    ]);

    const [crossProject] = result.groups;
    expect(crossProject.secrets.map((s) => [s.key, s.projectId, s.projectName, s.secretPath]).sort()).toEqual(
      [
        ["SHARED_ELSEWHERE", dupProjects.elsewhere.projectId, dupProjects.elsewhere.name, "/"],
        ["SHARED_HERE", dupProjects.here.projectId, dupProjects.here.name, "/"]
      ].sort()
    );
  });

  // The groups name every project a value lives in, so reading the insights page is not enough.
  test("refuses a viewer who may read insights but not search all secret values", async () => {
    grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.Read];
    try {
      await expect(dupInsightsService.getOrgSecretsDuplication(dupOrgActor)).rejects.toThrow(ForbiddenError);
    } finally {
      grantedInsightsActions = [OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues];
    }
  });

  test("says tracking is off rather than returning an empty answer", async () => {
    await testDb(TableName.Organization).where("id", DUP_ORG_ID).update({ orgWideSecretValueTrackingEnabled: false });
    try {
      const { result } = await dupInsightsService.getOrgSecretsDuplication(dupOrgActor);
      expect(result).toEqual({ orgWideSecretValueTrackingEnabled: false, groups: [] });
    } finally {
      await testDb(TableName.Organization).where("id", DUP_ORG_ID).update({ orgWideSecretValueTrackingEnabled: true });
    }
  });
});
