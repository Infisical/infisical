import { TableName, TSecretScanningFindingLocationsInsert } from "@app/db/schemas";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";
import { OrderByDirection } from "@app/lib/types";

import { secretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus,
  SecretScanningResourceOrderBy,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "./secret-scanning-v2-enums";
import { TFindingLocationRow } from "./secret-scanning-v2-types";

const row = (secretFindingBlindIndex: string | null, fingerprint: string): TFindingLocationRow => ({
  fingerprint,
  rule: "generic-api-key",
  severity: "high",
  details: {},
  secretFindingBlindIndex
});

describe("secretScanningV2DAL findings", () => {
  const h = setupIntegration();

  const setup = async () => {
    const tn = await h.newTenant();
    const projectId = tn.project.id;
    const dal = secretScanningV2DALFactory(h.db);

    const [dataSource] = await h
      .db(TableName.SecretScanningDataSource)
      .insert({ name: `ds-${randomId()}`, type: SecretScanningDataSource.GitHub, config: {}, projectId })
      .returning("*");

    const resource = async () => {
      const [created] = await h
        .db(TableName.SecretScanningResource)
        .insert({ externalId: randomId(), name: `repo-${randomId()}`, dataSourceId: dataSource.id })
        .returning("*");
      return created;
    };

    const scan = async (resourceId: string, status = SecretScanningScanStatus.Completed) => {
      const [created] = await h
        .db(TableName.SecretScanningScan)
        .insert({ resourceId, type: SecretScanningScanType.Historical, status })
        .returning("*");
      return created;
    };

    const persist = (resourceId: string, scanId: string, rows: TFindingLocationRow[]) =>
      h.db.transaction((tx) => dal.findings.persistLocations({ projectId, resourceId, scanId, rows }, tx));

    // Rows as a release that grouped findings across resources, or one before isFirstInResource, would leave them.
    const finding = async ({
      resourceId,
      scanId,
      blindIndex = null,
      status = SecretScanningFindingStatus.Unresolved
    }: {
      resourceId: string;
      scanId: string;
      blindIndex?: string | null;
      status?: SecretScanningFindingStatus;
    }) => {
      const [created] = await h
        .db(TableName.SecretScanningFinding)
        .insert({
          resourceId,
          scanId,
          rule: "generic-api-key",
          severity: "high",
          fingerprint: `fp-${randomId()}`,
          details: {},
          secretFindingBlindIndex: blindIndex,
          status,
          lastDetectedAt: new Date()
        })
        .returning("*");
      return created;
    };

    const location = async ({
      findingId,
      resourceId,
      scanId,
      isFirstInResource = null,
      createdAt = new Date()
    }: {
      findingId: string;
      resourceId: string;
      scanId: string;
      isFirstInResource?: boolean | null;
      createdAt?: Date;
    }) => {
      // createdAt isn't insertable in the app's types, but these rows need it to have an order
      const [created] = await h
        .db(TableName.SecretScanningFindingLocation)
        .insert({
          findingId,
          resourceId,
          scanId,
          fingerprint: `fp-${randomId()}`,
          rule: "generic-api-key",
          details: {},
          isFirstInResource,
          createdAt
        } as TSecretScanningFindingLocationsInsert)
        .returning("*");
      return created;
    };

    const locationsOf = (findingId: string) =>
      h.db(TableName.SecretScanningFindingLocation).where({ findingId }).orderBy("fingerprint");

    const listIds = async (filter: { resourceId?: string; dataSourceId?: string }) => {
      const { findings, totalCount } = await dal.findings.findByProjectId(projectId, {
        ...filter,
        orderBy: SecretScanningFindingOrderBy.CreatedAt,
        orderDirection: OrderByDirection.ASC,
        offset: 0,
        limit: 100
      });
      return { ids: findings.map(({ id }) => id).sort(), totalCount };
    };

    const unresolvedByResource = async () => {
      const { resources } = await dal.resources.findWithDetailsByDataSourceId(dataSource.id, {
        orderBy: SecretScanningResourceOrderBy.Name,
        orderDirection: OrderByDirection.ASC,
        offset: 0,
        limit: 100
      });
      return Object.fromEntries(resources.map(({ id, unresolvedFindings }) => [id, unresolvedFindings]));
    };

    return {
      projectId,
      dataSource,
      dal,
      resource,
      scan,
      persist,
      finding,
      location,
      locationsOf,
      listIds,
      unresolvedByResource
    };
  };

  describe("persistLocations", () => {
    test("should mark only a value's first location in a resource as news", async () => {
      // Setup
      const s = await setup();
      const repo = await s.resource();
      const first = await s.scan(repo.id);
      const second = await s.scan(repo.id);

      // Action
      await s.persist(repo.id, first.id, [row("value-a", "fp-1"), row("value-a", "fp-2"), row(null, "fp-3")]);
      const later = await s.persist(repo.id, second.id, [row("value-a", "fp-4")]);

      // Assert
      const valueA = later.scannedLocations[0].id;
      expect((await s.locationsOf(valueA)).map(({ isFirstInResource }) => isFirstInResource)).toEqual([
        true,
        false,
        false
      ]);
      expect(await s.dal.findings.countNewUnresolvedByScanId(first.id)).toBe(2);
      expect(await s.dal.findings.countNewUnresolvedByScanId(second.id)).toBe(0);
    });

    test("should not count a value the resource already has through another finding as news", async () => {
      // Setup
      const s = await setup();
      const [repo, other] = [await s.resource(), await s.resource()];
      const earlier = await s.scan(other.id);
      const shared = await s.finding({ resourceId: other.id, scanId: earlier.id, blindIndex: "value-a" });
      await s.location({ findingId: shared.id, resourceId: other.id, scanId: earlier.id, isFirstInResource: true });
      const earlierHere = await s.scan(repo.id);
      await s.location({ findingId: shared.id, resourceId: repo.id, scanId: earlierHere.id, isFirstInResource: true });
      const current = await s.scan(repo.id);

      // Action
      const persisted = await s.persist(repo.id, current.id, [row("value-a", "fp-new")]);

      // Assert
      const [saved] = await s.locationsOf(persisted.scannedLocations[0].id);
      expect(saved.isFirstInResource).toBe(false);
      expect(await s.dal.findings.countNewUnresolvedByScanId(current.id)).toBe(0);
    });

    test("should count a location saved before isFirstInResource only for the scan that created its finding", async () => {
      // Setup
      const s = await setup();
      const repo = await s.resource();
      const [creating, other] = [await s.scan(repo.id), await s.scan(repo.id)];
      const created = await s.finding({ resourceId: repo.id, scanId: creating.id, blindIndex: "value-a" });
      await s.location({ findingId: created.id, resourceId: repo.id, scanId: creating.id });
      const older = await s.finding({ resourceId: repo.id, scanId: other.id, blindIndex: "value-b" });
      await s.location({ findingId: older.id, resourceId: repo.id, scanId: creating.id });

      // Action
      const count = await s.dal.findings.countNewUnresolvedByScanId(creating.id);

      // Assert
      expect(count).toBe(1);
    });

    test("should count a finding that is both new and reopened once", async () => {
      // Setup
      const s = await setup();
      const repo = await s.resource();
      const first = await s.scan(repo.id);
      const persisted = await s.persist(repo.id, first.id, [row("value-a", "fp-1")]);
      const findingId = persisted.scannedLocations[0].id;

      // Action
      const count = await s.dal.findings.countNewUnresolvedByScanId(first.id, { alsoIds: [findingId, findingId] });

      // Assert
      expect(count).toBe(1);
    });

    test("should reopen a resolved finding without counting a value the resource had as news", async () => {
      // Setup
      const s = await setup();
      const repo = await s.resource();
      const first = await s.scan(repo.id);
      const persisted = await s.persist(repo.id, first.id, [row("value-a", "fp-1")]);
      const findingId = persisted.scannedLocations[0].id;
      await h
        .db(TableName.SecretScanningFinding)
        .where({ id: findingId })
        .update({ status: SecretScanningFindingStatus.Resolved });
      const push = await s.scan(repo.id);

      // Action
      const { reopenedFindings } = await s.persist(repo.id, push.id, [row("value-a", "fp-2")]);

      // Assert
      expect(reopenedFindings.map(({ id }) => id)).toEqual([findingId]);
      expect(await s.dal.findings.countNewUnresolvedByScanId(push.id)).toBe(0);
      expect(await s.dal.findings.countNewUnresolvedByScanId(push.id, { alsoIds: [findingId] })).toBe(1);
    });
  });

  describe("detachResources", () => {
    test("should keep a finding with locations elsewhere and point it at one of them", async () => {
      // Setup
      const s = await setup();
      const [removed, kept] = [await s.resource(), await s.resource()];
      const removedScan = await s.scan(removed.id);
      const [running, completed] = [
        await s.scan(kept.id, SecretScanningScanStatus.Scanning),
        await s.scan(kept.id, SecretScanningScanStatus.Completed)
      ];
      const shared = await s.finding({ resourceId: removed.id, scanId: removedScan.id, blindIndex: "value-a" });
      await s.location({ findingId: shared.id, resourceId: removed.id, scanId: removedScan.id });
      await s.location({
        findingId: shared.id,
        resourceId: kept.id,
        scanId: running.id,
        createdAt: new Date("2026-01-01")
      });
      const target = await s.location({
        findingId: shared.id,
        resourceId: kept.id,
        scanId: completed.id,
        createdAt: new Date("2026-02-01")
      });
      const onlyRemoved = await s.finding({ resourceId: removed.id, scanId: removedScan.id, blindIndex: "value-b" });
      await s.location({ findingId: onlyRemoved.id, resourceId: removed.id, scanId: removedScan.id });
      const unlocated = await s.finding({ resourceId: kept.id, scanId: completed.id });

      // Action
      await h.db.transaction(async (tx) => {
        await s.dal.findings.detachResources({ projectId: s.projectId, resourceIds: [removed.id] }, tx);
        await tx(TableName.SecretScanningResource).where({ id: removed.id }).delete();
      });

      // Assert
      const survivor = await h.db(TableName.SecretScanningFinding).where({ id: shared.id }).first();
      expect(survivor).toMatchObject({
        resourceId: kept.id,
        scanId: completed.id,
        fingerprint: target.fingerprint
      });
      expect(await s.locationsOf(shared.id)).toHaveLength(2);
      expect(await h.db(TableName.SecretScanningFinding).where({ id: onlyRemoved.id }).first()).toBeUndefined();
      expect(await h.db(TableName.SecretScanningFinding).where({ id: unlocated.id }).first()).toBeDefined();
    });

    test("should delete a resource's findings like the cascade did when they have no other location", async () => {
      // Setup
      const s = await setup();
      const repo = await s.resource();
      const scan = await s.scan(repo.id);
      await s.persist(repo.id, scan.id, [row("value-a", "fp-1"), row(null, "fp-2")]);
      const unlocated = await s.finding({ resourceId: repo.id, scanId: scan.id });

      // Action
      await h.db.transaction((tx) =>
        s.dal.findings.detachResources({ projectId: s.projectId, resourceIds: [repo.id] }, tx)
      );

      // Assert
      expect(await h.db(TableName.SecretScanningFinding).whereIn("resourceId", [repo.id])).toEqual([]);
      expect(await h.db(TableName.SecretScanningFindingLocation).where({ resourceId: repo.id })).toEqual([]);
      expect(await h.db(TableName.SecretScanningFinding).where({ id: unlocated.id }).first()).toBeUndefined();
    });
  });

  describe("reads by resource", () => {
    test("should place a finding in every resource it has a location in", async () => {
      // Setup
      const s = await setup();
      const [named, other, empty] = [await s.resource(), await s.resource(), await s.resource()];
      const [namedScan, otherScan] = [await s.scan(named.id), await s.scan(other.id)];
      const shared = await s.finding({ resourceId: named.id, scanId: namedScan.id, blindIndex: "value-a" });
      await s.location({ findingId: shared.id, resourceId: named.id, scanId: namedScan.id });
      await s.location({ findingId: shared.id, resourceId: other.id, scanId: otherScan.id });
      const unlocated = await s.finding({ resourceId: other.id, scanId: otherScan.id });

      // Action
      const inOther = await s.listIds({ resourceId: other.id });
      const inEmpty = await s.listIds({ resourceId: empty.id });
      const inDataSource = await s.listIds({ dataSourceId: s.dataSource.id });
      const counts = await s.unresolvedByResource();

      // Assert
      expect(inOther).toEqual({ ids: [shared.id, unlocated.id].sort(), totalCount: 2 });
      expect(inEmpty).toEqual({ ids: [], totalCount: 0 });
      expect(inDataSource.totalCount).toBe(2);
      expect(counts).toEqual({ [named.id]: 1, [other.id]: 2, [empty.id]: 0 });
    });

    test("should lock only the check's findings that have a location in its resource", async () => {
      // Setup
      const s = await setup();
      const [checked, other] = [await s.resource(), await s.resource()];
      const [checkedScan, otherScan] = [await s.scan(checked.id), await s.scan(other.id)];
      const shared = await s.finding({ resourceId: other.id, scanId: otherScan.id, blindIndex: "value-a" });
      const sharedHere = await s.location({ findingId: shared.id, resourceId: checked.id, scanId: checkedScan.id });
      const sharedThere = await s.location({ findingId: shared.id, resourceId: other.id, scanId: otherScan.id });
      const elsewhere = await s.finding({ resourceId: other.id, scanId: otherScan.id, blindIndex: "value-b" });
      await s.location({ findingId: elsewhere.id, resourceId: other.id, scanId: otherScan.id });

      // Action
      const lock = (ids: string[]) =>
        h.db.transaction(async (tx) =>
          (await s.dal.findings.findByIdsOrLocationIdsForUpdate(checked.id, ids, tx)).map(({ id }) => id)
        );

      // Assert
      expect(await lock([shared.id, elsewhere.id])).toEqual([shared.id]);
      expect(await lock([sharedHere.id])).toEqual([shared.id]);
      expect(await lock([sharedThere.id])).toEqual([]);
    });
  });
});
