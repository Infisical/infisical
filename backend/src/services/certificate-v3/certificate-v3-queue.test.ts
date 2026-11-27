import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";

import { RenewalAwaitingApprovalError } from "../certificate-request/certificate-request-approval-fns";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { certificateV3QueueServiceFactory } from "./certificate-v3-queue";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));

const eligibleCertificate = (id: string) => ({
  id,
  projectId: "project-1",
  commonName: `${id}.example.com`,
  profileId: "profile-1",
  profileName: "web-servers",
  applicationId: null,
  applicationName: null,
  renewBeforeDays: 7,
  hasPrivateKey: true
});

const runAutoRenewal = async (
  certificates: ReturnType<typeof eligibleCertificate>[],
  renewCertificate: ReturnType<typeof vi.fn>
) => {
  let handler: (() => Promise<void>) | undefined;
  const certificateDAL = {
    findCertificatesEligibleForRenewal: vi.fn().mockResolvedValueOnce(certificates).mockResolvedValue([]),
    updateById: vi.fn()
  };
  const auditLogService = { createAuditLog: vi.fn() };

  certificateV3QueueServiceFactory({
    cronJob: {
      register: vi.fn(({ handler: registered }: { handler: () => Promise<void> }) => {
        handler = registered;
      })
    } as never,
    certificateDAL: certificateDAL as never,
    certificateV3Service: { renewCertificate } as never,
    auditLogService
  }).init();

  await handler!();
  return { certificateDAL, auditLogService };
};

type TAuditedLog = { event: { type: EventType; metadata: { certificateId: string; error?: string } } };

const auditedEvents = (auditLogService: { createAuditLog: ReturnType<typeof vi.fn> }) =>
  (auditLogService.createAuditLog.mock.calls as [TAuditedLog][]).map(([log]) => ({
    type: log.event.type,
    certificateId: log.event.metadata.certificateId,
    error: log.event.metadata.error
  }));

describe("certificate V3 daily auto-renewal job", () => {
  test("skips a certificate whose renewal is already waiting for approval, without recording a failure", async () => {
    const renewCertificate = vi.fn().mockImplementation(async ({ certificateId }: { certificateId: string }) => {
      if (certificateId === "held") throw new RenewalAwaitingApprovalError();
      return {
        status: CertificateRequestStatus.ISSUED,
        certificateId: `${certificateId}-renewed`,
        serialNumber: "01",
        certificateRequestId: `${certificateId}-request`
      };
    });

    const { certificateDAL, auditLogService } = await runAutoRenewal(
      [eligibleCertificate("held"), eligibleCertificate("due")],
      renewCertificate
    );

    expect(renewCertificate).toHaveBeenCalledTimes(2);
    expect(auditedEvents(auditLogService)).toEqual([
      { type: EventType.AUTOMATED_RENEW_CERTIFICATE, certificateId: "due", error: undefined }
    ]);
    expect(certificateDAL.updateById).not.toHaveBeenCalled();
  });

  test("still records a failure for any other error, including another BadRequestError", async () => {
    const renewCertificate = vi.fn().mockImplementation(async ({ certificateId }: { certificateId: string }) => {
      if (certificateId === "bad-request") {
        throw new BadRequestError({ message: "CA type acme does not support certificate renewal" });
      }
      throw new Error("CA unreachable");
    });

    const { auditLogService } = await runAutoRenewal(
      [eligibleCertificate("bad-request"), eligibleCertificate("unreachable")],
      renewCertificate
    );

    expect(auditedEvents(auditLogService)).toEqual([
      {
        type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED,
        certificateId: "bad-request",
        error: "CA type acme does not support certificate renewal"
      },
      { type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED, certificateId: "unreachable", error: "CA unreachable" }
    ]);
  });
});
