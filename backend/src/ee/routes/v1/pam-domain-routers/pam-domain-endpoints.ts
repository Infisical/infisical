import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamDomainType } from "@app/ee/services/pam-domain/pam-domain-enums";
import { TPamDomain } from "@app/ee/services/pam-domain/pam-domain-types";
import { SanitizedWindowsResourceSchema } from "@app/ee/services/pam-resource/windows-server/windows-server-resource-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";

export const registerPamDomainEndpoints = <T extends TPamDomain>({
  server,
  domainType,
  createDomainSchema,
  updateDomainSchema,
  domainResponseSchema
}: {
  server: FastifyZodProvider;
  domainType: PamDomainType;
  createDomainSchema: z.ZodType<{
    projectId: T["projectId"];
    connectionDetails: T["connectionDetails"];
    gatewayId?: string;
    name: T["name"];
    metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
  }>;
  updateDomainSchema: z.ZodType<{
    connectionDetails?: T["connectionDetails"];
    gatewayId?: string;
    name?: T["name"];
    metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
  }>;
  domainResponseSchema: z.ZodTypeAny;
}) => {
  const domainTypeId = domainType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  server.route({
    method: "GET",
    url: "/:domainId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: `get${domainTypeId}PamDomain`,
      description: `Get ${domainTypeId} PAM domain`,
      params: z.object({ domainId: z.string().uuid() }),
      response: {
        200: z.object({
          domain: domainResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const domain = await server.services.pamDomain.getById(req.params.domainId, domainType, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: domain.projectId,
        event: {
          type: EventType.PAM_DOMAIN_GET,
          metadata: {
            domainId: domain.id,
            domainType: domain.domainType,
            name: domain.name
          }
        }
      });

      return { domain };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: `create${domainTypeId}PamDomain`,
      description: `Create ${domainTypeId} PAM domain`,
      body: createDomainSchema,
      response: {
        200: z.object({
          domain: domainResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const domain = await server.services.pamDomain.create(
        {
          ...req.body,
          domainType
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_DOMAIN_CREATE,
          metadata: {
            domainType,
            ...(req.body.gatewayId && { gatewayId: req.body.gatewayId }),
            name: req.body.name
          }
        }
      });

      return { domain };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:domainId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: `update${domainTypeId}PamDomain`,
      description: `Update ${domainTypeId} PAM domain`,
      params: z.object({ domainId: z.string().uuid() }),
      body: updateDomainSchema,
      response: {
        200: z.object({
          domain: domainResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const domain = await server.services.pamDomain.updateById(
        {
          ...req.body,
          domainId: req.params.domainId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: domain.projectId,
        event: {
          type: EventType.PAM_DOMAIN_UPDATE,
          metadata: {
            domainId: req.params.domainId,
            domainType,
            ...(req.body.gatewayId && { gatewayId: req.body.gatewayId }),
            ...(req.body.name && { name: req.body.name })
          }
        }
      });

      return { domain };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:domainId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: `delete${domainTypeId}PamDomain`,
      description: `Delete ${domainTypeId} PAM domain`,
      params: z.object({ domainId: z.string().uuid() }),
      response: {
        200: z.object({
          domain: domainResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const domain = await server.services.pamDomain.deleteById(req.params.domainId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: domain.projectId,
        event: {
          type: EventType.PAM_DOMAIN_DELETE,
          metadata: {
            domainId: req.params.domainId,
            domainType
          }
        }
      });

      return { domain };
    }
  });
};

export const registerActiveDirectoryRelatedResourcesEndpoint = (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:domainId/related-resources",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listActiveDirectoryDomainRelatedResources",
      description: "List resources related to an Active Directory domain",
      params: z.object({ domainId: z.string().uuid() }),
      response: {
        200: z.object({
          resources: SanitizedWindowsResourceSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const resources = await server.services.pamDomain.listRelatedResources(req.params.domainId, req.permission);
      return { resources };
    }
  });
};
