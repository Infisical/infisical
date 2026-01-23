import RE2 from "re2";
import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas/certificates";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PKI_SUBSCRIBERS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { validateAltNameField } from "@app/services/certificate-authority/certificate-authority-validators";
import { sanitizedPkiSubscriber } from "@app/services/pki-subscriber/pki-subscriber-schema";
import { PkiSubscriberStatus } from "@app/services/pki-subscriber/pki-subscriber-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerPkiSubscriberRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:subscriberName",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getPkiSubscriber",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Get PKI Subscriber",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.GET.subscriberName)
      }),
      querystring: z.object({
        projectId: z.string().describe(PKI_SUBSCRIBERS.GET.projectId)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.getSubscriber({
        subscriberName: req.params.subscriberName,
        projectId: req.query.projectId,
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
            pkiSubscriberId: subscriber.id,
            name: subscriber.name
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
      operationId: "createPkiSubscriber",
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
        status: z
          .nativeEnum(PkiSubscriberStatus)
          .default(PkiSubscriberStatus.ACTIVE)
          .describe(PKI_SUBSCRIBERS.CREATE.status),
        ttl: z
          .string()
          .trim()
          .refine((val) => !val || ms(val) > 0, "TTL must be a positive number")
          .optional()
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
          .describe(PKI_SUBSCRIBERS.CREATE.extendedKeyUsages),
        enableAutoRenewal: z.boolean().optional().describe(PKI_SUBSCRIBERS.CREATE.enableAutoRenewal),
        autoRenewalPeriodInDays: z.number().min(1).optional().describe(PKI_SUBSCRIBERS.CREATE.autoRenewalPeriodInDays),
        properties: z
          .object({
            azureTemplateType: z.string().optional().describe("Azure ADCS Certificate Template Type"),
            organization: z
              .string()
              .trim()
              .min(1)
              .max(64, "Organization cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Organization contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Organization cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Organization (O) - Maximum 64 characters, no special DN characters"),
            organizationalUnit: z
              .string()
              .trim()
              .min(1)
              .max(64, "Organizational Unit cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Organizational Unit contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Organizational Unit cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Organizational Unit (OU) - Maximum 64 characters, no special DN characters"),
            country: z
              .string()
              .trim()
              .length(2, "Country must be exactly 2 characters")
              .regex(new RE2("^[A-Z]{2}$"), "Country must be exactly 2 uppercase letters")
              .optional()
              .describe("Country (C) - Two uppercase letter country code (e.g., US, CA, GB)"),
            state: z
              .string()
              .trim()
              .min(1)
              .max(64, "State cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'State contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "State cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("State/Province (ST) - Maximum 64 characters, no special DN characters"),
            locality: z
              .string()
              .trim()
              .min(1)
              .max(64, "Locality cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Locality contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Locality cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Locality (L) - Maximum 64 characters, no special DN characters"),
            emailAddress: z
              .string()
              .trim()
              .email("Email Address must be a valid email format")
              .min(6, "Email Address must be at least 6 characters")
              .max(64, "Email Address cannot exceed 64 characters")
              .optional()
              .describe("Email Address - Valid email format between 6 and 64 characters")
          })
          .optional()
          .describe("Additional subscriber properties and subject fields")
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.createSubscriber({
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
            caId: subscriber.caId ?? undefined,
            name: subscriber.name,
            commonName: subscriber.commonName,
            ttl: subscriber.ttl ?? undefined,
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
    url: "/:subscriberName",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updatePkiSubscriber",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Update PKI Subscriber",
      params: z.object({
        subscriberName: z.string().trim().describe(PKI_SUBSCRIBERS.UPDATE.subscriberName)
      }),
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.UPDATE.projectId),
        caId: z
          .string()
          .trim()
          .uuid("CA ID must be a valid UUID")
          .min(1, "CA ID is required")
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.caId),
        name: slugSchema({ min: 1, max: 64, field: "name" }).describe(PKI_SUBSCRIBERS.UPDATE.name).optional(),
        commonName: z.string().trim().min(1).describe(PKI_SUBSCRIBERS.UPDATE.commonName).optional(),
        status: z.nativeEnum(PkiSubscriberStatus).optional().describe(PKI_SUBSCRIBERS.UPDATE.status),
        subjectAlternativeNames: validateAltNameField
          .array()
          .optional()
          .describe(PKI_SUBSCRIBERS.UPDATE.subjectAlternativeNames),
        ttl: z
          .string()
          .trim()
          .refine((val) => !val || ms(val) > 0, "TTL must be a positive number")
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
          .describe(PKI_SUBSCRIBERS.UPDATE.extendedKeyUsages),
        enableAutoRenewal: z.boolean().optional().describe(PKI_SUBSCRIBERS.UPDATE.enableAutoRenewal),
        autoRenewalPeriodInDays: z.number().min(1).optional().describe(PKI_SUBSCRIBERS.UPDATE.autoRenewalPeriodInDays),
        properties: z
          .object({
            azureTemplateType: z.string().optional().describe("Azure ADCS Certificate Template Type"),
            organization: z
              .string()
              .trim()
              .min(1)
              .max(64, "Organization cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Organization contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Organization cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Organization (O) - Maximum 64 characters, no special DN characters"),
            organizationalUnit: z
              .string()
              .trim()
              .min(1)
              .max(64, "Organizational Unit cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Organizational Unit contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Organizational Unit cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Organizational Unit (OU) - Maximum 64 characters, no special DN characters"),
            country: z
              .string()
              .trim()
              .length(2, "Country must be exactly 2 characters")
              .regex(new RE2("^[A-Z]{2}$"), "Country must be exactly 2 uppercase letters")
              .optional()
              .describe("Country (C) - Two uppercase letter country code (e.g., US, CA, GB)"),
            state: z
              .string()
              .trim()
              .min(1)
              .max(64, "State cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'State contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "State cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("State/Province (ST) - Maximum 64 characters, no special DN characters"),
            locality: z
              .string()
              .trim()
              .min(1)
              .max(64, "Locality cannot exceed 64 characters")
              .regex(
                new RE2('^[^,=+<>#;\\\\"/\\r\\n\\t]*$'),
                'Locality contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
              )
              .regex(
                new RE2("^[^\\\\s\\\\-_.]+.*[^\\\\s\\\\-_.]+$|^[^\\\\s\\\\-_.]{1}$"),
                "Locality cannot start or end with spaces, hyphens, underscores, or periods"
              )
              .optional()
              .describe("Locality (L) - Maximum 64 characters, no special DN characters"),
            emailAddress: z
              .string()
              .trim()
              .email("Email Address must be a valid email format")
              .min(6, "Email Address must be at least 6 characters")
              .max(64, "Email Address cannot exceed 64 characters")
              .optional()
              .describe("Email Address - Valid email format between 6 and 64 characters")
          })
          .optional()
          .describe("Additional subscriber properties and subject fields")
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.updateSubscriber({
        subscriberName: req.params.subscriberName,
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
            caId: subscriber.caId ?? undefined,
            name: subscriber.name,
            commonName: subscriber.commonName,
            ttl: subscriber.ttl ?? undefined,
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
    url: "/:subscriberName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Delete PKI Subscriber",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.DELETE.subscriberName)
      }),
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.DELETE.projectId)
      }),
      response: {
        200: sanitizedPkiSubscriber
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.deleteSubscriber({
        subscriberName: req.params.subscriberName,
        projectId: req.body.projectId,
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
            pkiSubscriberId: subscriber.id,
            name: subscriber.name
          }
        }
      });

      return subscriber;
    }
  });

  server.route({
    method: "POST",
    url: "/:subscriberName/order-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "orderPkiSubscriberCertificate",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Order certificate",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.ISSUE_CERT.subscriberName)
      }),
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.projectId)
      }),
      response: {
        200: z.object({
          message: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const subscriber = await server.services.pkiSubscriber.orderSubscriberCert({
        subscriberName: req.params.subscriberName,
        projectId: req.body.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.ISSUE_PKI_SUBSCRIBER_CERT,
          metadata: {
            subscriberId: subscriber.id,
            name: subscriber.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IssueCert,
        organizationId: req.permission.orgId,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          subscriberId: subscriber.id,
          commonName: subscriber.commonName,
          ...req.auditLogInfo
        }
      });

      return {
        message: "Successfully placed order for certificate"
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:subscriberName/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "issuePkiSubscriberCertificate",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Issue certificate",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.ISSUE_CERT.subscriberName)
      }),
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.projectId)
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
      const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber, subscriber } =
        await server.services.pkiSubscriber.issueSubscriberCert({
          subscriberName: req.params.subscriberName,
          projectId: req.body.projectId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.ISSUE_PKI_SUBSCRIBER_CERT,
          metadata: {
            subscriberId: subscriber.id,
            name: subscriber.name,
            serialNumber
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IssueCert,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          subscriberId: subscriber.id,
          commonName: subscriber.commonName,
          ...req.auditLogInfo
        }
      });

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        privateKey,
        serialNumber
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:subscriberName/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "signPkiSubscriberCertificate",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Sign certificate",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.SIGN_CERT.subscriberName)
      }),
      body: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.SIGN_CERT.projectId),
        csr: z.string().trim().min(1).max(3000).describe(PKI_SUBSCRIBERS.SIGN_CERT.csr)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(PKI_SUBSCRIBERS.SIGN_CERT.certificate),
          issuingCaCertificate: z.string().trim().describe(PKI_SUBSCRIBERS.SIGN_CERT.issuingCaCertificate),
          certificateChain: z.string().trim().describe(PKI_SUBSCRIBERS.SIGN_CERT.certificateChain),
          serialNumber: z.string().trim().describe(PKI_SUBSCRIBERS.ISSUE_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, serialNumber, subscriber } =
        await server.services.pkiSubscriber.signSubscriberCert({
          subscriberName: req.params.subscriberName,
          projectId: req.body.projectId,
          csr: req.body.csr,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: subscriber.projectId,
        event: {
          type: EventType.SIGN_PKI_SUBSCRIBER_CERT,
          metadata: {
            subscriberId: subscriber.id,
            name: subscriber.name,
            serialNumber
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SignCert,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          subscriberId: subscriber.id,
          commonName: subscriber.commonName,
          ...req.auditLogInfo
        }
      });

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        serialNumber
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:subscriberName/latest-certificate-bundle",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getPkiSubscriberLatestCertificateBundle",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "Get latest certificate bundle of a subscriber",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.subscriberName)
      }),
      querystring: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.projectId)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.certificate),
          certificateChain: z
            .string()
            .trim()
            .nullable()
            .describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.certificateChain),
          privateKey: z.string().trim().describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.privateKey),
          serialNumber: z.string().trim().describe(PKI_SUBSCRIBERS.GET_LATEST_CERT_BUNDLE.serialNumber)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const { certificate, certificateChain, serialNumber, cert, privateKey, subscriber } =
        await server.services.pkiSubscriber.getSubscriberActiveCertBundle({
          subscriberName: req.params.subscriberName,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_SUBSCRIBER_ACTIVE_CERT_BUNDLE,
          metadata: {
            subscriberId: subscriber.id,
            name: subscriber.name,
            certId: cert.id,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);

      return {
        certificate,
        certificateChain,
        serialNumber,
        privateKey
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:subscriberName/certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listPkiSubscriberCertificates",
      tags: [ApiDocsTags.PkiSubscribers],
      description: "List PKI Subscriber certificates",
      params: z.object({
        subscriberName: z.string().describe(PKI_SUBSCRIBERS.GET.subscriberName)
      }),
      querystring: z.object({
        projectId: z.string().trim().describe(PKI_SUBSCRIBERS.LIST_CERTS.projectId),
        offset: z.coerce.number().min(0).max(100).default(0).describe(PKI_SUBSCRIBERS.LIST_CERTS.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PKI_SUBSCRIBERS.LIST_CERTS.limit)
      }),
      response: {
        200: z.object({
          certificates: z.array(CertificatesSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { totalCount, certificates } = await server.services.pkiSubscriber.listSubscriberCerts({
        subscriberName: req.params.subscriberName,
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
          type: EventType.LIST_PKI_SUBSCRIBER_CERTS,
          metadata: {
            subscriberId: req.params.subscriberName,
            name: req.params.subscriberName,
            projectId: req.query.projectId
          }
        }
      });

      return {
        certificates,
        totalCount
      };
    }
  });
};
