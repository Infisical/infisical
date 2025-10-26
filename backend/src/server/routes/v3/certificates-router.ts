import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  ACMESANType,
  CertificateOrderStatus,
  CertKeyAlgorithm,
  CertSignatureAlgorithm
} from "@app/services/certificate/certificate-types";
import { validateCaDateField } from "@app/services/certificate-authority/certificate-authority-validators";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "@app/services/certificate-common/certificate-constants";
import { mapEnumsForValidation } from "@app/services/certificate-common/certificate-utils";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
          signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional()
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
          certificateId: z.string()
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
        certificateRequest: mappedCertificateRequest
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

      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
          signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional()
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
          certificateId: z.string()
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
        signatureAlgorithm: req.body.signatureAlgorithm,
        keyAlgorithm: req.body.keyAlgorithm
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
            commonName: ""
          }
        }
      });

      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/order-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      body: z
        .object({
          profileId: z.string().uuid(),
          subjectAlternativeNames: z
            .array(
              z.object({
                type: z.nativeEnum(ACMESANType),
                value: z
                  .string()
                  .trim()
                  .min(1, "SAN value cannot be empty")
                  .max(255, "SAN value must be less than 255 characters")
              })
            )
            .min(1, "At least one subject alternative name must be provided"),
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
          signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional()
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
          orderId: z.string(),
          status: z.nativeEnum(CertificateOrderStatus),
          subjectAlternativeNames: z.array(
            z.object({
              type: z.nativeEnum(ACMESANType),
              value: z.string(),
              status: z.nativeEnum(CertificateOrderStatus)
            })
          ),
          authorizations: z.array(
            z.object({
              identifier: z.object({
                type: z.nativeEnum(ACMESANType),
                value: z.string()
              }),
              status: z.nativeEnum(CertificateOrderStatus),
              expires: z.string().optional(),
              challenges: z.array(
                z.object({
                  type: z.string(),
                  status: z.nativeEnum(CertificateOrderStatus),
                  url: z.string(),
                  token: z.string()
                })
              )
            })
          ),
          finalize: z.string(),
          certificate: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.certificateV3.orderCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId,
        certificateOrder: {
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
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.ORDER_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            orderId: data.orderId,
            profileName: data.profileName
          }
        }
      });

      return data;
    }
  });
};
