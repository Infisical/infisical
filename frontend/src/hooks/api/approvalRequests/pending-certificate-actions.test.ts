import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { CERTIFICATE_ACTION_POLICY_TYPES } from "../approvalPolicies/types";
import { getPendingCertificateActions } from "./pending-certificate-actions";
import { ApprovalRequestStatus, TApprovalRequest } from "./types";

const now = Date.parse("2026-11-12T12:00:00.000Z");

describe.each(CERTIFICATE_ACTION_POLICY_TYPES)("getPendingCertificateActions for %s", (type) => {
  const actionRequest = (
    id: string,
    certificateId: string,
    overrides: Partial<TApprovalRequest> = {}
  ) =>
    ({
      id,
      type,
      status: ApprovalRequestStatus.Pending,
      expiresAt: null,
      approversCanNoLongerApprove: false,
      requestData: { version: 1, requestData: { certificateId } },
      ...overrides
    }) as TApprovalRequest;

  it("maps each certificate to its pending request and reports the earliest future expiry", () => {
    const result = getPendingCertificateActions(
      [
        actionRequest("req-1", "cert-1", { expiresAt: "2026-11-12T15:00:00.000Z" }),
        actionRequest("req-2", "cert-2", { expiresAt: "2026-11-12T13:00:00.000Z" }),
        actionRequest("req-3", "cert-3")
      ],
      now
    );

    assert.deepEqual(
      [...result.requestByCertificateId],
      [
        ["cert-1", { id: "req-1", approversCanNoLongerApprove: false }],
        ["cert-2", { id: "req-2", approversCanNoLongerApprove: false }],
        ["cert-3", { id: "req-3", approversCanNoLongerApprove: false }]
      ]
    );
    assert.equal(result.nextExpiresAt, Date.parse("2026-11-12T13:00:00.000Z"));
  });

  it("tells which pending requests their approvers can no longer approve", () => {
    const result = getPendingCertificateActions(
      [
        actionRequest("req-1", "cert-1", { approversCanNoLongerApprove: true }),
        actionRequest("req-2", "cert-2")
      ],
      now
    );

    assert.deepEqual(result.requestByCertificateId.get("cert-1"), {
      id: "req-1",
      approversCanNoLongerApprove: true
    });
    assert.deepEqual(result.requestByCertificateId.get("cert-2"), {
      id: "req-2",
      approversCanNoLongerApprove: false
    });
  });

  it("drops a request the list still calls pending once its expiry has passed", () => {
    const result = getPendingCertificateActions(
      [actionRequest("req-1", "cert-1", { expiresAt: "2026-11-12T11:59:59.000Z" })],
      now
    );

    assert.equal(result.requestByCertificateId.size, 0);
    assert.equal(result.nextExpiresAt, null);
  });

  it("keeps a request expiring at this instant, as the server still treats it as pending", () => {
    const result = getPendingCertificateActions(
      [actionRequest("req-1", "cert-1", { expiresAt: "2026-11-12T12:00:00.000Z" })],
      now
    );

    assert.equal(result.requestByCertificateId.get("cert-1")?.id, "req-1");
  });

  it("keeps a request whose expiry is still ahead and drops it once the clock passes it", () => {
    const requests = [actionRequest("req-1", "cert-1", { expiresAt: "2026-11-12T12:30:00.000Z" })];

    assert.equal(
      getPendingCertificateActions(requests, now).requestByCertificateId.get("cert-1")?.id,
      "req-1"
    );
    assert.equal(
      getPendingCertificateActions(requests, Date.parse("2026-11-12T12:30:00.001Z"))
        .requestByCertificateId.size,
      0
    );
  });

  it("ignores requests that are no longer pending", () => {
    const result = getPendingCertificateActions(
      [
        actionRequest("req-1", "cert-1", { status: ApprovalRequestStatus.Approved }),
        actionRequest("req-2", "cert-2", { status: ApprovalRequestStatus.Rejected }),
        actionRequest("req-3", "cert-3", {
          status: ApprovalRequestStatus.Cancelled,
          expiresAt: "2026-11-12T13:00:00.000Z"
        })
      ],
      now
    );

    assert.equal(result.requestByCertificateId.size, 0);
    assert.equal(result.nextExpiresAt, null);
  });

  it("reports no expiry when no pending request has one", () => {
    const result = getPendingCertificateActions([actionRequest("req-1", "cert-1")], now);

    assert.equal(result.requestByCertificateId.get("cert-1")?.id, "req-1");
    assert.equal(result.nextExpiresAt, null);
  });
});
