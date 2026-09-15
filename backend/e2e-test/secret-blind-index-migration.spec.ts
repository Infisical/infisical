import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import {
  releaseSecretBlindIndexMigrationOrgSlot,
  SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT,
  SECRET_BLIND_INDEX_MIGRATION_WORKER_CONCURRENCY,
  tryAdmitSecretBlindIndexMigrationOrgSlot
} from "@app/services/project/project-fns";

import { createSecretV2 } from "./testUtils/secrets";

declare const testKeyStore: TKeyStoreFactory;
declare const testQueue: TQueueServiceFactory;

const ORG_AT_CAP_MESSAGE = "too many migrations are already running for this organization";
const DEFAULT_ENV_SLUG = "dev";
const MIGRATION_JOB_PREFIX = "enable-blind-index-project-";

const createdOrgIds: string[] = [];
const createdProjectIds: string[] = [];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitUntil = async (probe: () => Promise<boolean>, timeoutMs: number, intervalMs = 150) => {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-await-in-loop
  while (!(await probe())) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
};

const mintOrgJwt = (orgId: string) => {
  const cfg = getConfig();
  return crypto.jwt().sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: seedData1.id,
      tokenVersionId: seedData1.token.id,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    cfg.AUTH_SECRET,
    { expiresIn: cfg.JWT_AUTH_LIFETIME }
  );
};

const createOrg = async () => {
  const suffix = randomUUID().slice(0, 8);
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v2/organizations",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { name: `sbi-org-${suffix}` }
  });
  expect(res.statusCode).toBe(200);
  const { organization } = JSON.parse(res.payload) as { organization: { id: string } };
  createdOrgIds.push(organization.id);
  return { orgId: organization.id, authToken: mintOrgJwt(organization.id) };
};

const createProject = async (authToken: string, name: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: { authorization: `Bearer ${authToken}` },
    body: { projectName: name }
  });
  expect(res.statusCode).toBe(200);
  const { project } = JSON.parse(res.payload) as { project: { id: string } };
  createdProjectIds.push(project.id);
  return project.id;
};

const createDisabledProjects = async (authToken: string, count: number) => {
  const suffix = randomUUID().slice(0, 8);
  const projectIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const projectId = await createProject(authToken, `sbi-${suffix}-${i}`);
    projectIds.push(projectId);
  }
  await testDb(TableName.Project).whereIn("id", projectIds).update({ secretBlindIndexEnabled: false });
  return projectIds;
};

const orgSlotKey = (orgId: string) => KeyStorePrefixes.SecretBlindIndexMigrationOrgSlot(orgId);

const getOrgSlotCount = async (orgId: string) => {
  const raw = await testKeyStore.getItem(orgSlotKey(orgId));
  return raw === null ? 0 : Number(raw);
};

const occupyOrgSeats = async (orgId: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const admitted = await tryAdmitSecretBlindIndexMigrationOrgSlot(testKeyStore, orgId);
    expect(admitted).toBe(true);
  }
};

const releaseOrgSeats = async (orgId: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await releaseSecretBlindIndexMigrationOrgSlot(testKeyStore, orgId);
  }
};

const migrationJobId = (projectId: string) => `${MIGRATION_JOB_PREFIX}${projectId}`;

const getMigrationJob = (projectId: string) =>
  testQueue.getJob(QueueName.SecretBlindIndexMigration, migrationJobId(projectId));

const waitForOverflowJobs = async (projectIds: string[], timeoutMs = 20_000) => {
  await waitUntil(async () => {
    const jobs = await Promise.all(projectIds.map((projectId) => getMigrationJob(projectId)));
    if (jobs.some((job) => !job)) return false;
    const present = jobs.filter((job): job is NonNullable<typeof job> => Boolean(job));
    const states = await Promise.all(present.map((job) => job.getState()));
    return present.every((job, index) => {
      const state = states[index];
      return (job.attemptsMade ?? 0) >= 1 && (state === "delayed" || state === "failed");
    });
  }, timeoutMs);
};

const expectOverflowJobs = async (projectIds: string[]) => {
  for (const projectId of projectIds) {
    // eslint-disable-next-line no-await-in-loop
    const job = await getMigrationJob(projectId);
    expect(job).toBeDefined();
    if (!job) return;
    // eslint-disable-next-line no-await-in-loop
    const state = await job.getState();
    expect(["delayed", "failed"]).toContain(state);
    expect(job.failedReason).toContain(ORG_AT_CAP_MESSAGE);
    expect(job.opts.attempts).toBe(5);
    expect(job.attemptsMade).toBeGreaterThanOrEqual(1);
  }
};

