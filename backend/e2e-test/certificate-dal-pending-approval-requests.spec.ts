import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";

import { createIsolatedOrgAndProject, createProject } from "./testUtils/fixtures";

declare const testDb: Knex;

const dal = certificateDALFactory(testDb as never);

const CERT = randomUUID();
const OTHER_CERT = randomUUID();
const CERT_WITHOUT_PENDING = randomUUID();

type TRow = {
  type: ApprovalPolicyType;
  status: ApprovalRequestStatus;
  certificateId: string;
  inOtherProject?: boolean;
  shape: "revocation" | "renewal";
};

const pending = ApprovalRequestStatus.Pending;
const revocation = ApprovalPolicyType.CertRevocation;
const renewal = ApprovalPolicyType.CertRequest;

const ROWS = {
  revocationPending: { type: revocation, status: pending, certificateId: CERT, shape: "revocation" },
  revocationPendingAgain: { type: revocation, status: pending, certificateId: CERT, shape: "revocation" },
  revocationOtherCert: { type: revocation, status: pending, certificateId: OTHER_CERT, shape: "revocation" },
  revocationOtherProject: {
    type: revocation,
    status: pending,
    certificateId: CERT,
    inOtherProject: true,
    shape: "revocation"
  },
  revocationApproved: {
    type: revocation,
    status: ApprovalRequestStatus.Approved,
    certificateId: CERT,
    shape: "revocation"
  },
  revocationRejected: {
    type: revocation,
    status: ApprovalRequestStatus.Rejected,
    certificateId: CERT,
    shape: "revocation"
  },
  revocationCancelled: {
    type: revocation,
    status: ApprovalRequestStatus.Cancelled,
    certificateId: CERT,
    shape: "revocation"
  },
  revocationExpired: {
    type: revocation,
    status: ApprovalRequestStatus.Expired,
    certificateId: CERT,
    shape: "revocation"
  },
  renewalPending: { type: renewal, status: pending, certificateId: CERT, shape: "renewal" },
  renewalOtherCert: { type: renewal, status: pending, certificateId: OTHER_CERT, shape: "renewal" },
  renewalOtherProject: { type: renewal, status: pending, certificateId: CERT, inOtherProject: true, shape: "renewal" },
  renewalApproved: { type: renewal, status: ApprovalRequestStatus.Approved, certificateId: CERT, shape: "renewal" },
  renewalRejected: { type: renewal, status: ApprovalRequestStatus.Rejected, certificateId: CERT, shape: "renewal" },
  renewalCancelled: { type: renewal, status: ApprovalRequestStatus.Cancelled, certificateId: CERT, shape: "renewal" },
  renewalExpired: { type: renewal, status: ApprovalRequestStatus.Expired, certificateId: CERT, shape: "renewal" },
  // Each lookup reads a different JSON path, so these rows put the certificate where the other type's
  // lookup would find it and only the type filter keeps them out.
  renewalTypeRevocationShape: { type: renewal, status: pending, certificateId: CERT, shape: "revocation" },
  revocationTypeRenewalShape: { type: revocation, status: pending, certificateId: CERT, shape: "renewal" },
  codeSigningRevocationShape: {
    type: ApprovalPolicyType.CertCodeSigning,
    status: pending,
    certificateId: CERT,
    shape: "revocation"
  },
  revocationCancelledForCertWithoutPending: {
    type: revocation,
    status: ApprovalRequestStatus.Cancelled,
    certificateId: CERT_WITHOUT_PENDING,
    shape: "revocation"
  },
  renewalCancelledForCertWithoutPending: {
    type: renewal,
    status: ApprovalRequestStatus.Cancelled,
    certificateId: CERT_WITHOUT_PENDING,
    shape: "renewal"
  }
} satisfies Record<string, TRow>;

type TRowKey = keyof typeof ROWS;

const requestIds = {} as Record<TRowKey, string>;

const keysOf = (ids: string[]) =>
  ids.map((id) => (Object.keys(requestIds) as TRowKey[]).find((key) => requestIds[key] === id)).sort();

