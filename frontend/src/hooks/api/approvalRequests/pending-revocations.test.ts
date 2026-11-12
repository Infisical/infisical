import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { getPendingRevocations } from "./pending-revocations";
import { ApprovalRequestStatus, TApprovalRequest } from "./types";

const now = Date.parse("2026-11-12T12:00:00.000Z");

const revocationRequest = (
  id: string,
  certificateId: string,
  overrides: Partial<TApprovalRequest> = {}
) =>
  ({
    id,
    status: ApprovalRequestStatus.Pending,
    expiresAt: null,
    requestData: { version: 1, requestData: { certificateId } },
    ...overrides
  }) as TApprovalRequest;

describe("getPendingRevocations", () => {
  it("maps each certificate to its pending request and reports the earliest future expiry", () => {
    const result = getPendingRevocations(
      [
        revocationRequest("req-1", "cert-1", { expiresAt: "2026-11-12T15:00:00.000Z" }),
        revocationRequest("req-2", "cert-2", { expiresAt: "2026-11-12T13:00:00.000Z" }),
        revocationRequest("req-3", "cert-3")
      ],
      now
    );

    assert.deepEqual(
      [...result.requestIdByCertificateId],
      [
        ["cert-1", "req-1"],
        ["cert-2", "req-2"],
        ["cert-3", "req-3"]
      ]
    );
    assert.equal(result.nextExpiresAt, Date.parse("2026-11-12T13:00:00.000Z"));
  });

  it("drops a request the list still calls pending once its expiry has passed", () => {
    const result = getPendingRevocations(
      [
        revocationRequest("req-1", "cert-1", { expiresAt: "2026-11-12T11:59:59.000Z" }),
        revocationRequest("req-2", "cert-2", { expiresAt: "2026-11-12T12:00:00.000Z" })
      ],
      now
    );

    assert.equal(result.requestIdByCertificateId.size, 0);
    assert.equal(result.nextExpiresAt, null);
  });

  it("keeps a request whose expiry is still ahead and drops it once the clock passes it", () => {
    const requests = [
      revocationRequest("req-1", "cert-1", { expiresAt: "2026-11-12T12:30:00.000Z" })
    ];

    assert.equal(
      getPendingRevocations(requests, now).requestIdByCertificateId.get("cert-1"),
      "req-1"
    );
    assert.equal(
      getPendingRevocations(requests, Date.parse("2026-11-12T12:30:00.001Z"))
        .requestIdByCertificateId.size,
      0
    );
  });

  it("ignores requests that are no longer pending", () => {
    const result = getPendingRevocations(
      [
        revocationRequest("req-1", "cert-1", { status: ApprovalRequestStatus.Approved }),
        revocationRequest("req-2", "cert-2", { status: ApprovalRequestStatus.Rejected }),
        revocationRequest("req-3", "cert-3", {
          status: ApprovalRequestStatus.Cancelled,
          expiresAt: "2026-11-12T13:00:00.000Z"
        })
      ],
      now
    );

    assert.equal(result.requestIdByCertificateId.size, 0);
    assert.equal(result.nextExpiresAt, null);
  });

  it("reports no expiry when no pending request has one", () => {
    const result = getPendingRevocations([revocationRequest("req-1", "cert-1")], now);

    assert.equal(result.requestIdByCertificateId.get("cert-1"), "req-1");
    assert.equal(result.nextExpiresAt, null);
  });
});