const waitForProjectsEnabled = async (projectIds: string[], timeoutMs: number) => {
  await waitUntil(async () => {
    const projects = await testDb(TableName.Project).whereIn("id", projectIds).select("secretBlindIndexEnabled");
    return projects.length === projectIds.length && projects.every((project) => project.secretBlindIndexEnabled);
  }, timeoutMs);
};

const countActiveJobs = async (projectIds: string[]) => {
  const jobs = await Promise.all(projectIds.map((projectId) => getMigrationJob(projectId)));
  const states = await Promise.all(jobs.map((job) => job?.getState()));
  return states.filter((state) => state === "active").length;
};

const waitForProjectsEnabledAndPeakInFlight = async (projectIds: string[], orgIds: string[], timeoutMs: number) => {
  let peak = 0;
  await waitUntil(
    async () => {
      const [active, slots] = await Promise.all([
        countActiveJobs(projectIds),
        Promise.all(orgIds.map((orgId) => getOrgSlotCount(orgId))).then((counts) =>
          counts.reduce((sum, count) => sum + count, 0)
        )
      ]);
      peak = Math.max(peak, active, slots);
      const projects = await testDb(TableName.Project).whereIn("id", projectIds).select("secretBlindIndexEnabled");
      return projects.length === projectIds.length && projects.every((project) => project.secretBlindIndexEnabled);
    },
    timeoutMs,
    50
  );
  return peak;
};

const removeMigrationJobs = async (projectIds: string[]) => {
  await Promise.all(
    projectIds.map((projectId) => testQueue.stopJobById(QueueName.SecretBlindIndexMigration, migrationJobId(projectId)))
  );
};

afterEach(async () => {
  await Promise.all(
    createdProjectIds.map((projectId) =>
      testQueue.stopJobById(QueueName.SecretBlindIndexMigration, migrationJobId(projectId))
    )
  );
  if (createdOrgIds.length > 0) {
    await testKeyStore.deleteItemsByKeyIn(createdOrgIds.map(orgSlotKey));
  }
  createdOrgIds.length = 0;
  createdProjectIds.length = 0;
});

describe("secret blind index migration concurrency", () => {
  test("enables secretBlindIndexEnabled for every project in an org", async () => {
    const { orgId, authToken } = await createOrg();
    const projectIds = await createDisabledProjects(authToken, 3);
    const secretKey = `SBI_${randomUUID().slice(0, 8)}`;

    await createSecretV2({
      workspaceId: projectIds[0],
      environmentSlug: DEFAULT_ENV_SLUG,
      secretPath: "/",
      key: secretKey,
      value: "blind-index-source",
      authToken
    });
    await testDb(TableName.SecretV2).where({ key: secretKey }).update({ secretValueBlindIndex: null });

    await testServer.services.project.startSecretBlindIndexMigrationPerOrg(orgId, 3);
    await waitForProjectsEnabled(projectIds, 15_000);

    const secret = await testDb(TableName.SecretV2).where({ key: secretKey }).first();
    expect(secret?.secretValueBlindIndex).toBeTruthy();
    expect(await getOrgSlotCount(orgId)).toBe(0);
  });

  test("respects the per-org in-flight cap and retries overflow jobs", async () => {
    const { orgId, authToken } = await createOrg();
    const projectIds = await createDisabledProjects(authToken, 3);

    await occupyOrgSeats(orgId, SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT);
    await testServer.services.project.startSecretBlindIndexMigrationPerOrg(orgId, 3);

    await waitForOverflowJobs(projectIds);
    expect(await getOrgSlotCount(orgId)).toBe(SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT);
    await expectOverflowJobs(projectIds);

    await removeMigrationJobs(projectIds);
    await releaseOrgSeats(orgId, SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT);
    await testServer.services.project.startSecretBlindIndexMigrationPerOrg(orgId, 3);
    await waitForProjectsEnabled(projectIds, 15_000);
    expect(await getOrgSlotCount(orgId)).toBe(0);
  });

  test("a single pod runs only one migration at a time across orgs", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const projectIdsA = await createDisabledProjects(orgA.authToken, 1);
    const projectIdsB = await createDisabledProjects(orgB.authToken, 1);
    const projectIds = [...projectIdsA, ...projectIdsB];

    await Promise.all([
      testServer.services.project.startSecretBlindIndexMigrationPerOrg(orgA.orgId, 1),
      testServer.services.project.startSecretBlindIndexMigrationPerOrg(orgB.orgId, 1)
    ]);

    const peakInFlight = await waitForProjectsEnabledAndPeakInFlight(projectIds, [orgA.orgId, orgB.orgId], 20_000);
    expect(peakInFlight).toBeLessThanOrEqual(SECRET_BLIND_INDEX_MIGRATION_WORKER_CONCURRENCY);
    expect(await getOrgSlotCount(orgA.orgId)).toBe(0);
    expect(await getOrgSlotCount(orgB.orgId)).toBe(0);
  });
});
