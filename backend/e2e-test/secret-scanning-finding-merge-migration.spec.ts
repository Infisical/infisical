import { randomUUID } from "node:crypto";

import { down, up } from "@app/db/migrations/20261112190100_merge-secret-scanning-findings-by-value";
import { TableName } from "@app/db/schemas";
import {
  SecretScanningFindingStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";

// The merge turns every finding row into a location and merges the rows of one value in one resource into one finding.
// It runs in a transaction that's rolled back: its down and up rewrite every finding in the database, and the merge's
// temporary table only lives until the transaction ends.
describe("Migration: merge secret scanning findings by value", () => {
  let cleanup: () => Promise<void>;
  let resourceId: string;
  let otherResourceId: string;
  let scanId: string;
  let otherScanId: string;

  beforeAll(async () => {
    const { projectId, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("finding-merge-migration");
    cleanup = cleanupOrg;

    const [dataSource] = await testDb(TableName.SecretScanningDataSource)
      .insert({ name: `ds-${randomUUID().slice(0, 8)}`, type: "github", config: {}, projectId })
      .returning("id");
    const resources = await testDb(TableName.SecretScanningResource)
      .insert(["acme/api", "acme/web"].map((name) => ({ externalId: randomUUID(), name, dataSourceId: dataSource.id })))
      .returning("id");
    [resourceId, otherResourceId] = resources.map(({ id }) => id as string);
    const scans = await testDb(TableName.SecretScanningScan)
      .insert(resources.map(({ id }) => ({ type: SecretScanningScanType.Historical, resourceId: id })))
      .returning("id");
    [scanId, otherScanId] = scans.map(({ id }) => id as string);
  });

  afterAll(async () => {
    await cleanup();
  });

  test("merges one value's findings in a resource, and down brings every row back under its own id", async () => {
    const tx = await testDb.transaction();
    try {
      await down(tx);

      const value = randomUUID();
      const otherValue = randomUUID();
      const finding = (
        name: string,
        fields: {
          secretFindingBlindIndex: string | null;
          status: SecretScanningFindingStatus;
          createdAt: string;
          triagedAt?: string;
          inOtherResource?: boolean;
        }
      ) => ({
        id: randomUUID(),
        resourceId: fields.inOtherResource ? otherResourceId : resourceId,
        scanId: fields.inOtherResource ? otherScanId : scanId,
        rule: "github-pat",
        severity: "high",
        fingerprint: `${value}:${name}`,
        details: { name },
        secretFindingBlindIndex: fields.secretFindingBlindIndex,
        status: fields.status,
        createdAt: new Date(fields.createdAt),
        lastDetectedAt: new Date(fields.createdAt),
        triagedAt: fields.triagedAt ? new Date(fields.triagedAt) : null
      });

      const open = finding("open", {
        secretFindingBlindIndex: value,
        status: SecretScanningFindingStatus.Unresolved,
        createdAt: "2026-01-03"
      });
      const resolved = finding("resolved", {
        secretFindingBlindIndex: value,
        status: SecretScanningFindingStatus.Resolved,
        createdAt: "2026-01-01",
        triagedAt: "2026-02-01"
      });
      const falsePositive = finding("false-positive", {
        secretFindingBlindIndex: value,
        status: SecretScanningFindingStatus.FalsePositive,
        createdAt: "2026-01-05",
        triagedAt: "2026-03-01"
      });
      const olderTriage = finding("older-triage", {
        secretFindingBlindIndex: otherValue,
        status: SecretScanningFindingStatus.Resolved,
        createdAt: "2026-01-01",
        triagedAt: "2026-02-01"
      });
      const newerTriage = finding("newer-triage", {
        secretFindingBlindIndex: otherValue,
        status: SecretScanningFindingStatus.Ignore,
        createdAt: "2026-01-02",
        triagedAt: "2026-04-01"
      });
      const noValue = finding("no-value", {
        secretFindingBlindIndex: null,
        status: SecretScanningFindingStatus.Unresolved,
        createdAt: "2026-01-01"
      });
      const otherNoValue = finding("other-no-value", {
        secretFindingBlindIndex: null,
        status: SecretScanningFindingStatus.Resolved,
        createdAt: "2026-01-01",
        triagedAt: "2026-01-09"
      });
      const otherResource = finding("other-resource", {
        secretFindingBlindIndex: value,
        status: SecretScanningFindingStatus.Unresolved,
        createdAt: "2026-01-01",
        inOtherResource: true
      });
      const rows = [open, resolved, falsePositive, olderTriage, newerTriage, noValue, otherNoValue, otherResource];
      await tx(TableName.SecretScanningFinding).insert(rows);

      await up(tx);

      const ids = rows.map(({ id }) => id);
      const findings = await tx(TableName.SecretScanningFinding).whereIn("id", ids);
      // an unresolved row wins its value's merge, otherwise the most recent triage does
      expect(new Map(findings.map(({ id, status }) => [id, status]))).toEqual(
        new Map([
          [open.id, SecretScanningFindingStatus.Unresolved],
          [newerTriage.id, SecretScanningFindingStatus.Ignore],
          [noValue.id, SecretScanningFindingStatus.Unresolved],
          [otherNoValue.id, SecretScanningFindingStatus.Resolved],
          [otherResource.id, SecretScanningFindingStatus.Unresolved]
        ])
      );
      expect(findings.find(({ id }) => id === open.id)).toMatchObject({
        createdAt: new Date("2026-01-01"),
        lastDetectedAt: new Date("2026-01-05")
      });

      // every row is a location under its own id, so ids saved before the merge still resolve
      const locations = await tx(TableName.SecretScanningFindingLocation).whereIn("id", ids);
      expect(new Map(locations.map(({ id, findingId }) => [id, findingId]))).toEqual(
        new Map([
          [open.id, open.id],
          [resolved.id, open.id],
          [falsePositive.id, open.id],
          [olderTriage.id, newerTriage.id],
          [newerTriage.id, newerTriage.id],
          [noValue.id, noValue.id],
          [otherNoValue.id, otherNoValue.id],
          [otherResource.id, otherResource.id]
        ])
      );

      await down(tx);

      const restored = await tx(TableName.SecretScanningFinding).whereIn("id", ids);
      expect(restored.map(({ id }) => id).sort()).toEqual([...ids].sort());
      // a merged row comes back with the triage of the finding it was merged into
      expect(restored.find(({ id }) => id === resolved.id)?.status).toBe(SecretScanningFindingStatus.Unresolved);
      expect(restored.find(({ id }) => id === resolved.id)?.fingerprint).toBe(resolved.fingerprint);
    } finally {
      await tx.rollback();
    }
  });
});
