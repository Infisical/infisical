import { z } from "zod";

import { PkiCertificateInstallationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPkiInstallationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiInstallations],
      operationId: "listPkiInstallations",
      description: "List PKI certificate installations for a project",
      querystring: z.object({
        projectId: z.string().describe("The ID of the project"),
        discoveryId: z.string().uuid().optional().describe("Filter by discovery configuration ID"),
        certificateId: z.string().uuid().optional().describe("Filter by certificate ID"),
        offset: z.coerce.number().min(0).optional().default(0).describe("Pagination offset"),
        limit: z.coerce.number().min(1).max(100).optional().default(25).describe("Pagination limit"),
        search: z.string().optional().describe("Search filter for name, hostname, or IP address")
      }),
      response: {
        200: z.object({
          installations: z.array(
            PkiCertificateInstallationsSchema.extend({
              certificatesCount: z.number().optional(),
              primaryCertName: z.string().nullable().optional()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { installations, totalCount } = await server.services.pkiInstallation.listInstallations({
        projectId: req.query.projectId,
        discoveryId: req.query.discoveryId,
        certificateId: req.query.certificateId,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_PKI_INSTALLATIONS,
          metadata: {
            count: totalCount
          }
        }
      });

      return { installations, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:installationId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiInstallations],
      operationId: "getPkiInstallation",
      description: "Get a PKI certificate installation by ID with linked certificates",
      params: z.object({
        installationId: z.string().uuid().describe("The ID of the installation")
      }),
      response: {
        200: PkiCertificateInstallationsSchema.extend({
          certificates: z
            .array(
              z.object({
                certificateId: z.string().uuid(),
                firstSeenAt: z.date(),
                lastSeenAt: z.date(),
                commonName: z.string().nullable().optional(),
                serialNumber: z.string().nullable().optional(),
                notBefore: z.date().nullable().optional(),
                notAfter: z.date().nullable().optional(),
                status: z.string().nullable().optional(),
                friendlyName: z.string().nullable().optional(),
                fingerprintSha256: z.string().nullable().optional()
              })
            )
            .optional()
        })
      }
    },
    handler: async (req) => {
      const installation = await server.services.pkiInstallation.getInstallation({
        installationId: req.params.installationId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: installation.projectId,
        event: {
          type: EventType.GET_PKI_INSTALLATION,
          metadata: {
            installationId: installation.id,
            name: installation.name ?? undefined
          }
        }
      });

      return installation;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:installationId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiInstallations],
      operationId: "updatePkiInstallation",
      description: "Update a PKI certificate installation",
      params: z.object({
        installationId: z.string().uuid().describe("The ID of the installation")
      }),
      body: z.object({
        name: z.string().max(255).optional().describe("Name of the installation")
      }),
      response: {
        200: PkiCertificateInstallationsSchema
      }
    },
    handler: async (req) => {
      const installation = await server.services.pkiInstallation.updateInstallation({
        installationId: req.params.installationId,
        name: req.body.name,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: installation.projectId,
        event: {
          type: EventType.UPDATE_PKI_INSTALLATION,
          metadata: {
            installationId: installation.id,
            name: installation.name ?? undefined
          }
        }
      });

      return installation;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:installationId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiInstallations],
      operationId: "deletePkiInstallation",
      description: "Delete a PKI certificate installation",
      params: z.object({
        installationId: z.string().uuid().describe("The ID of the installation")
      }),
      response: {
        200: PkiCertificateInstallationsSchema
      }
    },
    handler: async (req) => {
      const installation = await server.services.pkiInstallation.deleteInstallation({
        installationId: req.params.installationId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: installation.projectId,
        event: {
          type: EventType.DELETE_PKI_INSTALLATION,
          metadata: {
            installationId: installation.id,
            name: installation.name ?? null
          }
        }
      });

      return installation;
    }
  });
};
