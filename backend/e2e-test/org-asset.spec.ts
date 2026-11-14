import { TableName } from "@app/db/schemas";
import { orgAssetDALFactory } from "@app/services/org-asset/org-asset-dal";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { pollUntil } from "./testUtils/poll";

describe("organization asset upserts", () => {
  test.each([false, true])("concurrent first uploads reuse one asset row (mixed case: %s)", async (mixedCase) => {
    const { orgId, cleanup } = await createIsolatedOrgAndProject("asset-race");
    const dal = orgAssetDALFactory(testDb);
    const blocker = await testDb.transaction();
    let uploads: Promise<unknown> | undefined;

    try {
      // Let both callers reach the race while preventing either INSERT from completing.
      await blocker.raw("LOCK TABLE organization_assets IN SHARE MODE");
      const values = [Buffer.from("first"), Buffer.from("second")];
      const pending = values.map((value, index) =>
        dal.upsertFirstAsset(
          mixedCase && index === 1 ? orgId.toUpperCase() : orgId,
          "brand-logo",
          value,
          "image/png",
          value.length
        )
      );
      uploads = Promise.all(pending);

      await pollUntil({
        describe: "both asset uploads waiting for database locks",
        read: async () => {
          const result = await testDb.raw<{ rows: { count: number }[] }>(`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND (query LIKE 'insert into "organization_assets"%'
                OR query = 'SELECT pg_advisory_xact_lock($1)')
          `);
          return result.rows[0].count;
        },
        done: (count) => count >= 2
      });

      await blocker.commit();
      const [first, second] = await Promise.all(pending);
      expect(first.id).toBe(second.id);

      // The API does not expose duplicate asset rows, so inspect the stored cardinality directly.
      const rows = await testDb(TableName.OrganizationAsset).where({ orgId, assetType: "brand-logo" });
      expect(rows).toHaveLength(1);
      expect(values.some((value) => value.equals(rows[0].data))).toBe(true);
      expect(rows[0].size).toBe(rows[0].data.length);
    } finally {
      if (!blocker.isCompleted()) await blocker.rollback();
      await uploads?.catch(() => undefined);
      await cleanup();
    }
  });
});
