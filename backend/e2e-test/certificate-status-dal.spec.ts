import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName, TCertificates } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { daysToMillisecond } from "@app/lib/dates";
import { OrderByDirection } from "@app/lib/types";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";
import { resolveCurrentCertificateStatus } from "@app/services/certificate/certificate-fns";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { insertCertificate } from "./testUtils/certificates";

declare const testDb: Knex;

const dal = certificateDALFactory(testDb as never);

const PROJECT_ID = seedData1.project.id;
const DAY_MS = daysToMillisecond(1);
const now = Date.now();
const tag = `status-${randomUUID().slice(0, 8)}`;

const certificates = {} as Record<
  "active" | "expired" | "revokedExpired" | "replacement" | "renewed" | "renewedExpired" | "revokedRenewed" | "deleted",
  TCertificates
>;

const seed = async (key: keyof typeof certificates, values: Partial<TCertificates>) => {
  certificates[key] = await insertCertificate({
    projectId: PROJECT_ID,
    serialNumber: `${tag}-${key}`,
    friendlyName: `${tag}-${key}`,
    commonName: `${tag}-${key}.example.com`,
    ...values
  });
};

const search = (
  filter: { status?: string[]; includeDeleted?: boolean },
  options: Parameters<typeof dal.findWithPrivateKeyInfo>[1] = {}
) => dal.findWithPrivateKeyInfo({ projectId: PROJECT_ID, friendlyName: tag, ...filter }, options);

describe("certificate current status (postgres)", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await seed("active", {});
    await seed("expired", { notAfter: new Date(now - DAY_MS) });
    await seed("revokedExpired", {
      status: CertStatus.REVOKED,
      notAfter: new Date(now - DAY_MS),
      revokedAt: new Date(now - 2 * DAY_MS)
    });
    await seed("replacement", {});
    await seed("renewed", { renewedByCertificateId: certificates.replacement.id });
    await seed("renewedExpired", {
      renewedByCertificateId: certificates.replacement.id,
      notAfter: new Date(now - DAY_MS)
    });
    await seed("revokedRenewed", {
      status: CertStatus.REVOKED,
      revokedAt: new Date(now - DAY_MS),
      renewedByCertificateId: certificates.replacement.id
    });
    await seed("deleted", {
      status: CertStatus.REVOKED,
      revokedAt: new Date(now - 2 * DAY_MS),
      deletedAt: new Date(now - DAY_MS)
    });
  });

  afterAll(async () => {
    const ids = Object.values(certificates).map((certificate) => certificate.id);
    await testDb(TableName.Certificate).whereIn("id", ids).update({ renewedByCertificateId: null });
    await testDb(TableName.Certificate).whereIn("id", ids).del();
  });

  test("seeded certificates cover every status", () => {
    const statuses = Object.values(certificates).map((certificate) => resolveCurrentCertificateStatus(certificate));
    expect(new Set(statuses)).toEqual(new Set(Object.values(CertStatus)));
  });

  test("each status filter returns exactly the certificates that resolve to that status", async () => {
    for (const status of Object.values(CertStatus)) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await search({ status: [status] });
      const expected = Object.values(certificates)
        .filter((certificate) => resolveCurrentCertificateStatus(certificate) === status)
        .map((certificate) => certificate.id)
        .sort();

      expect(rows.map((row) => row.id).sort()).toEqual(expected);
      rows.forEach((row) => expect(resolveCurrentCertificateStatus(row)).toBe(status));
    }
  });

  test.each([OrderByDirection.ASC, OrderByDirection.DESC])(
    "sorting by status orders on the resolved status, %s, and pages without gaps",
    async (direction) => {
      const sortOptions = { sort: [["status", direction]] as [string, OrderByDirection][], sortByCurrentStatus: true };
      const rows = await search({ includeDeleted: true }, sortOptions);

      const expected = Object.values(certificates)
        .map((certificate) => ({ id: certificate.id, status: resolveCurrentCertificateStatus(certificate) }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status < b.status ? -1 : 1;
          return a.id < b.id ? -1 : 1;
        });
      if (direction === OrderByDirection.DESC) expected.reverse();

      expect(rows.map((row) => row.id)).toEqual(expected.map((row) => row.id));

      const paged: string[] = [];
      for (let offset = 0; offset < expected.length; offset += 2) {
        // eslint-disable-next-line no-await-in-loop
        const page = await search({ includeDeleted: true }, { ...sortOptions, offset, limit: 2 });
        paged.push(...page.map((row) => row.id));
      }
      expect(paged).toEqual(expected.map((row) => row.id));
    }
  );

  test("filters by status as of the given time", async () => {
    const statusAt = new Date(now - 2 * DAY_MS);
    const rows = await search({ status: [CertStatus.ACTIVE] }, { statusAt });
    const expected = Object.values(certificates)
      .filter((certificate) => resolveCurrentCertificateStatus(certificate, statusAt) === CertStatus.ACTIVE)
      .map((certificate) => certificate.id)
      .sort();

    expect(expected).toContain(certificates.expired.id);
    expect(rows.map((row) => row.id).sort()).toEqual(expected);
  });

  test("search can leave friendly name out of the match in both the rows and the count", async () => {
    const friendlyNameOnly = `fn-only-${tag}`;
    const certificate = await insertCertificate({
      projectId: PROJECT_ID,
      serialNumber: randomUUID(),
      friendlyName: friendlyNameOnly,
      commonName: `${randomUUID()}.example.com`
    });

    try {
      const run = async (excludeFriendlyNameFromSearch?: boolean) => {
        const filter = { projectId: PROJECT_ID, search: friendlyNameOnly, excludeFriendlyNameFromSearch };
        const rows = await dal.findWithPrivateKeyInfo(filter);
        const count = await dal.countCertificatesInProject(filter);
        return { ids: rows.map((row) => row.id), count };
      };

      expect(await run()).toEqual({ ids: [certificate.id], count: 1 });
      expect(await run(true)).toEqual({ ids: [], count: 0 });
    } finally {
      await testDb(TableName.Certificate).where("id", certificate.id).del();
    }
  });
});
