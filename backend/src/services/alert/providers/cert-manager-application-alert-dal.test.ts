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
    return Object.assign(query, {
      then: (resolve: (rows: unknown[]) => void) => {
        const { sql, bindings } = query.toSQL();
        queries.push({ sql, bindings });
        resolve([]);
      }
    });
  }) as unknown as Knex;

  const db = Object.assign(reader, { replicaNode: () => reader }) as unknown as TDbClient;
  return { dal: certManagerApplicationAlertDALFactory(db), queries };
};

describe("cert manager certificate alert DAL", () => {
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

  test("findExpiringCertificates skips certificates already delivered on every channel before the cap", async () => {
    const { dal, queries } = buildDAL();
    const since = new Date("2026-01-01T00:00:00Z");

    await dal.findExpiringCertificates({
      projectId: PROJECT_ID,
      applicationId: APPLICATION_ID,
      alertBeforeInterval: "30 days",
      leadInterval: "1 day",
      asOf: new Date("2026-01-02T00:00:00Z"),
      alreadyAlerted: { alertId: "alert-1", channelIds: ["channel-1", "channel-2"], since }
    });

    const [{ sql, bindings }] = queries;
    expect(sql).toContain('count(distinct "tgt"."channelId")');
    expect(sql).toContain('"tgt"."targetId" = "certificates".id::text');
    expect(sql.indexOf("count(distinct")).toBeLessThan(sql.indexOf("limit"));
    expect(sql).toContain('max("lastHist"."triggeredAt")');
    expect(sql.indexOf("asc nulls first")).toBeLessThan(sql.indexOf('"certificates"."notAfter" asc'));
    expect(bindings).toEqual(expect.arrayContaining(["alert-1", since, "success", "channel-1", "channel-2", 2]));
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

  test("a project-wide scan filters by the application and profile lists instead of pinning one application", async () => {
    const { dal, queries } = buildDAL();

    await dal.findExpiringCertificates({
      projectId: PROJECT_ID,
      applicationIds: ["app-1", "app-2"],
      profileIds: ["prof-1"],
      alertBeforeInterval: "30 days",
      leadInterval: "1 day",
      asOf: new Date("2026-01-01T00:00:00Z")
    });

    const [{ sql, bindings }] = queries;
    expect(sql).toContain('"certificates"."projectId" = ?');
    expect(sql).not.toContain('"certificates"."applicationId" = ?');
    expect(sql).toContain('"certificates"."applicationId" in (?, ?)');
    expect(sql).toContain('"certificates"."profileId" in (?)');
    expect(bindings).toEqual(expect.arrayContaining(["app-1", "app-2", "prof-1"]));
  });

  test("findExpiringCertificates adds no exclusion when the alert has no enabled channels", async () => {
    const { dal, queries } = buildDAL();

    await dal.findExpiringCertificates({
      projectId: PROJECT_ID,
      applicationId: APPLICATION_ID,
      alertBeforeInterval: "30 days",
      leadInterval: "1 day",
      asOf: new Date("2026-01-02T00:00:00Z"),
      alreadyAlerted: { alertId: "alert-1", channelIds: [], since: new Date() }
    });

    expect(queries[0].sql).not.toContain("count(distinct");
  });

  test("findCertificatesByIds narrows a project-wide lookup by the profile list", async () => {
    const { dal, queries } = buildDAL();

    await dal.findCertificatesByIds({ projectId: PROJECT_ID, profileIds: ["prof-1"], certificateIds: ["cert-1"] });

    expect(queries[0].sql).toContain('"certificates"."profileId" in (?)');
    expect(queries[0].sql).toContain('"certificates"."id" in (?)');
  });

  test("application and profile id checks are scoped to the project", async () => {
    const { dal, queries } = buildDAL();

    await dal.findProjectApplicationIds(PROJECT_ID, ["app-1"]);
    await dal.findProjectProfileIds(PROJECT_ID, ["prof-1"]);

    expect(queries[0].sql).toContain('from "pki_applications" where "projectId" = ?');
    expect(queries[1].sql).toContain('from "pki_certificate_profiles" where "projectId" = ?');
    expect(queries.map((query) => query.bindings)).toEqual([
      expect.arrayContaining([PROJECT_ID, "app-1"]),
      expect.arrayContaining([PROJECT_ID, "prof-1"])
    ]);
  });
});
