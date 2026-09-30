import knex, { Knex } from "knex";

import { TDbClient } from "@app/db";

import { certManagerApplicationAlertDALFactory } from "./cert-manager-application-alert-dal";

const PROJECT_ID = "3f2d7a4e-1b6c-4d8e-9a0f-5c7b2e1d4a6b";
const APPLICATION_ID = "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90";

const buildDAL = () => {
  const builder = knex({ client: "pg" });
  const queries: { sql: string; bindings: readonly unknown[] }[] = [];

  const reader = ((table: string) => {
    const query = builder(table);
    Object.assign(query, {
      then: (resolve: (rows: unknown[]) => void) => {
        const { sql, bindings } = query.toSQL();
        queries.push({ sql, bindings });
        resolve([]);
      }
    });
    return query;
  }) as unknown as Knex;

  const db = Object.assign(reader, { replicaNode: () => reader }) as unknown as TDbClient;
  return { dal: certManagerApplicationAlertDALFactory(db), queries };
};

describe("cert manager application alert DAL", () => {
  test("findExpiringCertificates only scans live certificates of the alert's application inside the window", async () => {
    const { dal, queries } = buildDAL();
    const asOf = new Date("2026-01-01T00:00:00Z");

    await dal.findExpiringCertificates({
      projectId: PROJECT_ID,
      applicationId: APPLICATION_ID,
      alertBeforeInterval: "30 days",
      leadInterval: "1 hour",
      asOf
    });

    const [{ sql, bindings }] = queries;
    expect(sql).toContain('"certificates"."projectId" = ?');
    expect(sql).toContain('"certificates"."applicationId" = ?');
    expect(sql).toContain('not "certificates"."status" = ?');
    expect(sql).toContain('"certificates"."renewedByCertificateId" is null');
    expect(sql).toContain('"certificates"."notAfter" > ?::timestamptz');
    expect(sql).toContain('"certificates"."notAfter" <= ?::timestamptz + ?::interval + ?::interval');
    expect(sql).toContain('order by "certificates"."notAfter" asc');
    expect(bindings).toEqual(
      expect.arrayContaining([PROJECT_ID, APPLICATION_ID, "revoked", asOf, "30 days", "1 hour"])
    );
  });

  test("findCertificatesByIds keeps event targets inside the alert's project and application", async () => {
    const { dal, queries } = buildDAL();

    await dal.findCertificatesByIds({
      projectId: PROJECT_ID,
      applicationId: APPLICATION_ID,
      certificateIds: ["cert-1", "cert-2"]
    });

    const [{ sql, bindings }] = queries;
    expect(sql).toContain('"certificates"."projectId" = ?');
    expect(sql).toContain('"certificates"."applicationId" = ?');
    expect(sql).toContain('"certificates"."id" in (?, ?)');
    expect(bindings).toEqual(expect.arrayContaining([PROJECT_ID, APPLICATION_ID, "cert-1", "cert-2"]));
  });

  test("findApplicationById skips applications in a project pending deletion", async () => {
    const { dal, queries } = buildDAL();

    await dal.findApplicationById(APPLICATION_ID);

    expect(queries[0].sql).toContain('"projects"."deleteAfter" is null');
  });

  test("findApplicationNamesByIds scopes the lookup to the caller's org", async () => {
    const { dal, queries } = buildDAL();

    await dal.findApplicationNamesByIds([APPLICATION_ID], "org-1");

    expect(queries[0].sql).toContain('"projects"."orgId" = ?');
    expect(queries[0].bindings).toEqual(expect.arrayContaining([APPLICATION_ID, "org-1"]));
  });
});
