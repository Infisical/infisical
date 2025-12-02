import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ACMESANType, CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";
import { validateCaDateField } from "@app/services/certificate-authority/certificate-authority-validators";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "@app/services/certificate-common/certificate-constants";
import { extractCertificateRequestFromCSR } from "@app/services/certificate-common/certificate-csr-utils";
import { mapEnumsForValidation } from "@app/services/certificate-common/certificate-utils";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

import { booleanSchema } from "../sanitizedSchemas";

interface CertificateRequestForService {
  commonName?: string;
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
  altNames?: Array<{
    type: CertSubjectAlternativeNameType;
    value: string;
  }>;
  validity: {
    ttl: string;
  };
  notBefore?: Date;
  notAfter?: Date;
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
}

const validateTtlAndDateFields = (data: { notBefore?: string; notAfter?: string; ttl?: string }) => {
  const hasDateFields = data.notBefore || data.notAfter;
  const hasTtl = data.ttl;
  return !(hasDateFields && hasTtl);
};

const validateDateOrder = (data: { notBefore?: string; notAfter?: string }) => {
  if (data.notBefore && data.notAfter) {
    const notBefore = new Date(data.notBefore);
    const notAfter = new Date(data.notAfter);
    return notBefore < notAfter;
  }
  return true;
};

