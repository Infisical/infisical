import knex, { Knex } from "knex";

import { TDbClient } from "@app/db";

import { certManagerSignerAlertDALFactory } from "./cert-manager-signer-alert-dal";

const PROJECT_ID = "3f2d7a4e-1b6c-4d8e-9a0f-5c7b2e1d4a6b";

const buildDAL = (firstQueryRows: unknown[] = []) => {
  const builder = knex({ client: "pg" });
  const queries: { sql: string; bindings: readonly unknown[] }[] = [];

  const reader = ((table: string) => {
    const query = builder(table);
    return Object.assign(query, {
      then: (resolve: (rows: unknown[]) => void) => {
        const { sql, bindings } = query.toSQL();
        queries.push({ sql, bindings });
        resolve(queries.length === 1 ? firstQueryRows : []);
      }
    });
  }) as unknown as Knex;
  Object.assign(reader, { raw: builder.raw.bind(builder) });

  const db = Object.assign(reader, { replicaNode: () => reader }) as unknown as TDbClient;
  return { dal: certManagerSignerAlertDALFactory(db), queries };
};

const scope = {
  projectId: PROJECT_ID,
  alertBeforeInterval: "30 days",
  leadInterval: "1 day",
  asOf: new Date("2026-01-02T00:00:00Z"),
  alreadyAlerted: { alertId: "alert-1", channelIds: ["channel-1"], since: new Date("2026-01-01T00:00:00Z") }
};

describe("cert manager signer alert DAL", () => {
  test("scans one row per certificate an active signer uses, naming every signer of it", async () => {
    const { dal, queries } = buildDAL();

    await dal.findExpiringSignerCertificates(scope);

    expect(queries).toHaveLength(2);
    const [{ sql, bindings }] = queries;
    expect(sql).toContain('group by "pki_signers"."certificateId"');
    expect(sql).toContain('array_agg("pki_signers".name order by "pki_signers".name) as "signerNames"');
    expect(sql).toContain('as "signers" on "signers"."certificateId" = "certificates"."id"');
    expect(sql).toContain('"pki_signers"."projectId" = ?');
    expect(sql).toContain('"pki_signers"."status" = ?');
    expect(sql).toContain('not "certificates"."status" = ?');
    expect(sql).toContain('"certificates".id::text not in ((select "deliveredTgt"."targetId"');
    expect(sql).toContain('having count(distinct "deliveredTgt"."channelId") >= ?');
    expect(sql).toMatch(/order by "certificates"\."notAfter" asc limit \?$/);
    expect(bindings).toEqual(expect.arrayContaining([PROJECT_ID, "active", "alert-1"]));
  });

  test("fills the rest of the run with certificates delivered on every channel, least recently first", async () => {
    const { dal, queries } = buildDAL();

    await dal.findExpiringSignerCertificates(scope);

    const { sql, bindings } = queries[1];
    expect(sql).toContain('having count(distinct "deliveredTgt"."channelId") >= ?');
    expect(sql).toContain('"hist"."triggeredAt" >= ?');
    expect(sql).toContain('order by "lastDelivered"."lastDeliveredAt" asc, "certificates"."notAfter" asc limit ?');
    expect(bindings).toEqual(expect.arrayContaining([scope.alreadyAlerted.since]));
  });

  test("stops after the first query when it fills the cap", async () => {
    const { dal, queries } = buildDAL(Array.from({ length: 1000 }, (_, index) => ({ id: `cert-${index}` })));

    const certificates = await dal.findExpiringSignerCertificates(scope);

    expect(certificates).toHaveLength(1000);
    expect(queries).toHaveLength(1);
  });
});
