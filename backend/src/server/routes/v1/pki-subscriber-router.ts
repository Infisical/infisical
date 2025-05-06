import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PKI_SUBSCRIBERS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { validateAltNameField } from "@app/services/certificate-authority/certificate-authority-validators";
import { sanitizedPkiSubscriber } from "@app/services/pki-subscriber/pki-subscriber-schema";

export const registerPkiSubscriberRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:subscriberId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Get PKI Subscriber",
      params: z.object({
        subscriberId: z.string().describe(PKI_SUBSCRIBERS.GET.subscriberId)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.getPkiSubscriberById({
        subscriberId: req.params.subscriberId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.GET_PKI_SUBSCRIBER,
          metadata: {
            pkiSubscriberId: subscriber.id
          }
        }
      });

      return subscriber;
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
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Create PKI Subscriber",
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.CREATE.projectId),
        caId: z
          .string()
          .trim()
          .uuid("CA ID must be a valid UUID")
          .min(1, "CA ID is required")
          .describe(PKI_SUBSCRIBERS.CREATE.caId),
        name: slugSchema({ min: 1, max: 64, field: "name" }).describe(PKI_SUBSCRIBERS.CREATE.name),
        commonName: z.string().trim().min(1).describe(PKI_SUBSCRIBERS.CREATE.commonName),
        ttl: z
          .string()
          .trim()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .describe(PKI_SUBSCRIBERS.CREATE.ttl),
        subjectAlternativeNames: validateAltNameField
          .array()
          .default([])
          .transform((arr) => Array.from(new Set(arr)))
          .describe(PKI_SUBSCRIBERS.CREATE.subjectAlternativeNames),
        keyUsages: z
          .nativeEnum(CertKeyUsage)
          .array()
          .default([CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT])
          .transform((arr) => Array.from(new Set(arr)))
          .describe(PKI_SUBSCRIBERS.CREATE.keyUsages),
        extendedKeyUsages: z
          .nativeEnum(CertExtendedKeyUsage)
          .array()
          .default([])
          .transform((arr) => Array.from(new Set(arr)))
          .describe(PKI_SUBSCRIBERS.CREATE.extendedKeyUsages)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.createPkiSubscriber({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.CREATE_PKI_SUBSCRIBER,
          metadata: {
            pkiSubscriberId: subscriber.id,
            caId: subscriber.caId,
            name: subscriber.name,
            commonName: subscriber.commonName,
            ttl: subscriber.ttl,
            subjectAlternativeNames: subscriber.subjectAlternativeNames,
            keyUsages: subscriber.keyUsages as CertKeyUsage[],
            extendedKeyUsages: subscriber.extendedKeyUsages as CertExtendedKeyUsage[]
          }
        }
      });

      return subscriber;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:subscriberId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Update PKI Subscriber",
      params: z.object({
        subscriberId: z.string().trim().describe(PKI_SUBSCRIBERS.UPDATE.subscriberId)
      }),
      body: z.object({
        caId: z
          .string()
          .trim()
          .uuid("CA ID must be a valid UUID")
          .min(1, "CA ID is required")
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.caId),
        name: slugSchema({ min: 1, max: 64, field: "name" }).describe(PKI_SUBSCRIBERS.UPDATE.name).optional(),
        commonName: z.string().trim().min(1).describe(PKI_SUBSCRIBERS.UPDATE.commonName).optional(),
        subjectAlternativeNames: validateAltNameField
          .array()
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.subjectAlternativeNames),
        ttl: z
          .string()
          .trim()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.ttl),
        keyUsages: z
          .nativeEnum(CertKeyUsage)
          .array()
          .transform((arr) => Array.from(new Set(arr)))
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.keyUsages),
        extendedKeyUsages: z
          .nativeEnum(CertExtendedKeyUsage)
          .array()
          .transform((arr) => Array.from(new Set(arr)))
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.extendedKeyUsages)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.updatePkiSubscriber({
        subscriberId: req.params.subscriberId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.UPDATE_PKI_SUBSCRIBER,
          metadata: {
            pkiSubscriberId: subscriber.id,
            caId: subscriber.caId,
            name: subscriber.name,
            commonName: subscriber.commonName,
            ttl: subscriber.ttl,
            subjectAlternativeNames: subscriber.subjectAlternativeNames,
            keyUsages: subscriber.keyUsages as CertKeyUsage[],
            extendedKeyUsages: subscriber.extendedKeyUsages as CertExtendedKeyUsage[]
          }
        }
      });

      return subscriber;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:subscriberId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Delete PKI Subscriber",
      params: z.object({
        subscriberId: z.string().describe(PKI_SUBSCRIBERS.DELETE.subscriberId)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.deletePkiSubscriber({
        subscriberId: req.params.subscriberId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.DELETE_PKI_SUBSCRIBER,
          metadata: {
            pkiSubscriberId: subscriber.id
          }
        }
      });

      return subscriber;
    }
  });

  server.route({
    method: "POST",
    url: "/:subscriberId/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Issue certificate",
      params: z.object({
        subscriberId: z.string().describe(PKI_SUBSCRIBERS.ISSUE_CERT.subscriberId)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.certificate),
          issuingCaCertificate: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.issuingCaCertificate),
          certificateChain: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.certificateChain),
          privateKey: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.privateKey),
          serialNumber: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      // TODO: reuse issueCertFromCa fn (or not since we are adding support for external CAs?)
      // const { serialNumber, signedPublicKey, privateKey, publicKey, keyAlgorithm, host, principals } =
      //   await server.services.pkiSubscriber.issuePkiSubscriberCertificate({
      //     subscriberId: req.params.subscriberId,
      //     actor: req.permission.type,
      //     actorId: req.permission.id,
      //     actorAuthMethod: req.permission.authMethod,
      //     actorOrgId: req.permission.orgId
      //   });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ISSUE_SSH_HOST_USER_CERT,
          metadata: {
            sshHostId: req.params.sshHostId,
            hostname: host.hostname,
            loginUser: req.body.loginUser,
            principals,
            ttl: host.userCertTtl
          }
        }
      });

      return {
        serialNumber,
        signedKey: signedPublicKey,
        privateKey,
        publicKey,
        keyAlgorithm
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:subscriberId/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Sign certificate",
      params: z.object({
        subscriberId: z.string().describe(PKI_SUBSCRIBERS.ISSUE_CERT.subscriberId)
      }),
      body: z.object({
        csr: z.string().trim().min(1).
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.certificate),
          issuingCaCertificate: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.issuingCaCertificate),
          certificateChain: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.certificateChain),
          serialNumber: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      // TODO: reuse issueCertFromCa fn (or not since we are adding support for external CAs?)
      const { serialNumber, signedPublicKey, privateKey, publicKey, keyAlgorithm, host, principals } =
        await server.services.pkiSubscriber.issuePkiSubscriberCertificate({
          subscriberId: req.params.subscriberId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   orgId: req.permission.orgId,
      //   event: {
      //     type: EventType.ISSUE_SSH_HOST_USER_CERT,
      //     metadata: {
      //       sshHostId: req.params.sshHostId,
      //       hostname: host.hostname,
      //       loginUser: req.body.loginUser,
      //       principals,
      //       ttl: host.userCertTtl
      //     }
      //   }
      // });

      return {
        serialNumber,
        signedKey: signedPublicKey,
        publicKey,
        keyAlgorithm
      };
    }
  });
};
