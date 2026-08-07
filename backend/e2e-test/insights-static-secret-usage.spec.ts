import { randomUUID } from "node:crypto";

import { ForbiddenError } from "@casl/ability";
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
  TSecretsV2Insert,
  TUsersInsert
} from "@app/db/schemas";
import { insightsDALFactory } from "@app/ee/services/insights/insights-dal";
import { insightsServiceFactory } from "@app/ee/services/insights/insights-service";
import { TOrgInsightsDTO } from "@app/ee/services/insights/insights-types";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { buildOrgInsightsGateStubs, passThroughKeyStore, projectScopedInsightsDepStubs } from "./testUtils/insights";

declare const testDb: Knex;

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const USER_ID = randomUUID();

const WEEKS_IN_WINDOW = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// The UTC week rule is restated here rather than imported from insights-fns, so the expected
// buckets are derived independently of the implementation that produces them. It is the same
// three lines either way; sharing them would make every assertion below self-referential.
const mondayOfUtcWeek = (date: Date) => {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  return monday;
};

const shiftUtcDays = (date: Date, days: number) => {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);

  return shifted;
};

const toUtcDateString = (date: Date) => date.toISOString().slice(0, 10);

// weeksAgo(0) is the Monday of the week in progress, weeksAgo(11) the oldest week still in window.
const CURRENT_WEEK_START = mondayOfUtcWeek(new Date());
const weeksAgo = (count: number) => shiftUtcDays(CURRENT_WEEK_START, -count * 7);
const WINDOW_START = weeksAgo(WEEKS_IN_WINDOW - 1);

const EXPECTED_WEEK_STARTS = Array.from({ length: WEEKS_IN_WINDOW }, (_, index) =>
  toUtcDateString(weeksAgo(WEEKS_IN_WINDOW - 1 - index))
);

// One project per rule the org-wide query filters on. Only `counted` may contribute.
const projects = {
  counted: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `usage-${suffix}` },
  secondCounted: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    name: `usage-second-${suffix}`
  },
  otherProductType: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `pam-${suffix}` },
  deletedProject: { projectId: randomUUID(), envId: randomUUID(), folderId: randomUUID(), name: `del-${suffix}` },
  deletedEnvironment: {
    projectId: randomUUID(),
    envId: randomUUID(),
    folderId: randomUUID(),
    name: `delenv-${suffix}`
  },
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

// createdAt is what the weekly bucketing reads, and the generated insert type omits it because the
// column is defaulted. Backdating has to happen at INSERT: secrets_v2 carries an on-update trigger,
// so a later UPDATE would only move updatedAt anyway, and createdAt is not writable through the DAL.
const secret = (folderId: string, createdAt: Date, overrides: Partial<TSecretsV2Insert> = {}) =>
  ({
    id: randomUUID(),
    key: `SECRET_${randomUUID().slice(0, 8)}`,
    folderId,
    createdAt,
    ...overrides
  }) as TSecretsV2Insert & { id: string };

// Half a week past the Monday, so a fixture cannot land in a neighbouring bucket through rounding.
const midWeek = (weekStart: Date) => new Date(weekStart.getTime() + 3 * DAY_MS + 12 * 60 * 60 * 1000);

