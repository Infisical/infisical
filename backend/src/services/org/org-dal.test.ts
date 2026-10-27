import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";

import { ORG_ACCESS_LOCK_ESCALATION_THRESHOLD, orgDALFactory } from "./org-dal";

const ROOT_ORG_ID = "root-org";
const SUB_ORG_ID = "sub-org";

const buildTx = (orgs: Record<string, { rootOrgId: string | null }>) => {
  const raws: [string, unknown[] | undefined][] = [];
  const tables: string[] = [];
  const queryBuilder = (table: string) => {
    tables.push(table);
    let id: string | undefined;
    const chain = {
      where: (filter: { id: string }) => {
        id = filter.id;
        return chain;
      },
      select: () => chain,
      first: async () => (id ? orgs[id] : undefined)
    };
    return chain;
  };
  const tx = Object.assign(queryBuilder, {
    raw: vi.fn(async (sql: string, bindings?: unknown[]) => {
      raws.push([sql, bindings]);
    })
  }) as unknown as Knex;
  return { tx, raws, tables };
};

const dal = orgDALFactory({} as never);

describe("lockActorsForOrgAccess", () => {
  test("takes the tenant shared, then every actor exclusive in one sorted statement", async () => {
    const { tx, raws, tables } = buildTx({ [ROOT_ORG_ID]: { rootOrgId: null } });

    await dal.lockActorsForOrgAccess({ orgId: ROOT_ORG_ID, actorIds: ["b", "a", "b"] }, tx);

    expect(tables).toEqual([TableName.Organization]);
    expect(raws).toEqual([
      ["SELECT pg_advisory_xact_lock_shared(?)", [PgSqlLock.OrgAccessReconcileScope(ROOT_ORG_ID)]],
      [
        "SELECT pg_advisory_xact_lock(k) FROM unnest(?::int[]) AS k",
        [[PgSqlLock.OrgAccessReconcile("a"), PgSqlLock.OrgAccessReconcile("b")]]
      ]
    ]);
  });

  test("scopes a sub-org to its root org, since a root-org group reaches the sub-org", async () => {
    const { tx, raws } = buildTx({ [SUB_ORG_ID]: { rootOrgId: ROOT_ORG_ID } });

    await dal.lockActorsForOrgAccess({ orgId: SUB_ORG_ID, actorIds: ["a"] }, tx);

    expect(raws[0]).toEqual([
      "SELECT pg_advisory_xact_lock_shared(?)",
      [PgSqlLock.OrgAccessReconcileScope(ROOT_ORG_ID)]
    ]);
  });

  test("escalates a bulk set to one exclusive tenant lock and no actor locks", async () => {
    const { tx, raws } = buildTx({ [SUB_ORG_ID]: { rootOrgId: ROOT_ORG_ID } });
    const actorIds = Array.from({ length: ORG_ACCESS_LOCK_ESCALATION_THRESHOLD + 1 }, (_, i) => `actor-${i}`);

    await dal.lockActorsForOrgAccess({ orgId: SUB_ORG_ID, actorIds }, tx);

    expect(raws).toEqual([["SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgAccessReconcileScope(ROOT_ORG_ID)]]]);
  });

  test("stays per actor exactly at the threshold", async () => {
    const { tx, raws } = buildTx({ [ROOT_ORG_ID]: { rootOrgId: null } });
    const actorIds = Array.from({ length: ORG_ACCESS_LOCK_ESCALATION_THRESHOLD }, (_, i) => `actor-${i}`);

    await dal.lockActorsForOrgAccess({ orgId: ROOT_ORG_ID, actorIds }, tx);

    expect(raws).toHaveLength(2);
    expect(raws[0][0]).toBe("SELECT pg_advisory_xact_lock_shared(?)");
    expect((raws[1][1] as number[][])[0]).toHaveLength(ORG_ACCESS_LOCK_ESCALATION_THRESHOLD);
  });

  test("locks nothing for an empty set", async () => {
    const { tx, raws, tables } = buildTx({});

    await dal.lockActorsForOrgAccess({ orgId: ROOT_ORG_ID, actorIds: [] }, tx);

    expect(tables).toEqual([]);
    expect(raws).toEqual([]);
  });
});
