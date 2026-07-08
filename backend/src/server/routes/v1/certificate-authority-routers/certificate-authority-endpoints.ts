import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  TCertificateAuthority,
  TCertificateAuthorityInput
} from "@app/services/certificate-authority/certificate-authority-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerCertificateAuthorityEndpoints = <
  T extends TCertificateAuthority,
  I extends TCertificateAuthorityInput
>({
  server,
  caType,
  createSchema,
  updateSchema,
  responseSchema
}: {
  caType: CaType;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    projectId?: string;
    status: CaStatus;
    configuration: I["configuration"];
  }>;
  updateSchema: z.ZodType<{
    status?: CaStatus;
    configuration?: I["configuration"];
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const caTypeNameForOpId = caType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${caTypeNameForOpId}CertificateAuthoritiesV1`,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      querystring: z.object({
        projectId: z.string().uuid().optional().describe(openApiHidden())
      }),
      response: {
        200: responseSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.query.projectId ?? req.internalCertManagerProjectId;

      const certificateAuthorities = (await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        { projectId, type: caType },
        req.permission
      )) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_CAS,
          metadata: {
            caIds: certificateAuthorities.map((ca) => ca.id)
          }
        }
      });

      return certificateAuthorities;
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${caTypeNameForOpId}CertificateAuthorityV1`,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        id: z.string()
      }),
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.findCertificateAuthorityById(
        { id, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.GET_CA,
          metadata: {
            caId: certificateAuthority.id,
            name: certificateAuthority.name
          }
        }
      });

      return certificateAuthority;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `create${caTypeNameForOpId}CertificateAuthorityV1`,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      body: createSchema,
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const body = req.body as {
        projectId?: string;
        configuration?: { keySource?: string; hsmConnectorId?: string };
      };
      const certificateAuthority = (await server.services.certificateAuthority.createCertificateAuthority(
        { ...req.body, projectId: body.projectId ?? req.internalCertManagerProjectId, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.CREATE_CA,
          metadata: {
            name: certificateAuthority.name,
            caId: certificateAuthority.id,
            keySource: body.configuration?.keySource,
            hsmConnectorId: body.configuration?.hsmConnectorId
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CaCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          caType,
          orgId: req.permission.orgId
        }
      });

      return certificateAuthority;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `update${caTypeNameForOpId}CertificateAuthorityV1`,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        id: z.string()
      }),
      body: updateSchema,
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.updateCertificateAuthority(
        {
          ...req.body,
          type: caType,
          id
        },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.UPDATE_CA,
          metadata: {
            name: certificateAuthority.name,
            caId: certificateAuthority.id,
            status: certificateAuthority.status
          }
        }
      });

      return certificateAuthority;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `delete${caTypeNameForOpId}CertificateAuthorityV1`,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        id: z.string()
      }),
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.deleteCertificateAuthority(
        { id, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.DELETE_CA,
          metadata: {
            name: certificateAuthority.name,
            caId: certificateAuthority.id
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CaDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          caType,
          orgId: req.permission.orgId
        }
      });

      return certificateAuthority;
    }
  });
};
