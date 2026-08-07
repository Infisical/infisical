import { randomUUID } from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  ProjectType,
  ProjectVersion,
  TableName,
  TAppConnectionsInsert,
  TOrganizationsInsert,
  TProjectEnvironmentsInsert,
  TProjectsInsert,
  TSecretFoldersInsert,
  TSecretRotationsV2Insert,
  TSecretsV2Insert,
  TUsersInsert
} from "@app/db/schemas";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory } from "@app/ee/services/insights/insights-service";
import { TOrgInsightsDTO } from "@app/ee/services/insights/insights-types";
import { SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { buildOrgInsightsGateStubs, passThroughKeyStore, projectScopedInsightsDepStubs } from "./testUtils/insights";

declare const testDb: Knex;

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const USER_ID = randomUUID();
const CONNECTION_ID = randomUUID();

// One project per scoping rule of countOrgSecretsResources. Only `smA` and `smB` may contribute.
const projects = {
  // Two environments, one of them soft-deleted; secrets and a rotation behind each
  smA: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    deletedEnvId: randomUUID(),
    deletedEnvFolderId: randomUUID(),
    name: `sm-a-${suffix}`
  },
  // A second live project so the counts prove aggregation rather than a single-project read
  smB: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `sm-b-${suffix}` },
  // Filtered out entirely
  otherProductType: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `pam-${suffix}` },
  deletedProject: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `del-${suffix}` },
  oldVersion: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `v1-${suffix}` },
  otherOrg: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `other-${suffix}` }
};

const projectList = Object.values(projects);

const { permissionService, licenseService, setCanReadInsights, setPlanHasInsights } = buildOrgInsightsGateStubs();

const insightsService = insightsServiceFactory({
  ...projectScopedInsightsDepStubs,
  permissionService,
  licenseService,
  orgDAL: { countAllOrgMembers: async () => 0 },
  identityOrgMembershipDAL: { countAllOrgIdentities: async () => 0 },
  dynamicSecretLeaseDAL: { countLeasesForOrg: async () => 0 },
  insightsDAL: insightsDALFactory(testDb),
  keyStore: passThroughKeyStore
});

const actor = (orgId: string): TOrgInsightsDTO => ({
  actor: ActorType.USER,
  actorId: USER_ID,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: orgId,
  orgId
});

const secret = (folderId: string, overrides: Partial<TSecretsV2Insert> = {}): TSecretsV2Insert & { id: string } => ({
  id: randomUUID(),
  key: `SECRET_${randomUUID().slice(0, 8)}`,
  folderId,
  ...overrides
});

