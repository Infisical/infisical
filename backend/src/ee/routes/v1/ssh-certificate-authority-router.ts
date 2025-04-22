import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { normalizeSshPrivateKey } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { sanitizedSshCa } from "@app/ee/services/ssh/ssh-certificate-authority-schema";
import { SshCaKeySource, SshCaStatus } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { sanitizedSshCertificateTemplate } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-schema";
import { ApiDocsTags, SSH_CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSshCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
      description: "Create SSH CA",
      body: z
        .object({
          projectId: z.string().describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.projectId),
          friendlyName: z.string().describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.friendlyName),
          keyAlgorithm: z
            .nativeEnum(SshCertKeyAlgorithm)
            .default(SshCertKeyAlgorithm.ED25519)
            .describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.keyAlgorithm),
          publicKey: z.string().trim().optional().describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.publicKey),
          privateKey: z
            .string()
            .trim()
            .optional()
            .transform((val) => (val ? normalizeSshPrivateKey(val) : undefined))
            .describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.privateKey),
          keySource: z
            .nativeEnum(SshCaKeySource)
            .default(SshCaKeySource.INTERNAL)
            .describe(SSH_CERTIFICATE_AUTHORITIES.CREATE.keySource)
        })
        .refine((data) => data.keySource === SshCaKeySource.INTERNAL || (!!data.publicKey && !!data.privateKey), {
          message: "publicKey and privateKey are required when keySource is external",
          path: ["publicKey"]
        })
        .refine((data) => data.keySource === SshCaKeySource.EXTERNAL || !!data.keyAlgorithm, {
          message: "keyAlgorithm is required when keySource is internal",
          path: ["keyAlgorithm"]
        }),
      response: {
        200: z.object({
          ca: sanitizedSshCa.extend({
            publicKey: z.string()
          })
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
        projectId: ca.projectId,
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
      description: "Get SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.GET.sshCaId)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa.extend({
            publicKey: z.string()
          })
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
        projectId: ca.projectId,
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
    method: "GET",
    url: "/:sshCaId/public-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
      description: "Get public key of SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.GET_PUBLIC_KEY.sshCaId)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req) => {
      const publicKey = await server.services.sshCertificateAuthority.getSshCaPublicKey({
        caId: req.params.sshCaId
      });

      return publicKey;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sshCaId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
      description: "Update SSH CA",
      params: z.object({
        sshCaId: z.string().trim().describe(SSH_CERTIFICATE_AUTHORITIES.UPDATE.sshCaId)
      }),
      body: z.object({
        friendlyName: z.string().optional().describe(SSH_CERTIFICATE_AUTHORITIES.UPDATE.friendlyName),
        status: z.nativeEnum(SshCaStatus).optional().describe(SSH_CERTIFICATE_AUTHORITIES.UPDATE.status)
      }),
      response: {
        200: z.object({
          ca: sanitizedSshCa.extend({
            publicKey: z.string()
          })
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
        projectId: ca.projectId,
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
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
        projectId: ca.projectId,
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateAuthorities],
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
        projectId: ca.projectId,
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
