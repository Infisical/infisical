import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { sanitizedSshCa } from "@app/ee/services/ssh/ssh-certificate-authority-schema";
import { SshCaStatus } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { sanitizedSshCertificateTemplate } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-schema";
import { SSH_CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export const registerSshCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create SSH CA",
      body: z.object({
        friendlyName: z.string().describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.friendlyName),
        keyAlgorithm: z
          .nativeEnum(CertKeyAlgorithm)
          .default(CertKeyAlgorithm.RSA_2048)
          .describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.keyAlgorithm)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.sshCertificateAuthority.createSshCa({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: ca.orgId,
        event: {
          type: EventType.CREATE_SSH_CA,
          metadata: {
            sshCaId: ca.id,
            friendlyName: ca.friendlyName
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:sshCaId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.GET.sshCaId)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.sshCertificateAuthority.getSshCaById({
        caId: req.params.sshCaId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: ca.orgId,
        event: {
          type: EventType.GET_SSH_CA,
          metadata: {
            sshCaId: ca.id,
            friendlyName: ca.friendlyName
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sshCaId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.UPDATE.sshCaId)
      }),
      body: z.object({
        status: z
          .enum([SshCaStatus.ACTIVE, SshCaStatus.DISABLED])
          .optional()
          .describe(SSH_CERTIFICATE_AUTHORITIES.UPDATE.status)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.sshCertificateAuthority.updateSshCaById({
        caId: req.params.sshCaId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: ca.orgId,
        event: {
          type: EventType.UPDATE_SSH_CA,
          metadata: {
            sshCaId: ca.id,
            friendlyName: ca.friendlyName,
            status: ca.status as SshCaStatus
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sshCaId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.DELETE.sshCaId)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.sshCertificateAuthority.deleteSshCaById({
        caId: req.params.sshCaId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: ca.orgId,
        event: {
          type: EventType.DELETE_SSH_CA,
          metadata: {
            sshCaId: ca.id,
            friendlyName: ca.friendlyName
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:sshCaId/certificate-templates",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get list of certificate templates for the SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.GET_CERTIFICATE_TEMPLATES.sshCaId)
      }),
      response: {
        200: z.object({
          certificateTemplates: sanitizedSshCertificateTemplate.array()
        })
      }
    },
    handler: async (req) => {
      const { certificateTemplates, ca } = await server.services.sshCertificateAuthority.getSshCaCertificateTemplates({
        caId: req.params.sshCaId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: ca.orgId,
        event: {
          type: EventType.GET_SSH_CA_CERTIFICATE_TEMPLATES,
          metadata: {
            sshCaId: ca.id,
            friendlyName: ca.friendlyName
          }
        }
      });

      return {
        certificateTemplates
      };
    }
  });
};