describe("insights static secrets usage", () => {
  beforeAll(async () => {
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ORG_ID, name: `usage-${suffix}`, slug: `usage-${suffix}` },
      { id: OTHER_ORG_ID, name: `usage-other-${suffix}`, slug: `usage-other-${suffix}` }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    // Owner of the personal-override secret that must be excluded from the counts.
    const userRows: (TUsersInsert & { id: string })[] = [
      { id: USER_ID, username: `usage-user-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const projectRows: (TProjectsInsert & { id: string })[] = projectList.map((p) => ({
      id: p.projectId,
      name: p.name,
      slug: p.name,
      orgId: p === projects.otherOrg ? OTHER_ORG_ID : ORG_ID,
      type: p === projects.otherProductType ? ProjectType.PAM : ProjectType.SecretManager,
      // Only v3 secret-manager projects are counted (the column defaults to v1).
      version: p === projects.oldVersion ? ProjectVersion.V1 : ProjectVersion.V3,
      ...(p === projects.deletedProject ? { deleteAfter: new Date() } : {})
    }));
    await testDb(TableName.Project).insert(projectRows);

    const environmentRows: (TProjectEnvironmentsInsert & { id: string })[] = projectList.map((p, index) => ({
      id: p.envId,
      name: "Development",
      slug: "dev",
      position: index + 1,
      projectId: p.projectId,
      ...(p === projects.deletedEnvironment ? { deleteAfter: new Date() } : {})
    }));
    await testDb(TableName.Environment).insert(environmentRows);

    const folderRows: (TSecretFoldersInsert & { id: string })[] = projectList.map((p) => ({
      id: p.folderId,
      name: "root",
      envId: p.envId,
      parentId: null
    }));
    await testDb(TableName.SecretFolder).insert(folderRows);

    const secretRows: (TSecretsV2Insert & { id: string })[] = [
      // Week in progress: 2. One sits exactly on the Monday boundary, which belongs to the current
      // week rather than the one before it (the history query is half-open at currentWeekStart).
      secret(projects.counted.folderId, CURRENT_WEEK_START),
      secret(projects.counted.folderId, new Date()),
      // Last week: 3, spread over two projects so the aggregate is genuinely org-wide.
      secret(projects.counted.folderId, midWeek(weeksAgo(1))),
      secret(projects.counted.folderId, midWeek(weeksAgo(1))),
      secret(projects.secondCounted.folderId, midWeek(weeksAgo(1))),
      // Oldest week still in window: 1, exactly on the inclusive lower bound.
      secret(projects.counted.folderId, WINDOW_START),
      // One millisecond before the window opens: dropped entirely.
      secret(projects.counted.folderId, new Date(WINDOW_START.getTime() - 1)),
      // Excluded by scope. All dated to last week, so a leak shows up as 4 instead of 3.
      secret(projects.counted.folderId, midWeek(weeksAgo(1)), { userId: USER_ID, type: "personal" }),
      secret(projects.otherProductType.folderId, midWeek(weeksAgo(1))),
      secret(projects.deletedProject.folderId, midWeek(weeksAgo(1))),
      secret(projects.deletedEnvironment.folderId, midWeek(weeksAgo(1))),
      secret(projects.oldVersion.folderId, midWeek(weeksAgo(1))),
      secret(projects.otherOrg.folderId, midWeek(weeksAgo(1)))
    ];
    await testDb(TableName.SecretV2).insert(secretRows);
  });

  afterAll(async () => {
    const orgIds = [ORG_ID, OTHER_ORG_ID];
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

  test("returns twelve UTC calendar weeks, oldest first, with only the last one partial", async () => {
    const { weeks } = await insightsService.getStaticSecretsUsage(actor(ORG_ID));

    expect(weeks).toHaveLength(WEEKS_IN_WINDOW);
    expect(weeks.map((week) => week.weekStart)).toEqual(EXPECTED_WEEK_STARTS);
    expect(weeks.map((week) => week.isPartial)).toEqual([...Array(WEEKS_IN_WINDOW - 1).fill(false), true]);
  });

  test("counts creations into the week they happened in and zero-fills the rest", async () => {
    const { weeks } = await insightsService.getStaticSecretsUsage(actor(ORG_ID));
    const countFor = (weekStart: Date) => weeks.find((week) => week.weekStart === toUtcDateString(weekStart));

    // The Monday-boundary secret and the one created now.
    expect(countFor(CURRENT_WEEK_START)).toMatchObject({ totalSecrets: 2, isPartial: true });
    // Two in the counted project and one in the second, across the same org.
    expect(countFor(weeksAgo(1))).toMatchObject({ totalSecrets: 3, isPartial: false });
    // The secret sitting exactly on the inclusive lower bound of the window.
    expect(countFor(WINDOW_START)).toMatchObject({ totalSecrets: 1, isPartial: false });

    // Every other week saw nothing and is reported as zero rather than skipped.
    const populated = new Set([CURRENT_WEEK_START, weeksAgo(1), WINDOW_START].map(toUtcDateString));
    expect(weeks.filter((week) => !populated.has(week.weekStart)).map((week) => week.totalSecrets)).toEqual(
      Array(WEEKS_IN_WINDOW - 3).fill(0)
    );

    // The secret created one millisecond before the window is the only one unaccounted for.
    expect(weeks.reduce((sum, week) => sum + week.totalSecrets, 0)).toBe(6);
  });

  test("a newly created secret lands in the week in progress", async () => {
    const before = await insightsService.getStaticSecretsUsage(actor(ORG_ID));
    const beforeCurrent = before.weeks[before.weeks.length - 1].totalSecrets;

    const added = secret(projects.counted.folderId, new Date());
    await testDb(TableName.SecretV2).insert(added);

    try {
      const after = await insightsService.getStaticSecretsUsage(actor(ORG_ID));
      expect(after.weeks[after.weeks.length - 1].totalSecrets).toBe(beforeCurrent + 1);
      // Only the week in progress moves; the closed weeks are untouched.
      expect(after.weeks.slice(0, -1)).toEqual(before.weeks.slice(0, -1));
    } finally {
      await testDb(TableName.SecretV2).where("id", added.id).delete();
    }
  });

  test("an organization that has created nothing reports twelve zeroed weeks", async () => {
    const { weeks } = await insightsService.getStaticSecretsUsage(actor(randomUUID()));

    expect(weeks.map((week) => week.weekStart)).toEqual(EXPECTED_WEEK_STARTS);
    expect(weeks.every((week) => week.totalSecrets === 0)).toBe(true);
  });

  test("throws when the actor cannot read secrets management insights", async () => {
    setCanReadInsights(false);
    try {
      await expect(insightsService.getStaticSecretsUsage(actor(ORG_ID))).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      setCanReadInsights(true);
    }
  });

  test("throws when the plan does not include secret access insights", async () => {
    setPlanHasInsights(false);
    try {
      await expect(insightsService.getStaticSecretsUsage(actor(ORG_ID))).rejects.toThrow(/Upgrade your plan/);
    } finally {
      setPlanHasInsights(true);
    }
  });
});
