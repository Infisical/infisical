import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATES } from "@app/lib/api-docs";
import { SanitizedCertificateSchema } from "@app/services/certificate/certificate-schemas";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { CertificateDeletionStatus } from "@app/services/certificate/certificate-types";

export const DeleteCertResponseSchemas = {
  200: z.object({
    certificate: SanitizedCertificateSchema
  }),
  202: z.object({
    message: z.string().trim().describe(CERTIFICATES.DELETE.message),
    status: z.literal(CertificateDeletionStatus.PendingApproval).describe(CERTIFICATES.DELETE.status),
    serialNumber: z.string().trim().describe(CERTIFICATES.DELETE.serialNumberRes),
    approvalRequestId: z.string().uuid().describe(CERTIFICATES.DELETE.approvalRequestId)
  })
};

type TPendingDeletion = Extract<
  Awaited<ReturnType<TCertificateServiceFactory["deleteCert"]>>,
  { status: CertificateDeletionStatus.PendingApproval }
>;

export const sendDeletionPendingApproval = async (
  server: FastifyZodProvider,
  req: FastifyRequest,
  reply: FastifyReply,
  result: TPendingDeletion
) => {
  const { cert, applicationName } = result;

  await server.services.auditLog.createAuditLog({
    ...req.auditLogInfo,
    projectId: cert.projectId,
    event: {
      type: EventType.REQUEST_CERT_DELETION,
      metadata: {
        certId: cert.id,
        cn: cert.commonName,
        friendlyName: cert.friendlyName,
        serialNumber: cert.serialNumber,
        applicationId: cert.applicationId,
        applicationName,
        approvalRequestId: result.approvalRequestId,
        requesterName: result.requesterName,
        requesterEmail: result.requesterEmail,
        approvalPolicyId: result.approvalPolicyId,
        approvalPolicyName: result.approvalPolicyName
      }
    }
  });

  const body: z.infer<(typeof DeleteCertResponseSchemas)[202]> = {
    message:
      "This certificate's Application requires approval to delete it. It isn't deleted until the request is approved.",
    status: CertificateDeletionStatus.PendingApproval,
    serialNumber: cert.serialNumber,
    approvalRequestId: result.approvalRequestId
  };
  return reply.status(202).send(body);
};