describe("Certificate DAL pending approval request lookups", () => {
  let projectId: string;
  let otherProjectId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const fixture = await createIsolatedOrgAndProject("cert-pending-approvals");
    projectId = fixture.projectId;
    cleanup = fixture.cleanup;
    otherProjectId = await createProject(fixture.authToken, `cert-pending-approvals-other-${randomUUID().slice(0, 8)}`);

    // Rows are written directly because these lookups are the subject: no API can create a pending
    // renewal without a working CA and profile, and the query's JSON paths are what this checks.
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, row] of Object.entries(ROWS) as [TRowKey, TRow][]) {
      const requestData =
        row.shape === "revocation"
          ? { certificateId: row.certificateId, commonName: "web.example.com", profileName: "web-servers" }
          : { profileName: "web-servers", renewal: { certificateId: row.certificateId } };
      // eslint-disable-next-line no-await-in-loop
      const [request] = await testDb(TableName.ApprovalRequests)
        .insert({
          projectId: row.inOtherProject ? otherProjectId : projectId,
          organizationId: fixture.orgId,
          requesterName: "e2e",
          requesterEmail: "e2e@example.com",
          type: row.type,
          status: row.status,
          currentStep: 1,
          requestData: JSON.stringify({ version: 1, requestData }),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        })
        .returning("id");
      requestIds[key] = request.id;
    }
  });

  afterAll(async () => {
    await testDb(TableName.ApprovalRequests).whereIn("id", Object.values(requestIds)).del();
    await cleanup();
  });

  test("finds every pending revocation request for the certificate in its project", async () => {
    const ids = await dal.findPendingApprovalRequestIds(revocation, { certificateId: CERT, projectId });

    expect(keysOf(ids)).toEqual(["revocationPending", "revocationPendingAgain"]);
  });

  test("finds every pending renewal request for the certificate in its project", async () => {
    const ids = await dal.findPendingApprovalRequestIds(renewal, { certificateId: CERT, projectId });

    expect(keysOf(ids)).toEqual(["renewalPending"]);
  });

  test("scopes the lookups to the certificate and the project asked for", async () => {
    const otherCertRevocations = await dal.findPendingApprovalRequestIds(revocation, {
      certificateId: OTHER_CERT,
      projectId
    });
    const otherProjectRevocations = await dal.findPendingApprovalRequestIds(revocation, {
      certificateId: CERT,
      projectId: otherProjectId
    });
    const otherCertRenewals = await dal.findPendingApprovalRequestIds(renewal, {
      certificateId: OTHER_CERT,
      projectId
    });
    const otherProjectRenewals = await dal.findPendingApprovalRequestIds(renewal, {
      certificateId: CERT,
      projectId: otherProjectId
    });

    expect(keysOf(otherCertRevocations)).toEqual(["revocationOtherCert"]);
    expect(keysOf(otherProjectRevocations)).toEqual(["revocationOtherProject"]);
    expect(keysOf(otherCertRenewals)).toEqual(["renewalOtherCert"]);
    expect(keysOf(otherProjectRenewals)).toEqual(["renewalOtherProject"]);
  });

  test("finds a pending revocation request for the certificate with its expiry", async () => {
    const request = await dal.findPendingRevocationApprovalRequest({ certificateId: CERT, projectId });

    expect([requestIds.revocationPending, requestIds.revocationPendingAgain]).toContain(request?.id);
    expect(request?.expiresAt).toBeInstanceOf(Date);
  });

  test("reports whether the certificate has a renewal waiting for approval", async () => {
    expect(await dal.hasRenewalAwaitingApproval({ certificateId: CERT, projectId })).toBe(true);
  });

  test("finds nothing for a certificate whose requests are all decided", async () => {
    const filter = { certificateId: CERT_WITHOUT_PENDING, projectId };

    expect(await dal.findPendingApprovalRequestIds(revocation, filter)).toEqual([]);
    expect(await dal.findPendingApprovalRequestIds(renewal, filter)).toEqual([]);
    expect(await dal.findPendingRevocationApprovalRequest(filter)).toBeUndefined();
    expect(await dal.hasRenewalAwaitingApproval(filter)).toBe(false);
  });
});