export const registerCertificatesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      deprecated: true,
      tags: [ApiDocsTags.PkiCertificates],
      description: "This endpoint will be removed in a future version.",
      body: z
        .object({
          profileId: z.string().uuid(),
          commonName: validateTemplateRegexField.optional(),
          ttl: z
            .string()
            .trim()
            .min(1, "TTL cannot be empty")
            .refine((val) => ms(val) > 0, "TTL must be a positive number"),
          keyUsages: z.nativeEnum(CertKeyUsageType).array().optional(),
          extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsageType).array().optional(),
          notBefore: validateCaDateField.optional(),
          notAfter: validateCaDateField.optional(),
          altNames: z
            .array(
              z.object({
                type: z.nativeEnum(CertSubjectAlternativeNameType),
                value: z.string().min(1, "SAN value cannot be empty")
              })
            )
            .optional(),
          signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm),
          removeRootsFromChain: booleanSchema.default(false).optional()
        })
        .refine(validateTtlAndDateFields, {
          message:
            "Cannot specify both TTL and notBefore/notAfter. Use either TTL for duration-based validity or notBefore/notAfter for explicit date range."
        })
        .refine(validateDateOrder, {
          message: "notBefore must be earlier than notAfter"
        }),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          certificateChain: z.string().trim(),
          privateKey: z.string().trim().optional(),
          serialNumber: z.string().trim(),
          certificateId: z.string(),
          certificateRequestId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateRequestForService: CertificateRequestForService = {
        commonName: req.body.commonName,
        keyUsages: req.body.keyUsages,
        extendedKeyUsages: req.body.extendedKeyUsages,
        altNames: req.body.altNames,
        validity: {
          ttl: req.body.ttl
        },
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        signatureAlgorithm: req.body.signatureAlgorithm,
        keyAlgorithm: req.body.keyAlgorithm
      };

      const mappedCertificateRequest = mapEnumsForValidation(certificateRequestForService);

      const data = await server.services.certificateV3.issueCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId,
        certificateRequest: mappedCertificateRequest,
        removeRootsFromChain: req.body.removeRootsFromChain
      });

      const certificateRequest = await server.services.certificateRequest.createCertificateRequest({
        status: CertificateRequestStatus.ISSUED,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: data.projectId,
        profileId: req.body.profileId,
        commonName: req.body.commonName,
        altNames: req.body.altNames?.map((altName) => `${altName.type}:${altName.value}`).join(","),
        keyUsages: req.body.keyUsages,
        extendedKeyUsages: req.body.extendedKeyUsages,
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        keyAlgorithm: req.body.keyAlgorithm,
        signatureAlgorithm: req.body.signatureAlgorithm
      });

      await server.services.certificateRequest.attachCertificateToRequest({
        certificateRequestId: certificateRequest.id,
        certificateId: data.certificateId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId,
            commonName: req.body.commonName || "",
            profileName: data.profileName
          }
        }
      });

      return {
        ...data,
        certificateRequestId: certificateRequest.id
      };
    }
  });

  server.route({
    method: "POST",
    url: "/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      deprecated: true,
      tags: [ApiDocsTags.PkiCertificates],
      description: "This endpoint will be removed in a future version.",
      body: z
        .object({
          profileId: z.string().uuid(),
          csr: z.string().trim().min(1, "CSR cannot be empty").max(4096, "CSR cannot exceed 4096 characters"),
          ttl: z
            .string()
            .trim()
            .min(1, "TTL cannot be empty")
            .refine((val) => ms(val) > 0, "TTL must be a positive number"),
          notBefore: validateCaDateField.optional(),
          notAfter: validateCaDateField.optional(),
          removeRootsFromChain: booleanSchema.default(false).optional()
        })
        .refine(validateTtlAndDateFields, {
          message:
            "Cannot specify both TTL and notBefore/notAfter. Use either TTL for duration-based validity or notBefore/notAfter for explicit date range."
        })
        .refine(validateDateOrder, {
          message: "notBefore must be earlier than notAfter"
        }),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          certificateChain: z.string().trim(),
          serialNumber: z.string().trim(),
          certificateId: z.string(),
          certificateRequestId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.certificateV3.signCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId,
        csr: req.body.csr,
        validity: {
          ttl: req.body.ttl
        },
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        enrollmentType: EnrollmentType.API,
        removeRootsFromChain: req.body.removeRootsFromChain
      });

      const certificateRequestData = extractCertificateRequestFromCSR(req.body.csr);

      const certificateRequest = await server.services.certificateRequest.createCertificateRequest({
        actor: req.permission.type,
        status: CertificateRequestStatus.ISSUED,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: data.projectId,
        profileId: req.body.profileId,
        csr: req.body.csr,
        commonName: certificateRequestData.commonName,
        altNames: certificateRequestData.subjectAlternativeNames?.map((san) => `${san.type}:${san.value}`).join(","),
        keyUsages: certificateRequestData.keyUsages,
        extendedKeyUsages: certificateRequestData.extendedKeyUsages,
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        keyAlgorithm: certificateRequestData.keyAlgorithm,
        signatureAlgorithm: certificateRequestData.signatureAlgorithm
      });

      await server.services.certificateRequest.attachCertificateToRequest({
        certificateRequestId: certificateRequest.id,
        certificateId: data.certificateId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.SIGN_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId,
            profileName: data.profileName,
            commonName: certificateRequestData.commonName || ""
          }
        }
      });

      return {
        ...data,
        certificateRequestId: certificateRequest.id
      };
    }
  });

  server.route({
    method: "POST",
    url: "/order-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      deprecated: true,
      tags: [ApiDocsTags.PkiCertificates],
      description: "This endpoint will be removed in a future version.",
      body: z
        .object({
          profileId: z.string().uuid(),
          subjectAlternativeNames: z.array(
            z.object({
              type: z.nativeEnum(ACMESANType),
              value: z
                .string()
                .trim()
                .min(1, "SAN value cannot be empty")
                .max(255, "SAN value must be less than 255 characters")
            })
          ),
          ttl: z
            .string()
            .trim()
            .min(1, "TTL cannot be empty")
            .refine((val) => ms(val) > 0, "TTL must be a positive number"),
          keyUsages: z.nativeEnum(CertKeyUsageType).array().optional(),
          extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsageType).array().optional(),
          notBefore: validateCaDateField.optional(),
          notAfter: validateCaDateField.optional(),
          commonName: validateTemplateRegexField.optional(),
          signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm),
          removeRootsFromChain: booleanSchema.default(false).optional()
        })
        .refine(validateTtlAndDateFields, {
          message:
            "Cannot specify both TTL and notBefore/notAfter. Use either TTL for duration-based validity or notBefore/notAfter for explicit date range."
        })
        .refine(validateDateOrder, {
          message: "notBefore must be earlier than notAfter"
        }),
      response: {
        200: z.object({
          certificate: z.string().optional(),
          certificateRequestId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateOrderObject = {
        altNames: req.body.subjectAlternativeNames,
        validity: {
          ttl: req.body.ttl
        },
        commonName: req.body.commonName,
        keyUsages: req.body.keyUsages,
        extendedKeyUsages: req.body.extendedKeyUsages,
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        signatureAlgorithm: req.body.signatureAlgorithm,
        keyAlgorithm: req.body.keyAlgorithm
      };

      const data = await server.services.certificateV3.orderCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId,
        certificateOrder: certificateOrderObject,
        removeRootsFromChain: req.body.removeRootsFromChain
      });

      const certificateRequest = await server.services.certificateRequest.createCertificateRequest({
        status: CertificateRequestStatus.PENDING,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: data.projectId,
        profileId: req.body.profileId,
        commonName: req.body.commonName,
        altNames: req.body.subjectAlternativeNames?.map((san) => `${san.type}:${san.value}`).join(","),
        keyUsages: req.body.keyUsages,
        extendedKeyUsages: req.body.extendedKeyUsages,
        notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
        signatureAlgorithm: req.body.signatureAlgorithm,
        keyAlgorithm: req.body.keyAlgorithm
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.ORDER_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            profileName: data.profileName
          }
        }
      });

      return {
        ...data,
        certificateRequestId: certificateRequest.id
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:certificateId/renew",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        certificateId: z.string().uuid()
      }),
      body: z
        .object({
          removeRootsFromChain: booleanSchema.default(false).optional()
        })
        .optional(),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          certificateChain: z.string().trim(),
          privateKey: z.string().trim().optional(),
          serialNumber: z.string().trim(),
          certificateId: z.string(),
          certificateRequestId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const originalCertificate = await server.services.certificate.getCert({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.certificateId
      });
      if (!originalCertificate) {
        throw new NotFoundError({ message: "Original certificate not found" });
      }

      const data = await server.services.certificateV3.renewCertificate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        certificateId: req.params.certificateId,
        removeRootsFromChain: req.body?.removeRootsFromChain
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.RENEW_CERTIFICATE,
          metadata: {
            originalCertificateId: req.params.certificateId,
            newCertificateId: data.certificateId,
            profileName: data.profileName,
            commonName: data.commonName
          }
        }
      });

      return data;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:certificateId/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        certificateId: z.string().uuid()
      }),
      body: z
        .object({
          renewBeforeDays: z.number().int().min(1).max(30).optional(),
          enableAutoRenewal: z.boolean().optional()
        })
        .refine((data) => !(data.renewBeforeDays !== undefined && data.enableAutoRenewal === false), {
          message: "Cannot specify both renewBeforeDays and enableAutoRenewal=false"
        }),
      response: {
        200: z.object({
          message: z.string(),
          renewBeforeDays: z.number().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.body.enableAutoRenewal === false) {
        const data = await server.services.certificateV3.disableRenewalConfig({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          certificateId: req.params.certificateId
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.DISABLE_CERTIFICATE_RENEWAL_CONFIG,
            metadata: {
              certificateId: req.params.certificateId,
              commonName: data.commonName
            }
          }
        });

        return {
          message: "Auto-renewal disabled successfully"
        };
      }

      if (req.body.renewBeforeDays !== undefined) {
        const data = await server.services.certificateV3.updateRenewalConfig({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          certificateId: req.params.certificateId,
          renewBeforeDays: req.body.renewBeforeDays
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.UPDATE_CERTIFICATE_RENEWAL_CONFIG,
            metadata: {
              certificateId: req.params.certificateId,
              renewBeforeDays: req.body.renewBeforeDays.toString(),
              commonName: data.commonName
            }
          }
        });

        return {
          message: "Certificate configuration updated successfully",
          renewBeforeDays: data.renewBeforeDays
        };
      }

      return {
        message: "No configuration changes requested"
      };
    }
  });
};
