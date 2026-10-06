import { ForbiddenError } from "@casl/ability";
import { describe, expect, it, vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { CertificateIssuanceOperation } from "./certificate-constants";
import { recordCertificateIssuanceFailure, tagErrorWithCertificateRequest } from "./certificate-issuance-audit-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe("recordCertificateIssuanceFailure", () => {
  const auditLogInfo = {
    actor: { type: ActorType.USER as const, metadata: { userId: "user-1", email: "a@b.com", username: "a@b.com" } }
  };

  const setup = () => {
    const deps = {
      auditLogService: { createCollapsedAuditLog: vi.fn() },
      certificateAuthorityDAL: { findById: vi.fn().mockResolvedValue({ id: "ca-1", name: "internal-ca" }) },
      pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: "app-1", name: "checkout-api" }) }
    };
    const record = (error: unknown, metadata: Record<string, unknown> = {}) =>
      recordCertificateIssuanceFailure(deps as never, {
        auditLogInfo,
        projectId: "project-1",
        error,
        metadata: { operation: CertificateIssuanceOperation.ISSUE, ...metadata }
      });
    return { deps, record };
  };

  it("resolves CA and application names and builds a collapse key from the failure", async () => {
    const { deps, record } = setup();

    await record(new BadRequestError({ message: "TTL too long" }), {
      caId: "ca-1",
      applicationId: "app-1",
      commonName: "a.example.com"
    });

    expect(deps.auditLogService.createCollapsedAuditLog).toHaveBeenCalledWith({
      ...auditLogInfo,
      projectId: "project-1",
      event: {
        type: EventType.CERTIFICATE_ISSUANCE_FAILED,
        metadata: {
          operation: CertificateIssuanceOperation.ISSUE,
          caId: "ca-1",
          caName: "internal-ca",
          applicationId: "app-1",
          applicationName: "checkout-api",
          commonName: "a.example.com",
          errorName: "BadRequest",
          error: "TTL too long"
        }
      },
      collapseKeyParts: [
        "project-1",
        ActorType.USER,
        "user-1",
        CertificateIssuanceOperation.ISSUE,
        null,
        "app-1",
        "a.example.com",
        null,
        null,
        "BadRequest",
        "TTL too long"
      ]
    });
  });

  it("does not look up names it was already given", async () => {
    const { deps, record } = setup();

    await record(new Error("x"), { caId: "ca-1", caName: "given" });

    expect(deps.certificateAuthorityDAL.findById).not.toHaveBeenCalled();
  });

  it("links the event to the certificate request tagged on the error", async () => {
    const { deps, record } = setup();
    const error = new Error("signing failed");
    tagErrorWithCertificateRequest(error, "cert-req-1");

    await record(error);

    const [call] = deps.auditLogService.createCollapsedAuditLog.mock.calls[0] as [
      { event: { metadata: { certificateRequestId?: string } } }
    ];
    expect(call.event.metadata.certificateRequestId).toBe("cert-req-1");
  });

  it("truncates long error messages", async () => {
    const { deps, record } = setup();

    await record(new Error("e".repeat(5000)));

    const [call] = deps.auditLogService.createCollapsedAuditLog.mock.calls[0] as [
      { event: { metadata: { error: string } } }
    ];
    expect(call.event.metadata.error).toHaveLength(1000);
  });

  it.each([new ForbiddenError(undefined as never), new ForbiddenRequestError({ message: "denied" })])(
    "skips permission denials",
    async (error) => {
      const { deps, record } = setup();

      await record(error);

      expect(deps.auditLogService.createCollapsedAuditLog).not.toHaveBeenCalled();
    }
  );

  it("never throws when recording fails", async () => {
    const { deps, record } = setup();
    deps.auditLogService.createCollapsedAuditLog.mockRejectedValueOnce(new Error("redis down"));

    await expect(record(new Error("x"))).resolves.toBeUndefined();
  });
});
