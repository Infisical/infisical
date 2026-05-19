import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const MigrationResultSchema = z.object({
  sourceProjectId: z.string(),
  destinationProjectId: z.string(),
  migratedCertificateAuthorities: z.number().int().nonnegative(),
  renamedCertificateAuthorities: z.array(
    z.object({
      originalName: z.string(),
      newName: z.string()
    })
  ),
  migratedCertificatePolicies: z.number().int().nonnegative(),
  renamedCertificatePolicies: z.array(
    z.object({
      originalName: z.string(),
      newName: z.string()
    })
  ),
  migratedCertificateProfiles: z.number().int().nonnegative(),
  skippedCertificateProfiles: z.number().int().nonnegative(),
  renamedCertificateProfiles: z.array(
    z.object({
      originalSlug: z.string(),
      newSlug: z.string()
    })
  )
});

export const registerCertManagerMigrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/migrate",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "migrateCertManagerProject",
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description:
        "Duplicate internal certificate authorities, certificate policies, and certificate profiles from one project to another within the same organization. External CAs, certificates, and enrollment configs are not migrated.",
      body: z.object({
        sourceProjectId: z.string().trim().uuid(),
        destinationProjectId: z.string().trim().uuid()
      }),
      response: {
        200: MigrationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.certManagerMigration.migrateCertManagerProject({
        sourceProjectId: req.body.sourceProjectId,
        destinationProjectId: req.body.destinationProjectId,
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
          type: EventType.MIGRATE_CERT_MANAGER_PROJECT,
          metadata: {
            sourceProjectId: result.sourceProjectId,
            destinationProjectId: result.destinationProjectId,
            migratedCertificateAuthorities: result.migratedCertificateAuthorities,
            renamedCertificateAuthorities: result.renamedCertificateAuthorities,
            migratedCertificatePolicies: result.migratedCertificatePolicies,
            renamedCertificatePolicies: result.renamedCertificatePolicies,
            migratedCertificateProfiles: result.migratedCertificateProfiles,
            skippedCertificateProfiles: result.skippedCertificateProfiles,
            renamedCertificateProfiles: result.renamedCertificateProfiles
          }
        }
      });

      return result;
    }
  });
};
