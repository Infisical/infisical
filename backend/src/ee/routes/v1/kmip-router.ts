import { z } from "zod";

import { KmipClientsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { KmipPermission } from "@app/ee/services/kmip/kmip-enum";
import { KmipClientOrderBy } from "@app/ee/services/kmip/kmip-types";
import { ms } from "@app/lib/ms";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { validateAltNamesField } from "@app/services/certificate-authority/certificate-authority-validators";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const KmipClientResponseSchema = KmipClientsSchema.pick({
  projectId: true,
  name: true,
  id: true,
  description: true,
  permissions: true
});

export const registerKmipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/clients",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectId: z.string(),
        name: z.string().trim().min(1),
        description: z.string().optional(),
        permissions: z.nativeEnum(KmipPermission).array()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.createKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.CREATE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id,
            name: kmipClient.name,
            permissions: (kmipClient.permissions ?? []) as KmipPermission[]
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.KmipClientCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { clientId: kmipClient.id, projectId: kmipClient.projectId }
        })
        .catch(() => {});

      return kmipClient;
    }
  });

  server.route({
    method: "PATCH",
    url: "/clients/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        permissions: z.nativeEnum(KmipPermission).array()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.updateKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.UPDATE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id,
            name: kmipClient.name,
            permissions: (kmipClient.permissions ?? []) as KmipPermission[]
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.KmipClientUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            clientId: kmipClient.id,
            projectId: kmipClient.projectId
          }
        })
        .catch(() => {});

      return kmipClient;
    }
  });

  server.route({
    method: "DELETE",
    url: "/clients/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.deleteKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.DELETE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.KmipClientDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            clientId: kmipClient.id,
            projectId: kmipClient.projectId
          }
        })
        .catch(() => {});

      return kmipClient;
    }
  });

  server.route({
    method: "GET",
    url: "/clients/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.getKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.GET_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id
          }
        }
      });

      return kmipClient;
    }
  });

  server.route({
    method: "GET",
    url: "/clients",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List KMIP clients",
      querystring: z.object({
        projectId: z.string(),
        offset: z.coerce.number().min(0).optional().default(0),
        limit: z.coerce.number().min(1).max(100).optional().default(100),
        orderBy: z.nativeEnum(KmipClientOrderBy).optional().default(KmipClientOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).optional().default(OrderByDirection.ASC),
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          kmipClients: KmipClientResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { kmipClients, totalCount } = await server.services.kmip.listKmipClientsByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_KMIP_CLIENTS,
          metadata: {
            ids: kmipClients.map((key) => key.id)
          }
        }
      });

      return { kmipClients, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/clients/:id/certificates",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z
        .object({
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
          ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
          csr: z.string().trim().min(1, "CSR cannot be empty").max(4096).optional()
        })
        .refine((data) => data.csr || data.keyAlgorithm, {
          message: "Either csr or keyAlgorithm must be provided"
        }),
      response: {
        200: z.object({
          serialNumber: z.string(),
          certificateChain: z.string(),
          certificate: z.string(),
          privateKey: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificate = await server.services.kmip.createKmipClientCertificate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        clientId: req.params.id,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: certificate.projectId,
        event: {
          type: EventType.CREATE_KMIP_CLIENT_CERTIFICATE,
          metadata: {
            clientId: req.params.id,
            serialNumber: certificate.serialNumber,
            ttl: req.body.ttl,
            keyAlgorithm: req.body.keyAlgorithm,
            isFromCsr: Boolean(req.body.csr)
          }
        }
      });

      return certificate;
    }
  });

  server.route({
    method: "POST",
    url: "/server-registration",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        hostnamesOrIps: validateAltNamesField,
        commonName: z.string().trim().min(1).optional(),
        keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional().default(CertKeyAlgorithm.RSA_2048),
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number")
      }),
      response: {
        200: z.object({
          clientCertificateChain: z.string(),
          certificateChain: z.string(),
          certificate: z.string(),
          privateKey: z.string()
        })
      }
    },
    // Legacy machine-identity servers only. Enrollment-based servers use POST /kmip/servers/connect,
    // which reads the cert config from the stored server entity instead of the request body.
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { hostnamesOrIps } = req.body;

      const configs = await server.services.kmip.registerServer({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.REGISTER_KMIP_SERVER,
          metadata: {
            serverCertificateSerialNumber: configs.serverCertificateSerialNumber,
            hostnamesOrIps,
            commonName: req.body.commonName ?? "kmip-server",
            keyAlgorithm: req.body.keyAlgorithm,
            ttl: req.body.ttl
          }
        }
      });

      return configs;
    }
  });
};
