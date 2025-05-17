import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  TCertificateAuthority,
  TCertificateAuthorityInput
} from "@app/services/certificate-authority/certificate-authority-types";

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
    projectId: string;
    status: CaStatus;
    configuration: I["configuration"];
    disableDirectIssuance: boolean;
  }>;
  updateSchema: z.ZodType<{
    name?: string;
    status?: CaStatus;
    configuration?: I["configuration"];
    disableDirectIssuance?: boolean;
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required")
      }),
      response: {
        200: z.object({ certificateAuthorities: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId }
      } = req;

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

      return { certificateAuthorities };
    }
  });

  server.route({
    method: "GET",
    url: "/:certificateAuthorityId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        certificateAuthorityId: z.string().uuid()
      }),
      response: {
        200: z.object({ certificateAuthority: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateAuthorityId } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.findCertificateAuthorityById(
        { certificateAuthorityId, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.GET_CA,
          metadata: {
            caId: certificateAuthority.id
          }
        }
      });

      return { certificateAuthority };
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
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      body: createSchema,
      response: {
        200: z.object({ certificateAuthority: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateAuthority = (await server.services.certificateAuthority.createCertificateAuthority(
        { ...req.body, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.CREATE_CA,
          metadata: {
            caId: certificateAuthority.id
          }
        }
      });

      return { certificateAuthority };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:certificateAuthorityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        certificateAuthorityId: z.string().uuid()
      }),
      body: updateSchema,
      response: {
        200: z.object({ certificateAuthority: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateAuthorityId } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.updateCertificateAuthority(
        {
          ...req.body,
          id: certificateAuthorityId,
          type: caType
        },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.UPDATE_CA,
          metadata: {
            caId: certificateAuthority.id,
            status: certificateAuthority.status
          }
        }
      });

      return { certificateAuthority };
    }
  });

  server.route({
    method: "DELETE",
    url: `/:certificateAuthorityId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        certificateAuthorityId: z.string().uuid()
      }),
      response: {
        200: z.object({ certificateAuthority: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateAuthorityId } = req.params;

      const certificateAuthority = (await server.services.certificateAuthority.deleteCertificateAuthority(
        { id: certificateAuthorityId, type: caType },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateAuthority.projectId,
        event: {
          type: EventType.DELETE_CA,
          metadata: {
            caId: certificateAuthority.id
          }
        }
      });

      return { certificateAuthority };
    }
  });
};
