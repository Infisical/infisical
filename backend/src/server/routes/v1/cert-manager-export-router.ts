import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ExportResultSchema = z.object({
  sourceProjectId: z.string(),
  destinationProjectId: z.string(),
  exportedCertificateAuthorities: z.number().int().nonnegative(),
  renamedCertificateAuthorities: z.array(
    z.object({
      originalName: z.string(),
      newName: z.string()
    })
  ),
  exportedCertificatePolicies: z.number().int().nonnegative(),
  renamedCertificatePolicies: z.array(
    z.object({
      originalName: z.string(),
      newName: z.string()
    })
  ),
  exportedCertificateProfiles: z.number().int().nonnegative(),
  skippedCertificateProfiles: z.number().int().nonnegative(),
  renamedCertificateProfiles: z.array(
    z.object({
      originalSlug: z.string(),
      newSlug: z.string()
    })
  )
});

export const registerCertManagerExportRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/export",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "exportCertManagerProject",
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description:
        "Duplicate internal certificate authorities, certificate policies, and certificate profiles from the source project into the organization's active Certificate Manager instance. External CAs, certificates, and enrollment configs are not exported.",
      body: z.object({
        sourceProjectId: z.string().trim().uuid()
      }),
      response: {
        200: ExportResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.certManagerExport.exportCertManagerProject({
        sourceProjectId: req.body.sourceProjectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: result.destinationProjectId,
        event: {
          type: EventType.EXPORT_CERT_MANAGER_PROJECT,
          metadata: {
            sourceProjectId: result.sourceProjectId,
            destinationProjectId: result.destinationProjectId,
            exportedCertificateAuthorities: result.exportedCertificateAuthorities,
            renamedCertificateAuthorities: result.renamedCertificateAuthorities,
            exportedCertificatePolicies: result.exportedCertificatePolicies,
            renamedCertificatePolicies: result.renamedCertificatePolicies,
            exportedCertificateProfiles: result.exportedCertificateProfiles,
            skippedCertificateProfiles: result.skippedCertificateProfiles,
            renamedCertificateProfiles: result.renamedCertificateProfiles
          }
        }
      });

      return result;
    }
  });
};
