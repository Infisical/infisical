import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { signerRequestDALFactory } from "@app/services/signer/signer-request-dal";

declare const testDb: Knex;

const dal = signerRequestDALFactory(testDb as never);

const PROJECT_ID = seedData1.project.id;
const ORG_ID = seedData1.organization.id;
const SIGNER_ID = randomUUID();
const HOUR_MS = 60 * 60 * 1000;
const now = Date.now();

type TCase = {
  key: string;
  status: ApprovalRequestStatus;
  grant?: { status: ApprovalRequestGrantStatus; expiresAt: Date | null; revokedAt?: Date };
  expectedAccessStatus: string;
};

const CASES: TCase[] = [
  { key: "pending", status: ApprovalRequestStatus.Pending, expectedAccessStatus: "pending" },
  {
    key: "active",
    status: ApprovalRequestStatus.Approved,
    grant: { status: ApprovalRequestGrantStatus.Active, expiresAt: new Date(now + HOUR_MS) },
    expectedAccessStatus: "approved"
  },
  {
    key: "noWindow",
    status: ApprovalRequestStatus.Approved,
    grant: { status: ApprovalRequestGrantStatus.Active, expiresAt: null },
    expectedAccessStatus: "approved"
  },
  {
    key: "pastWindowStillActive",
    status: ApprovalRequestStatus.Approved,
    grant: { status: ApprovalRequestGrantStatus.Active, expiresAt: new Date(now - 60_000) },
    expectedAccessStatus: "expired"
  },
  {
    key: "signingsUsedUp",
    status: ApprovalRequestStatus.Approved,
    grant: { status: ApprovalRequestGrantStatus.Expired, expiresAt: new Date(now + HOUR_MS) },
    expectedAccessStatus: "expired"
  },
  {
    key: "grantRevoked",
    status: ApprovalRequestStatus.Approved,
    grant: { status: ApprovalRequestGrantStatus.Revoked, expiresAt: new Date(now + HOUR_MS) },
    expectedAccessStatus: "cancelled"
  },
  {
    key: "revokedAfterWindowEnded",
    status: ApprovalRequestStatus.Approved,
    grant: {
      status: ApprovalRequestGrantStatus.Revoked,
      expiresAt: new Date(now - 2 * HOUR_MS),
      revokedAt: new Date(now - HOUR_MS)
    },
    expectedAccessStatus: "expired"
  },
  {
    key: "revokedDuringWindowSinceEnded",
    status: ApprovalRequestStatus.Approved,
    grant: {
      status: ApprovalRequestGrantStatus.Revoked,
      expiresAt: new Date(now - HOUR_MS),
      revokedAt: new Date(now - 2 * HOUR_MS)
    },
    expectedAccessStatus: "cancelled"
  },
  {
    key: "cancelled",
    status: ApprovalRequestStatus.Cancelled,
    grant: { status: ApprovalRequestGrantStatus.Revoked, expiresAt: new Date(now + HOUR_MS) },
    expectedAccessStatus: "cancelled"
  },
  { key: "rejected", status: ApprovalRequestStatus.Rejected, expectedAccessStatus: "rejected" }
];

const requestIds = {} as Record<string, string>;

const base = { signerId: SIGNER_ID, projectId: PROJECT_ID, type: ApprovalPolicyType.CertCodeSigning };

const keysOf = (rows: { id: string }[]) =>
  rows.map((row) => Object.keys(requestIds).find((key) => requestIds[key] === row.id)).sort();

describe("Signer request DAL access status", () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax
    for (const [index, testCase] of CASES.entries()) {
      // createdAt is not part of the insert type, but setting it fixes the list order the pagination test relies on.
      const requestRow = {
        projectId: PROJECT_ID,
        organizationId: ORG_ID,
        requesterName: "e2e",
        requesterEmail: "e2e@example.com",
        type: ApprovalPolicyType.CertCodeSigning,
        status: testCase.status,
        currentStep: 1,
        requestData: JSON.stringify({ version: 1, requestData: {} }),
        scopeType: ApprovalPolicyScope.Signer,
        scopeId: SIGNER_ID,
        createdAt: new Date(now - index * 60_000)
      };
      // eslint-disable-next-line no-await-in-loop
      const [request] = await testDb(TableName.ApprovalRequests).insert(requestRow).returning("id");
      requestIds[testCase.key] = request.id;

      if (testCase.grant) {
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.ApprovalRequestGrants).insert({
          projectId: PROJECT_ID,
          requestId: request.id,
          type: ApprovalPolicyType.CertCodeSigning,
          status: testCase.grant.status,
          expiresAt: testCase.grant.expiresAt,
          revokedAt: testCase.grant.revokedAt ?? null,
          attributes: JSON.stringify({ maxSignings: 10 })
        });
      }
    }
  });

  afterAll(async () => {
    const ids = Object.values(requestIds);
    await testDb(TableName.ApprovalRequestGrants).whereIn("requestId", ids).del();
    await testDb(TableName.ApprovalRequests).whereIn("id", ids).del();
  });

  test("derives the access status from the grant and leaves the request status as stored", async () => {
    const rows = await dal.listSignerRequestsPaginated({ ...base, offset: 0, limit: 25 });

    expect(rows).toHaveLength(CASES.length);
    CASES.forEach((testCase) => {
      const row = rows.find((r) => r.id === requestIds[testCase.key]);
      expect(row, testCase.key).toBeDefined();
      expect(row?.accessStatus, testCase.key).toBe(testCase.expectedAccessStatus);
      expect(row?.status, testCase.key).toBe(testCase.status);
    });
  });

  test.each([
    { filter: ["pending"], expected: ["pending"] },
    { filter: ["approved"], expected: ["active", "noWindow"] },
    { filter: ["expired"], expected: ["pastWindowStillActive", "revokedAfterWindowEnded", "signingsUsedUp"] },
    {
      filter: ["cancelled", "rejected"],
      expected: ["cancelled", "grantRevoked", "rejected", "revokedDuringWindowSinceEnded"]
    }
  ])("filters on $filter by access status, and the count matches", async ({ filter, expected }) => {
    const rows = await dal.listSignerRequestsPaginated({ ...base, statuses: filter, offset: 0, limit: 25 });
    const count = await dal.countSignerRequests({ ...base, statuses: filter });

    expect(keysOf(rows)).toEqual([...expected].sort());
    expect(count).toBe(expected.length);
  });

  test("counts every request when no filter is passed", async () => {
    expect(await dal.countSignerRequests(base)).toBe(CASES.length);
  });

  test("paginates after filtering", async () => {
    const rows = await dal.listSignerRequestsPaginated({ ...base, statuses: ["expired"], offset: 1, limit: 1 });

    expect(keysOf(rows)).toEqual(["signingsUsedUp"]);
  });
});
