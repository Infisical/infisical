import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";

import { certificateApprovalServiceFactory } from "./certificate-approval-fns";

const stubDeps = () => {
  const stubs = new Map<string, unknown>();
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property: string) => {
      if (!stubs.has(property)) stubs.set(property, vi.fn());
      return stubs.get(property);
    }
  });
};

describe("issueCertificate after an approval", () => {
  it("reads the request from the primary, where approval just set it pending", async () => {
    const primary = { isPrimary: true };
    const replicaRequest = { id: "request-1", status: CertificateRequestStatus.PENDING_APPROVAL };
    const certificateRequestDAL = {
      findById: vi.fn(async (_id: string, tx?: unknown) =>
        tx === primary ? { ...replicaRequest, status: CertificateRequestStatus.PENDING } : replicaRequest
      ),
      updateById: vi.fn()
    };
    const service = certificateApprovalServiceFactory({
      ...stubDeps(),
      certificateRequestDAL,
      certificateDAL: { primaryNode: vi.fn().mockReturnValue(primary) }
    } as unknown as Parameters<typeof certificateApprovalServiceFactory>[0]);

    await expect(service.issueCertificate("request-1")).rejects.toThrow("Certificate request is missing profile ID");

    expect(certificateRequestDAL.findById).toHaveBeenCalledWith("request-1", primary);
  });
});

describe("issueCertificate for an approved re-enrollment", () => {
  it("fails the request when the certificate it renews was deleted while it waited", async () => {
    const primary = { isPrimary: true };
    const certificateRequestDAL = {
      findById: vi.fn(async () => ({
        id: "request-1",
        profileId: "profile-1",
        status: CertificateRequestStatus.PENDING
      })),
      updateById: vi.fn()
    };
    const certificateDAL = {
      primaryNode: vi.fn().mockReturnValue(primary),
      findById: vi.fn(async () => ({
        id: "original-1",
        commonName: "device.example.com",
        serialNumber: "01",
        deletedAt: new Date("2026-11-20T00:00:00.000Z")
      }))
    };
    const internalCaService = { signCertFromCa: vi.fn() };
    const service = certificateApprovalServiceFactory({
      ...stubDeps(),
      certificateRequestDAL,
      certificateDAL,
      internalCaService
    } as unknown as Parameters<typeof certificateApprovalServiceFactory>[0]);

    await expect(service.issueCertificate("request-1", "original-1")).rejects.toThrow(
      "Certificate 'device.example.com' was deleted on 2026-11-20T00:00:00.000Z. It can no longer be renewed or changed."
    );

    expect(certificateDAL.findById).toHaveBeenCalledWith("original-1", primary);
    expect(internalCaService.signCertFromCa).not.toHaveBeenCalled();
    expect(certificateRequestDAL.updateById).toHaveBeenLastCalledWith(
      "request-1",
      expect.objectContaining({ status: CertificateRequestStatus.FAILED })
    );
  });
});
