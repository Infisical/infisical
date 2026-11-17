import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { certificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";

declare const testDb: Knex;

const dal = certificateAuthorityCrlDALFactory(testDb as never);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const now = Date.now();
const tag = randomUUID().slice(0, 8);

type TCrlCase = {
  crlValidityDays: number;
  nextUpdateInMs: number;
  caNotAfterInMs?: number;
  revokedAfterThisUpdateMs?: number;
};

const CASES = {
  expired: { crlValidityDays: 7, nextUpdateInMs: -HOUR_MS },
  dueWithinADay: { crlValidityDays: 7, nextUpdateInMs: 12 * HOUR_MS },
  notDue: { crlValidityDays: 7, nextUpdateInMs: 3 * DAY_MS },
  oneDayValidityDueWithinHalf: { crlValidityDays: 1, nextUpdateInMs: 6 * HOUR_MS },
  oneDayValidityNotDue: { crlValidityDays: 1, nextUpdateInMs: 18 * HOUR_MS },
  cappedAtCaExpiry: { crlValidityDays: 30, nextUpdateInMs: 6 * HOUR_MS, caNotAfterInMs: 6 * HOUR_MS },
  caRenewedPastCap: { crlValidityDays: 30, nextUpdateInMs: 6 * HOUR_MS, caNotAfterInMs: 365 * DAY_MS },
  nextUpdatePastCaExpiry: { crlValidityDays: 365, nextUpdateInMs: 300 * DAY_MS, caNotAfterInMs: 20 * DAY_MS },
  expiredCa: { crlValidityDays: 7, nextUpdateInMs: -2 * HOUR_MS, caNotAfterInMs: -HOUR_MS },
  revokedAfterLastCrl: { crlValidityDays: 365, nextUpdateInMs: 300 * DAY_MS, revokedAfterThisUpdateMs: HOUR_MS },
  validityShortened: { crlValidityDays: 1, nextUpdateInMs: 29 * DAY_MS },
  revokedWhileLastCrlWasBuilt: {
    crlValidityDays: 365,
    nextUpdateInMs: 300 * DAY_MS,
    revokedAfterThisUpdateMs: -2 * 60 * 1000
  },
  revokedBeforeLastCrl: { crlValidityDays: 365, nextUpdateInMs: 300 * DAY_MS, revokedAfterThisUpdateMs: -HOUR_MS }
} satisfies Record<string, TCrlCase>;

type TCaseKey = keyof typeof CASES;

const DUE: TCaseKey[] = [
  "expired",
  "dueWithinADay",
  "oneDayValidityDueWithinHalf",
  "caRenewedPastCap",
  "nextUpdatePastCaExpiry",
  "revokedAfterLastCrl",
  "revokedWhileLastCrlWasBuilt",
  "validityShortened"
];

const caIds = {} as Record<TCaseKey, string>;

const insertCaWithCrl = async (
  key: string,
  { crlValidityDays, nextUpdateInMs, caNotAfterInMs, revokedAfterThisUpdateMs }: TCrlCase
) => {
  const [ca] = await testDb(TableName.CertificateAuthority)
    .insert({ projectId: seedData1.project.id, status: CaStatus.ACTIVE, name: `e2e-${tag}-${key}` })
    .returning("id");

  await testDb(TableName.InternalCertificateAuthority).insert({
    caId: ca.id,
    type: InternalCaType.ROOT,
    friendlyName: `e2e-${tag}-${key}`,
    organization: "",
    ou: "",
    country: "",
    province: "",
    locality: "",
    commonName: `e2e-${tag}-${key}`,
    dn: `CN=e2e-${tag}-${key}`,
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
    crlValidityDays,
    notAfter: caNotAfterInMs === undefined ? null : new Date(now + caNotAfterInMs)
  });

  const [caSecret] = await testDb(TableName.CertificateAuthoritySecret)
    .insert({ caId: ca.id, encryptedPrivateKey: Buffer.from("e2e") })
    .returning("id");

  const nextUpdate = new Date(now + nextUpdateInMs);
  const thisUpdate = new Date(now - HOUR_MS * 2);
  await testDb(TableName.CertificateAuthorityCrl).insert({
    caId: ca.id,
    caSecretId: caSecret.id,
    encryptedCrl: Buffer.from("e2e"),
    thisUpdate,
    nextUpdate
  });

  if (revokedAfterThisUpdateMs !== undefined) {
    await testDb(TableName.Certificate).insert({
      caId: ca.id,
      projectId: seedData1.project.id,
      status: CertStatus.REVOKED,
      serialNumber: `e2e-${tag}-${key}`,
      friendlyName: `e2e-${tag}-${key}`,
      commonName: `e2e-${tag}-${key}`,
      notBefore: new Date(now - DAY_MS),
      notAfter: new Date(now + DAY_MS),
      revokedAt: new Date(thisUpdate.getTime() + revokedAfterThisUpdateMs),
      revocationReason: 0
    });
  }

  return ca.id as string;
};

const ownCaIds = (rows: { caId: string }[]) =>
  rows.map((row) => row.caId).filter((caId) => Object.values(caIds).includes(caId));

const expectedDueCaIds = () => DUE.map((key) => caIds[key]).sort();

describe("certificate authority CRL DAL (postgres)", () => {
  beforeAll(async () => {
    for (const [key, crlCase] of Object.entries(CASES)) {
      // eslint-disable-next-line no-await-in-loop
      caIds[key as TCaseKey] = await insertCaWithCrl(key, crlCase);
    }
  });

  afterAll(async () => {
    const ids = Object.values(caIds);
    await testDb(TableName.Certificate).whereIn("caId", ids).del();
    await testDb(TableName.CertificateAuthorityCrl).whereIn("caId", ids).del();
    await testDb(TableName.CertificateAuthoritySecret).whereIn("caId", ids).del();
    await testDb(TableName.InternalCertificateAuthority).whereIn("caId", ids).del();
    await testDb(TableName.CertificateAuthority).whereIn("id", ids).del();
  });

  test("selects CRLs that are due, run past CA expiry or miss a revocation, skipping capped ones and expired CAs", async () => {
    const found = ownCaIds(await dal.findDueForRebuild({ limit: 1000 }));

    expect(found.sort()).toEqual(expectedDueCaIds());
  });

  test("walks every due CRL once when paging by cursor", async () => {
    const seen: string[] = [];
    let afterId: string | undefined;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await dal.findDueForRebuild({ afterId, limit: 2 });
      if (page.length === 0) break;
      seen.push(...ownCaIds(page));
      afterId = page[page.length - 1].id;
    }

    expect(seen.sort()).toEqual(expectedDueCaIds());
  });
});
