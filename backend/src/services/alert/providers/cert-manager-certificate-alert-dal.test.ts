import { TableName } from "@app/db/schemas";

import { certManagerCertificateAlertDALFactory } from "./cert-manager-certificate-alert-dal";

const buildDAL = () => {
  const calls = {
    tables: [] as unknown[],
    where: [] as unknown[][],
    whereIn: [] as unknown[][],
    whereRaw: [] as unknown[][],
    limit: [] as unknown[]
  };

  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  Object.assign(chain, {
    leftJoin: passthrough,
    whereNot: passthrough,
    whereNull: passthrough,
    orderBy: passthrough,
    select: passthrough,
    where: (...args: unknown[]) => {
      calls.where.push(args);
      return chain;
    },
    whereIn: (...args: unknown[]) => {
      calls.whereIn.push(args);
      return chain;
    },
    whereRaw: (...args: unknown[]) => {
      calls.whereRaw.push(args);
      return chain;
    },
    limit: (value: unknown) => {
      calls.limit.push(value);
      return chain;
    },
    pluck: async () => [],
    then: (resolve: (rows: unknown[]) => void) => resolve([])
  });

  const reader = (table: unknown) => {
    calls.tables.push(table);
    return chain;
  };
  const db = { replicaNode: () => reader } as never;

  return { dal: certManagerCertificateAlertDALFactory(Object.assign(reader, db)), calls };
};

const scan = {
  projectId: "proj-1",
  alertBeforeInterval: "30 days",
  leadInterval: "1 day",
  asOf: new Date("2026-01-01T00:00:00Z")
};

describe("cert manager certificate alert DAL", () => {
  test("a project-wide scan is scoped to the project and ANDs the application and profile lists", async () => {
    const { dal, calls } = buildDAL();
    await dal.findExpiringCertificates({ ...scan, applicationIds: ["app-1", "app-2"], profileIds: ["prof-1"] });

    expect(calls.where).toContainEqual([`${TableName.Certificate}.projectId`, "proj-1"]);
    expect(calls.where).not.toContainEqual(expect.arrayContaining([`${TableName.Certificate}.applicationId`]));
    expect(calls.whereIn).toContainEqual([`${TableName.Certificate}.applicationId`, ["app-1", "app-2"]]);
    expect(calls.whereIn).toContainEqual([`${TableName.Certificate}.profileId`, ["prof-1"]]);
  });

  test("an application scan pins the application and adds no list filters", async () => {
    const { dal, calls } = buildDAL();
    await dal.findExpiringCertificates({ ...scan, applicationId: "app-1" });

    expect(calls.where).toContainEqual([`${TableName.Certificate}.applicationId`, "app-1"]);
    expect(calls.whereIn).toEqual([]);
  });

  test("certificates every enabled channel already alerted on are excluded before the limit", async () => {
    const { dal, calls } = buildDAL();
    const since = new Date("2025-12-30T00:00:00Z");
    await dal.findExpiringCertificates({
      ...scan,
      alreadyAlerted: { alertId: "alert-1", channelIds: ["ch-1", "ch-2"], since }
    });

    const exclusion = calls.whereRaw.find(([sql]) => String(sql).includes("COUNT(DISTINCT"));
    expect(exclusion).toBeDefined();
    expect(exclusion?.[1]).toEqual(expect.arrayContaining(["alert-1", since, ["ch-1", "ch-2"], 2]));
    expect(calls.limit).toEqual([1000]);
  });

  test("no exclusion is added when the alert has no enabled channels", async () => {
    const { dal, calls } = buildDAL();
    await dal.findExpiringCertificates({
      ...scan,
      alreadyAlerted: { alertId: "alert-1", channelIds: [], since: new Date() }
    });

    expect(calls.whereRaw.some(([sql]) => String(sql).includes("COUNT(DISTINCT"))).toBe(false);
  });

  test("event lookups narrow by the lists and the certificate ids", async () => {
    const { dal, calls } = buildDAL();
    await dal.findCertificatesByIds({ projectId: "proj-1", profileIds: ["prof-1"], certificateIds: ["cert-1"] });

    expect(calls.whereIn).toContainEqual([`${TableName.Certificate}.profileId`, ["prof-1"]]);
    expect(calls.whereIn).toContainEqual([`${TableName.Certificate}.id`, ["cert-1"]]);
  });

  test("application and profile id checks are scoped to the project", async () => {
    const { dal, calls } = buildDAL();
    await dal.findProjectApplicationIds("proj-1", ["app-1"]);
    await dal.findProjectProfileIds("proj-1", ["prof-1"]);

    expect(calls.tables).toEqual([TableName.PkiApplication, TableName.PkiCertificateProfile]);
    expect(calls.where).toEqual([[{ projectId: "proj-1" }], [{ projectId: "proj-1" }]]);
    expect(calls.whereIn).toEqual([
      ["id", ["app-1"]],
      ["id", ["prof-1"]]
    ]);
  });
});
