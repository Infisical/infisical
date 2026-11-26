import { down, up } from "@app/db/migrations/20261125120000_merge-secret-scanning-findings-across-resources";
import {
  TableName,
  TSecretScanningFindingLocationsInsert,
  TSecretScanningFindings,
  TSecretScanningFindingsInsert
} from "@app/db/schemas";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";

import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "./secret-scanning-v2-enums";

// The migration merges every project in the database it runs on, so this file gets a database of its own.
describe("merge secret scanning findings across resources", () => {
  const h = setupIntegration({ freshDatabase: true });

  const setup = async () => {
    const tn = await h.newTenant();
    const [dataSource] = await h
      .db(TableName.SecretScanningDataSource)
      .insert({
        name: `ds-${randomId()}`,
        type: SecretScanningDataSource.GitHub,
        config: {},
        projectId: tn.project.id
      })
      .returning("*");

    const resource = async (name: string) => {
      const [created] = await h
        .db(TableName.SecretScanningResource)
        .insert({ externalId: randomId(), name, dataSourceId: dataSource.id })
        .returning("*");
      const [scan] = await h
        .db(TableName.SecretScanningScan)
        .insert({
          resourceId: created.id,
          type: SecretScanningScanType.Historical,
          status: SecretScanningScanStatus.Completed
        })
        .returning("*");
      return { ...created, scanId: scan.id as string };
    };

    // A finding per resource, as the release before the merge saves them, with one location unless told otherwise.
    const finding = async (
      { id: resourceId, scanId }: { id: string; scanId: string },
      overrides: Partial<TSecretScanningFindingsInsert> & { createdAt: Date; withoutLocation?: boolean }
    ) => {
      const { createdAt, withoutLocation, ...rest } = overrides;
      const fingerprint = `fp-${randomId()}`;
      // createdAt isn't insertable in the app's types, but these rows need it to have an order
      const [created] = await h
        .db(TableName.SecretScanningFinding)
        .insert({
          resourceId,
          scanId,
          rule: "generic-api-key",
          severity: "high",
          fingerprint,
          details: {},
          secretFindingBlindIndex: "value-a",
          lastDetectedAt: createdAt,
          createdAt,
          ...rest
        } as TSecretScanningFindingsInsert)
        .returning("*");
      if (!withoutLocation) {
        await h.db(TableName.SecretScanningFindingLocation).insert({
          findingId: created.id,
          resourceId,
          scanId,
          fingerprint,
          rule: "generic-api-key",
          details: {},
          createdAt
        } as TSecretScanningFindingLocationsInsert);
      }
      return created;
    };

    const findingsOfValue = async () =>
      (await h
        .db(TableName.SecretScanningFinding)
        .join(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningFinding}.resourceId`
        )
        .where(`${TableName.SecretScanningResource}.dataSourceId`, dataSource.id)
        .where(`${TableName.SecretScanningFinding}.secretFindingBlindIndex`, "value-a")
        .select(`${TableName.SecretScanningFinding}.*`)) as TSecretScanningFindings[];

    const locationsOf = (findingId: string) => h.db(TableName.SecretScanningFindingLocation).where({ findingId });

    return { resource, finding, findingsOfValue, locationsOf };
  };

  test("should merge a value's findings into the oldest, with every location", async () => {
    // Setup
    const s = await setup();
    const [a, b, c] = [await s.resource("repo-a"), await s.resource("repo-b"), await s.resource("repo-c")];
    const oldest = await s.finding(a, { createdAt: new Date("2026-01-01") });
    const second = await s.finding(b, { createdAt: new Date("2026-02-01") });
    const unlocated = await s.finding(c, { createdAt: new Date("2026-03-01"), withoutLocation: true });

    // Action
    await up(h.db);

    // Assert
    const findings = await s.findingsOfValue();
    expect(findings.map(({ id }) => id)).toEqual([oldest.id]);
    const locations = await s.locationsOf(oldest.id);
    expect(locations.map(({ resourceId }) => resourceId).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(locations.map(({ id }) => id)).toEqual(expect.arrayContaining([second.id, unlocated.id]));
  });

  test("should keep the safest verdict and note the others", async () => {
    // Setup
    const s = await setup();
    const [a, b, c] = [await s.resource("repo-a"), await s.resource("repo-b"), await s.resource("repo-c")];
    const oldest = await s.finding(a, {
      createdAt: new Date("2026-01-01"),
      status: SecretScanningFindingStatus.FalsePositive,
      triagedAt: new Date("2026-01-02"),
      triageComment: "test fixture"
    });
    await s.finding(b, {
      createdAt: new Date("2026-01-03"),
      status: SecretScanningFindingStatus.Resolved,
      triagedAt: new Date("2026-01-04"),
      resolvedAt: new Date("2026-01-04"),
      triageComment: "rotated"
    });
    await s.finding(c, {
      createdAt: new Date("2026-01-05"),
      status: SecretScanningFindingStatus.Ignore,
      triagedAt: new Date("2026-01-06")
    });

    // Action
    await up(h.db);

    // Assert
    const [merged] = await s.findingsOfValue();
    expect(merged).toMatchObject({ id: oldest.id, status: SecretScanningFindingStatus.Resolved });
    expect(merged.triageComment).toBe(
      [
        "rotated",
        "",
        "Merged from repo-a: false positive on 2026-01-02: test fixture",
        "Merged from repo-c: ignored on 2026-01-06"
      ].join("\n")
    );
  });

  test("should let an unresolved finding reopen the value", async () => {
    // Setup
    const s = await setup();
    const [a, b] = [await s.resource("repo-a"), await s.resource("repo-b")];
    const oldest = await s.finding(a, {
      createdAt: new Date("2026-01-01"),
      status: SecretScanningFindingStatus.FalsePositive,
      triagedAt: new Date("2026-03-01")
    });
    await s.finding(b, { createdAt: new Date("2026-02-01") });

    // Action
    await up(h.db);

    // Assert
    const [merged] = await s.findingsOfValue();
    expect(merged).toMatchObject({ id: oldest.id, status: SecretScanningFindingStatus.Unresolved });
  });

  test("should treat an untriaged copy saved after the verdict as a new place, which only reopens a resolved finding", async () => {
    // Setup
    const s = await setup();
    const [a, b, c, d] = [
      await s.resource("repo-a"),
      await s.resource("repo-b"),
      await s.resource("repo-c"),
      await s.resource("repo-d")
    ];
    const falsePositive = await s.finding(a, {
      createdAt: new Date("2026-01-01"),
      status: SecretScanningFindingStatus.FalsePositive,
      triagedAt: new Date("2026-01-02")
    });
    await s.finding(b, { createdAt: new Date("2026-01-03"), secretFindingBlindIndex: "value-a" });
    const resolved = await s.finding(c, {
      createdAt: new Date("2026-01-01"),
      status: SecretScanningFindingStatus.Resolved,
      triagedAt: new Date("2026-01-02"),
      resolvedAt: new Date("2026-01-02"),
      secretFindingBlindIndex: "value-b"
    });
    await s.finding(d, { createdAt: new Date("2026-01-03"), secretFindingBlindIndex: "value-b" });

    // Action
    await up(h.db);

    // Assert
    const statusOf = async (id: string) => (await h.db(TableName.SecretScanningFinding).where({ id }).first())?.status;
    expect(await statusOf(falsePositive.id)).toBe(SecretScanningFindingStatus.FalsePositive);
    expect(await statusOf(resolved.id)).toBe(SecretScanningFindingStatus.Unresolved);
  });

  test("should change nothing when run again, and split findings back per resource on down", async () => {
    // Setup
    const s = await setup();
    const [a, b] = [await s.resource("repo-a"), await s.resource("repo-b")];
    const oldest = await s.finding(a, { createdAt: new Date("2026-01-01") });
    await s.finding(b, { createdAt: new Date("2026-02-01") });
    await up(h.db);
    const merged = await s.findingsOfValue();

    // Action
    await up(h.db);
    const rerun = await s.findingsOfValue();
    await down(h.db);

    // Assert
    expect(rerun).toEqual(merged);
    const split = await s.findingsOfValue();
    expect(split.map(({ resourceId }) => resourceId).sort()).toEqual([a.id, b.id].sort());
    expect(split.find(({ resourceId }) => resourceId === a.id)?.id).toBe(oldest.id);
    for (const finding of split) {
      // eslint-disable-next-line no-await-in-loop
      const locations = await s.locationsOf(finding.id);
      expect(locations.map(({ resourceId }) => resourceId)).toEqual([finding.resourceId]);
    }
  });
});
