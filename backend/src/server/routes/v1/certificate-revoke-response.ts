import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATES } from "@app/lib/api-docs";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { CertificateRevocationStatus, CrlReason } from "@app/services/certificate/certificate-types";

export const RevokeCertResponseSchemas = {
  200: z.object({
    message: z.string().trim(),
    status: z.literal(CertificateRevocationStatus.Revoked).describe(CERTIFICATES.REVOKE.status),
    serialNumber: z.string().trim().describe(CERTIFICATES.REVOKE.serialNumberRes),
    revokedAt: z.date().describe(CERTIFICATES.REVOKE.revokedAt),
    crlWarning: z.string().optional().describe(CERTIFICATES.REVOKE.crlWarning)
  }),
  202: z.object({
    message: z.string().trim(),
    status: z.literal(CertificateRevocationStatus.PendingApproval).describe(CERTIFICATES.REVOKE.status),
    serialNumber: z.string().trim().describe(CERTIFICATES.REVOKE.serialNumberRes),
    approvalRequestId: z.string().uuid().describe(CERTIFICATES.REVOKE.approvalRequestId)
  })
};

type TPendingRevocation = Extract<
  Awaited<ReturnType<TCertificateServiceFactory["revokeCert"]>>,
  { status: CertificateRevocationStatus.PendingApproval }
>;

export const sendRevocationPendingApproval = async (
  server: FastifyZodProvider,
  req: FastifyRequest<{ Body: { revocationReason: CrlReason } }>,
  reply: FastifyReply,
  result: TPendingRevocation
) => {
  const { cert, applicationName, ca } = result;

  await server.services.auditLog.createAuditLog({
    ...req.auditLogInfo,
    projectId: ca.projectId,
    event: {
      type: EventType.REQUEST_CERT_REVOCATION,
      metadata: {
        certId: cert.id,
        cn: cert.commonName,
        serialNumber: cert.serialNumber,
        applicationId: cert.applicationId,
        applicationName,
        revocationReason: req.body.revocationReason,
        approvalRequestId: result.approvalRequestId,
        approvalPolicyId: result.approvalPolicyId
      }
    }
  });

  const body: z.infer<(typeof RevokeCertResponseSchemas)[202]> = {
    message:
      "This certificate's Application requires approval to revoke it. It stays active until the request is approved.",
    status: CertificateRevocationStatus.PendingApproval,
    serialNumber: cert.serialNumber,
    approvalRequestId: result.approvalRequestId
  };
  return reply.status(202).send(body);
};
