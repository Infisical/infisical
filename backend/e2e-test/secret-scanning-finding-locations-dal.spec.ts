import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { secretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import {
  SecretScanningFindingStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";

const secretScanningV2DAL = secretScanningV2DALFactory(testDb);

// A finding is one secret value in a resource, and every place a scan found it is a location of that finding.
describe("Secret scanning finding locations", () => {
  let cleanup: () => Promise<void>;
  let resourceId: string;
  let scanId: string;

  beforeAll(async () => {
    const { projectId, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("finding-locations");
    cleanup = cleanupOrg;

    const [dataSource] = await testDb(TableName.SecretScanningDataSource)
      .insert({ name: `ds-${randomUUID().slice(0, 8)}`, type: "github", config: {}, projectId })
      .returning("id");
    const [resource] = await testDb(TableName.SecretScanningResource)
      .insert({ externalId: randomUUID(), name: "acme/api", dataSourceId: dataSource.id })
      .returning("id");
    resourceId = resource.id;
    const [scan] = await testDb(TableName.SecretScanningScan)
      .insert({ type: SecretScanningScanType.Realtime, resourceId })
      .returning("id");
    scanId = scan.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  const row = (fingerprint: string, secretFindingBlindIndex: string) => ({
    fingerprint,
    rule: "github-pat",
    severity: "high",
    details: { file: fingerprint, author: "dev" },
    secretFindingBlindIndex
  });

  const persist = (rows: ReturnType<typeof row>[]) =>
    secretScanningV2DAL.findings.transaction((tx) =>
      secretScanningV2DAL.findings.persistLocations({ resourceId, scanId, rows }, tx)
    );

  const findingOf = async (id: string) => (await testDb(TableName.SecretScanningFinding).where({ id }).first())!;

  const locationsOf = (findingId: string) =>
    testDb(TableName.SecretScanningFindingLocation).where({ findingId }).orderBy("fingerprint").pluck("fingerprint");

  test("saves one finding for a value found in several places", async () => {
    const value = randomUUID();

    const { scannedLocations } = await persist([row(`${value}:a`, value), row(`${value}:b`, value)]);

    const findingIds = [...new Set(scannedLocations.map(({ id }) => id))];
    expect(findingIds).toHaveLength(1);
    expect(await locationsOf(findingIds[0])).toEqual([`${value}:a`, `${value}:b`]);
    // the release before locations existed reads the finding's own columns
    expect((await findingOf(findingIds[0])).fingerprint).toBe(`${value}:a`);
  });

  test("changes nothing when a resolved finding is found again in a known place", async () => {
    const value = randomUUID();
    const { scannedLocations } = await persist([row(`${value}:a`, value)]);
    const findingId = scannedLocations[0].id;
    await testDb(TableName.SecretScanningFinding)
      .where({ id: findingId })
      .update({ status: SecretScanningFindingStatus.Resolved });

    const { reopenedFindings } = await persist([row(`${value}:a`, value)]);

    expect(reopenedFindings).toEqual([]);
    expect((await findingOf(findingId)).status).toBe(SecretScanningFindingStatus.Resolved);
  });

  test("reopens a resolved finding found in a new place", async () => {
    const value = randomUUID();
    const { scannedLocations } = await persist([row(`${value}:a`, value)]);
    const findingId = scannedLocations[0].id;
    await testDb(TableName.SecretScanningFinding)
      .where({ id: findingId })
      .update({ status: SecretScanningFindingStatus.Resolved, resolvedAt: new Date() });

    const { reopenedFindings, scannedLocations: rescanned } = await persist([row(`${value}:b`, value)]);

    expect(reopenedFindings).toEqual([{ id: findingId, rule: "github-pat" }]);
    expect(rescanned[0].status).toBe(SecretScanningFindingStatus.Unresolved);
    expect(await findingOf(findingId)).toMatchObject({
      status: SecretScanningFindingStatus.Unresolved,
      resolvedAt: null
    });
  });

  test.each([SecretScanningFindingStatus.FalsePositive, SecretScanningFindingStatus.Ignore])(
    "keeps a %s finding's status when it's found in a new place",
    async (status) => {
      const value = randomUUID();
      const { scannedLocations } = await persist([row(`${value}:a`, value)]);
      const findingId = scannedLocations[0].id;
      await testDb(TableName.SecretScanningFinding).where({ id: findingId }).update({ status });

      const { reopenedFindings } = await persist([row(`${value}:b`, value)]);

      expect(reopenedFindings).toEqual([]);
      expect((await findingOf(findingId)).status).toBe(status);
      expect(await locationsOf(findingId)).toEqual([`${value}:a`, `${value}:b`]);
    }
  );

  test("keeps a place saved before blind indexes existed on its own finding", async () => {
    const value = randomUUID();
    const fingerprint = `${value}:legacy`;
    const [legacy] = await testDb(TableName.SecretScanningFinding)
      .insert({
        resourceId,
        scanId,
        rule: "github-pat",
        severity: "high",
        fingerprint,
        details: {},
        lastDetectedAt: new Date()
      })
      .returning("id");
    await testDb(TableName.SecretScanningFindingLocation).insert({
      findingId: legacy.id,
      resourceId,
      scanId,
      fingerprint,
      rule: "github-pat",
      details: {}
    });

    const { scannedLocations } = await persist([row(fingerprint, value)]);

    expect(scannedLocations[0].id).toBe(legacy.id);
    expect(await testDb(TableName.SecretScanningFinding).where({ secretFindingBlindIndex: value })).toHaveLength(0);
  });

  // the release before locations existed saves a finding per place, so a rollback can leave a value with several
  test("adds new places to a value's oldest finding when it has several", async () => {
    const value = randomUUID();
    const [older, newer] = await testDb(TableName.SecretScanningFinding)
      .insert(
        [new Date("2026-01-01"), new Date("2026-02-01")].map((createdAt, index) => ({
          resourceId,
          scanId,
          rule: "github-pat",
          severity: "high",
          fingerprint: `${value}:old-${index}`,
          details: {},
          secretFindingBlindIndex: value,
          createdAt,
          lastDetectedAt: createdAt
        }))
      )
      .returning("id");

    const { scannedLocations } = await persist([row(`${value}:new`, value)]);

    expect(scannedLocations[0].id).toBe(older.id);
    expect(await locationsOf(newer.id)).toEqual([]);
  });
});