describe("insights org secrets counts", () => {
  beforeAll(async () => {
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ORG_ID, name: `counts-${suffix}`, slug: `counts-${suffix}` },
      { id: OTHER_ORG_ID, name: `counts-other-${suffix}`, slug: `counts-other-${suffix}` }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    // Owner of the personal-override secret that must be excluded from the secrets count
    const userRows: (TUsersInsert & { id: string })[] = [
      { id: USER_ID, username: `counts-user-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const projectRows: (TProjectsInsert & { id: string })[] = projectList.map((p) => ({
      id: p.projectId,
      name: p.name,
      slug: p.name,
      orgId: p === projects.otherOrg ? OTHER_ORG_ID : ORG_ID,
      type: p === projects.otherProductType ? ProjectType.PAM : ProjectType.SecretManager,
      // The counts only cover v3 projects (the column defaults to v1)
      version: p === projects.oldVersion ? ProjectVersion.V1 : ProjectVersion.V3,
      ...(p === projects.deletedProject ? { deleteAfter: new Date() } : {})
    }));
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = [
      ...projectList.map((p, index) => ({
        id: p.envId,
        name: "Development",
        slug: "dev",
        position: index + 1,
        projectId: p.projectId
      })),
      {
        id: projects.smA.deletedEnvId,
        name: "Staging",
        slug: "staging",
        position: projectList.length + 1,
        projectId: projects.smA.projectId,
        deleteAfter: new Date()
      }
    ];
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = [
      ...projectList.map((p) => ({
        id: p.folderId,
        name: "root",
        envId: p.envId,
        parentId: null
      })),
      { id: projects.smA.deletedEnvFolderId, name: "root", envId: projects.smA.deletedEnvId, parentId: null }
    ];
    await testDb(TableName.SecretFolder).insert(folderRows);

    const secretRows: (TSecretsV2Insert & { id: string })[] = [
      // smA: two shared secrets count, the personal override does not
      secret(projects.smA.folderId),
      secret(projects.smA.folderId),
      secret(projects.smA.folderId, { userId: USER_ID, type: "personal" }),
      // smA: behind the soft-deleted environment, must not count
      secret(projects.smA.deletedEnvFolderId),
      // smB: one shared secret
      secret(projects.smB.folderId),
      // each excluded project carries a secret that must not count
      secret(projects.otherProductType.folderId),
      secret(projects.deletedProject.folderId),
      secret(projects.oldVersion.folderId),
      secret(projects.otherOrg.folderId)
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
      // the count is status-independent, so one of each status in the live scope
      rotation(projects.smA.folderId, SecretRotationStatus.Success),
      rotation(projects.smB.folderId, SecretRotationStatus.Failed),
      // behind a soft-deleted environment / in an excluded project: must not count
      rotation(projects.smA.deletedEnvFolderId, SecretRotationStatus.Success),
      rotation(projects.otherProductType.folderId, SecretRotationStatus.Success)
    ]);
  });

  afterAll(async () => {
    const orgIds = [ORG_ID, OTHER_ORG_ID];
    const folderIds = [...projectList.map((p) => p.folderId), projects.smA.deletedEnvFolderId];
    await testDb(TableName.SecretRotationV2).where("connectionId", CONNECTION_ID).delete();
    await testDb(TableName.AppConnection).where("id", CONNECTION_ID).delete();
    await testDb(TableName.SecretV2).whereIn("folderId", folderIds).delete();
    await testDb(TableName.SecretFolder).whereIn("id", folderIds).delete();
    await testDb(TableName.Environment)
      .whereIn("id", [...projectList.map((p) => p.envId), projects.smA.deletedEnvId])
      .delete();
    await testDb(TableName.Project).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Users).where("id", USER_ID).delete();
    await testDb(TableName.Organization).whereIn("id", orgIds).delete();
  });

  test("returns whole-org counts scoped to live v3 secret-manager projects", async () => {
    const counts = await insightsService.getOrgSecretsCounts(actor(ORG_ID));

    expect(counts).toEqual({
      // smA + smB: the PAM, soft-deleted, v1 and other-org projects are all excluded
      projects: 2,
      // smA's two live shared secrets + smB's one. The personal override, the secret behind the
      // soft-deleted environment and the secrets in excluded projects contribute nothing.
      secrets: 3,
      // smA's live environment + smB's: the soft-deleted environment and excluded projects' don't count
      environments: 2,
      // one per live project; status does not matter
      rotations: 2
    });
  });

  test("an organization with no projects reports zeroes", async () => {
    const counts = await insightsService.getOrgSecretsCounts(actor(randomUUID()));
    expect(counts).toEqual({ projects: 0, secrets: 0, environments: 0, rotations: 0 });
  });

  test("throws when the actor cannot read secrets management insights", async () => {
    setCanReadInsights(false);
    try {
      await expect(insightsService.getOrgSecretsCounts(actor(ORG_ID))).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      setCanReadInsights(true);
    }
  });

  test("throws when the plan does not include secret access insights", async () => {
    setPlanHasInsights(false);
    try {
      await expect(insightsService.getOrgSecretsCounts(actor(ORG_ID))).rejects.toThrow(/Upgrade your plan/);
    } finally {
      setPlanHasInsights(true);
    }
  });
});
