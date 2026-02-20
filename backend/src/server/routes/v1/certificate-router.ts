/* eslint-disable @typescript-eslint/no-floating-promises */
import RE2 from "re2";
import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATES } from "@app/lib/api-docs";
import { NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm, CertSignatureAlgorithm, CrlReason } from "@app/services/certificate/certificate-types";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
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
import { TCertificateIssuanceResponse } from "@app/services/certificate-v3/certificate-v3-types";
import { ProjectFilterType } from "@app/services/project/project-types";

import { booleanSchema } from "../sanitizedSchemas";

type CertificateServiceResponse = TCertificateIssuanceResponse | Omit<TCertificateIssuanceResponse, "privateKey">;

const extractCertificateData = (
  data: CertificateServiceResponse
): {
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  privateKey: string | undefined;
  serialNumber: string;
  certificateId: string;
} => ({
  certificate: data.certificate ?? "",
  issuingCaCertificate: data.issuingCaCertificate ?? "",
  certificateChain: data.certificateChain ?? "",
  privateKey: "privateKey" in data ? data.privateKey : undefined,
  serialNumber: data.serialNumber ?? "",
  certificateId: data.certificateId ?? ""
});

interface CertificateRequestForService {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
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
  basicConstraints?: {
    isCA: boolean;
    pathLength?: number;
  };
}

const validateTtlAndDateFields = (data: {
  attributes?: { notBefore?: string; notAfter?: string; ttl?: string };
  notBefore?: string;
  notAfter?: string;
  ttl?: string;
}) => {
  if (data.attributes) {
    const hasDateFields = data.attributes.notBefore || data.attributes.notAfter;
    const hasTtl = data.attributes.ttl;
    return !(hasDateFields && hasTtl);
  }
  const hasDateFields = data.notBefore || data.notAfter;
  const hasTtl = data.ttl;
  return !(hasDateFields && hasTtl);
};

const validateDateOrder = (data: {
  attributes?: { notBefore?: string; notAfter?: string };
  notBefore?: string;
  notAfter?: string;
}) => {
  if (data.attributes?.notBefore && data.attributes?.notAfter) {
    const notBefore = new Date(data.attributes.notBefore);
    const notAfter = new Date(data.attributes.notAfter);
    return notBefore < notAfter;
  }
  if (data.notBefore && data.notAfter) {
    const notBefore = new Date(data.notBefore);
    const notAfter = new Date(data.notAfter);
    return notBefore < notAfter;
  }
  return true;
};

export const registerCertificateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      body: z
        .object({
          profileId: z.string().uuid(),
          csr: z
            .string()
            .trim()
            .min(1, "CSR cannot be empty")
            .max(4096, "CSR cannot exceed 4096 characters")
            .optional(),
          attributes: z
            .object({
              commonName: validateTemplateRegexField.nullish(),
              organization: validateTemplateRegexField.nullish(),
              organizationalUnit: validateTemplateRegexField.nullish(),
              country: validateTemplateRegexField.nullish(),
              state: validateTemplateRegexField.nullish(),
              locality: validateTemplateRegexField.nullish(),
              keyUsages: z.nativeEnum(CertKeyUsageType).array().optional(),
              extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsageType).array().optional(),
              altNames: z
                .array(
                  z.object({
                    type: z.nativeEnum(CertSubjectAlternativeNameType),
                    value: z.string().min(1, "SAN value cannot be empty")
                  })
                )
                .optional(),
              signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
              keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
              ttl: z
                .string()
                .trim()
                .refine((val) => !val || ms(val) > 0, "TTL must be a positive number")
                .optional(),
              notBefore: validateCaDateField.optional(),
              notAfter: validateCaDateField.optional(),
              basicConstraints: z
                .object({
                  isCA: z.boolean(),
                  pathLength: z.number().int().min(0).optional()
                })
                .optional()
            })
            .optional(),
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
          certificate: z
            .object({
              certificate: z.string().trim(),
              issuingCaCertificate: z.string().trim(),
              certificateChain: z.string().trim(),
              privateKey: z.string().trim().optional(),
              serialNumber: z.string().trim(),
              certificateId: z.string()
            })
            .nullable(),
          certificateRequestId: z.string(),
          status: z.nativeEnum(CertificateRequestStatus).optional(),
          message: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { csr, attributes, ...requestBody } = req.body;
      const profile = await server.services.certificateProfile.getProfileById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: requestBody.profileId
      });

      let useOrderFlow = false;
      if (profile?.caId) {
        const ca = await server.services.certificateAuthority.getCaById({
          caId: profile.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          isInternal: true
        });
        const caType = (ca?.externalCa?.type as CaType) ?? CaType.INTERNAL;
        useOrderFlow = caType !== CaType.INTERNAL;
      }

      if (useOrderFlow) {
        const certificateOrderObject = {
          altNames: attributes?.altNames || [],
          validity: { ttl: attributes?.ttl || "" },
          ...(attributes?.commonName !== undefined && { commonName: attributes.commonName ?? undefined }),
          keyUsages: attributes?.keyUsages,
          extendedKeyUsages: attributes?.extendedKeyUsages,
          notBefore: attributes?.notBefore ? new Date(attributes.notBefore) : undefined,
          notAfter: attributes?.notAfter ? new Date(attributes.notAfter) : undefined,
          signatureAlgorithm: attributes?.signatureAlgorithm,
          keyAlgorithm: attributes?.keyAlgorithm,
          csr,
          basicConstraints: attributes?.basicConstraints
        };

        const data = await server.services.certificateV3.orderCertificateFromProfile({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          profileId: requestBody.profileId,
          certificateOrder: certificateOrderObject,
          removeRootsFromChain: requestBody.removeRootsFromChain
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.ORDER_CERTIFICATE_FROM_PROFILE,
            metadata: {
              certificateProfileId: requestBody.profileId,
              profileName: data.profileName
            }
          }
        });

        return {
          certificate: null,
          certificateRequestId: data.certificateRequestId,
          status: data.status,
          message: data.message
        };
      }

      if (csr) {
        const extractedCsrData = extractCertificateRequestFromCSR(csr);

        const data = await server.services.certificateV3.signCertificateFromProfile({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          profileId: requestBody.profileId,
          csr,
          validity: { ttl: attributes?.ttl || "" },
          notBefore: attributes?.notBefore ? new Date(attributes.notBefore) : undefined,
          notAfter: attributes?.notAfter ? new Date(attributes.notAfter) : undefined,
          enrollmentType: EnrollmentType.API,
          removeRootsFromChain: requestBody.removeRootsFromChain,
          basicConstraints: attributes?.basicConstraints
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.SIGN_CERTIFICATE_FROM_PROFILE,
            metadata: {
              certificateProfileId: requestBody.profileId,
              certificateId: data.certificateId || "",
              profileName: data.profileName,
              commonName: extractedCsrData.commonName || ""
            }
          }
        });
        return {
          certificate: data.status === CertificateRequestStatus.ISSUED ? extractCertificateData(data) : null,
          certificateRequestId: data.certificateRequestId,
          status: data.status,
          message: data.message
        };
      }

      const certificateRequestForService: CertificateRequestForService = {
        keyUsages: attributes?.keyUsages,
        extendedKeyUsages: attributes?.extendedKeyUsages,
        altNames: attributes?.altNames,
        validity: { ttl: attributes?.ttl || "" },
        notBefore: attributes?.notBefore ? new Date(attributes.notBefore) : undefined,
        notAfter: attributes?.notAfter ? new Date(attributes.notAfter) : undefined,
        signatureAlgorithm: attributes?.signatureAlgorithm,
        keyAlgorithm: attributes?.keyAlgorithm,
        basicConstraints: attributes?.basicConstraints
      };

      // Only include subject fields when explicitly provided (null or string).
      // Omitting the key lets applyProfileDefaults use the profile default.
      // Sending null (converted to undefined here) signals "clear the default".
      const subjectFields = [
        "commonName",
        "organization",
        "organizationalUnit",
        "country",
        "state",
        "locality"
      ] as const;
      for (const field of subjectFields) {
        if (attributes?.[field] !== undefined) {
          certificateRequestForService[field] = attributes[field] ?? undefined;
        }
      }

      const mappedCertificateRequest = mapEnumsForValidation(certificateRequestForService);

      const data = await server.services.certificateV3.issueCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: requestBody.profileId,
        certificateRequest: mappedCertificateRequest,
        removeRootsFromChain: requestBody.removeRootsFromChain
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: requestBody.profileId,
            certificateId: data.certificateId || "",
            commonName: attributes?.commonName || "",
            profileName: data.profileName
          }
        }
      });
      return {
        certificate: data.status === CertificateRequestStatus.ISSUED ? extractCertificateData(data) : null,
        certificateRequestId: data.certificateRequestId,
        status: data.status,
        message: data.message
      };
    }
  });
  server.route({
    method: "GET",
    url: "/certificate-requests/:requestId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getCertificateRequest",
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        requestId: z.string().uuid()
      }),
      response: {
        200: z.object({
          status: z.nativeEnum(CertificateRequestStatus),
          certificate: z.string().nullable(),
          certificateId: z.string().nullable(),
          privateKey: z.string().nullable(),
          serialNumber: z.string().nullable(),
          errorMessage: z.string().nullable(),
          commonName: z.string().nullable().optional(),
          organization: z.string().nullable().optional(),
          organizationalUnit: z.string().nullable().optional(),
          country: z.string().nullable().optional(),
          state: z.string().nullable().optional(),
          locality: z.string().nullable().optional(),
          basicConstraints: z
            .object({
              isCA: z.boolean(),
              pathLength: z.number().optional()
            })
            .nullable()
            .optional(),
          createdAt: z.date(),
          updatedAt: z.date()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateRequest, projectId } = await server.services.certificateRequest.getCertificateFromRequest({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        certificateRequestId: req.params.requestId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_CERTIFICATE_REQUEST,
          metadata: {
            certificateRequestId: req.params.requestId
          }
        }
      });
      return certificateRequest;
    }
  });

  server.route({
    method: "GET",
    url: "/certificate-requests",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listCertificateRequests",
      tags: [ApiDocsTags.PkiCertificates],
      querystring: z.object({
        projectSlug: z.string().min(1).trim(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().trim().optional(),
        status: z.nativeEnum(CertificateRequestStatus).optional(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
        profileIds: z
          .string()
          .transform((val) => val.split(",").map((id) => id.trim()))
          .pipe(z.array(z.string().uuid()))
          .optional()
          .describe("Comma-separated list of profile IDs"),
        sortBy: z.string().trim().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional()
      }),
      response: {
        200: z.object({
          certificateRequests: z.array(
            z.object({
              id: z.string(),
              status: z.nativeEnum(CertificateRequestStatus),
              commonName: z.string().nullable(),
              altNames: z.string().nullable(),
              profileId: z.string().nullable(),
              profileName: z.string().nullable(),
              caId: z.string().nullable(),
              certificateId: z.string().nullable(),
              approvalRequestId: z.string().nullable(),
              errorMessage: z.string().nullable(),
              createdAt: z.date(),
              updatedAt: z.date(),
              certificate: z
                .object({
                  id: z.string(),
                  serialNumber: z.string(),
                  status: z.string()
                })
                .nullable()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.getAProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.query.projectSlug,
          orgId: req.permission.orgId
        }
      });

      const { certificateRequests, totalCount } = await server.services.certificateRequest.listCertificateRequests({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: project.id,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        status: req.query.status,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        profileIds: req.query.profileIds,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: project.id,
        event: {
          type: EventType.LIST_CERTIFICATE_REQUESTS,
          metadata: {
            offset: req.query.offset,
            limit: req.query.limit,
            search: req.query.search,
            status: req.query.status,
            count: certificateRequests.length,
            certificateRequestIds: certificateRequests.map((certReq) => certReq.id)
          }
        }
      });

      return {
        certificateRequests: certificateRequests.map((certReq) => ({
          ...certReq,
          profileId: certReq.profileId ?? null,
          caId: certReq.caId ?? null,
          certificateId: certReq.certificateId ?? null,
          approvalRequestId: certReq.approvalRequestId ?? null,
          commonName: certReq.commonName ?? null,
          altNames:
            (certReq.altNames as Array<{ type: string; value: string }> | null)?.map((san) => san.value).join(",") ??
            null,
          errorMessage: certReq.errorMessage ?? null,
          profileName: certReq.profileName ?? null
        })),
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "issueCertificate",
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
          certificate: z.string().trim().optional(),
          issuingCaCertificate: z.string().trim().optional(),
          certificateChain: z.string().trim().optional(),
          privateKey: z.string().trim().optional(),
          serialNumber: z.string().trim().optional(),
          certificateId: z.string().optional(),
          certificateRequestId: z.string(),
          status: z.nativeEnum(CertificateRequestStatus).optional(),
          message: z.string().optional()
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId || "",
            commonName: req.body.commonName || "",
            profileName: data.profileName
          }
        }
      });

      if (data.status === CertificateRequestStatus.PENDING_APPROVAL) {
        return {
          certificateRequestId: data.certificateRequestId,
          status: data.status,
          message: data.message
        };
      }

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
      hide: true,
      operationId: "signCertificate",
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
        200: z.union([
          z.object({
            certificate: z.string().trim(),
            issuingCaCertificate: z.string().trim(),
            certificateChain: z.string().trim(),
            serialNumber: z.string().trim(),
            certificateId: z.string(),
            certificateRequestId: z.string()
          }),
          z.object({
            status: z.nativeEnum(CertificateRequestStatus),
            certificateRequestId: z.string(),
            message: z.string().optional(),
            projectId: z.string(),
            profileName: z.string(),
            commonName: z.string().optional()
          })
        ])
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.SIGN_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId || "",
            profileName: data.profileName,
            commonName: certificateRequestData.commonName || ""
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
      hide: true,
      operationId: "orderCertificate",
      deprecated: true,
      tags: [ApiDocsTags.PkiCertificates],
      description: "This endpoint will be removed in a future version.",
      body: z
        .object({
          profileId: z.string().uuid(),
          subjectAlternativeNames: z.array(
            z.object({
              type: z.nativeEnum(CertSubjectAlternativeNameType),
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
        200: z.union([
          z.object({
            certificate: z.string().optional(),
            certificateRequestId: z.string(),
            projectId: z.string(),
            profileName: z.string()
          }),
          z.object({
            status: z.nativeEnum(CertificateRequestStatus),
            certificateRequestId: z.string(),
            message: z.string(),
            projectId: z.string(),
            profileName: z.string(),
            commonName: z.string().optional()
          })
        ])
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

      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/:id/renew",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "renewCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        id: z.string().uuid()
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
        id: req.params.id
      });
      if (!originalCertificate) {
        throw new NotFoundError({ message: "Original certificate not found" });
      }

      const data = await server.services.certificateV3.renewCertificate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        certificateId: req.params.id,
        removeRootsFromChain: req.body?.removeRootsFromChain
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: data.projectId,
        event: {
          type: EventType.RENEW_CERTIFICATE,
          metadata: {
            originalCertificateId: req.params.id,
            newCertificateId: data.certificateId || "",
            profileName: data.profileName,
            commonName: data.commonName || ""
          }
        }
      });

      return {
        certificate: data.certificate || "",
        issuingCaCertificate: data.issuingCaCertificate || "",
        certificateChain: data.certificateChain || "",
        privateKey: data.privateKey,
        serialNumber: data.serialNumber || "",
        certificateId: data.certificateId || "",
        certificateRequestId: data.certificateRequestId
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateCertificateRenewalConfig",
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        id: z.string().uuid()
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
          certificateId: req.params.id
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.DISABLE_CERTIFICATE_RENEWAL_CONFIG,
            metadata: {
              certificateId: req.params.id,
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
          certificateId: req.params.id,
          renewBeforeDays: req.body.renewBeforeDays
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: data.projectId,
          event: {
            type: EventType.UPDATE_CERTIFICATE_RENEWAL_CONFIG,
            metadata: {
              certificateId: req.params.id,
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

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.GET.id)
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema.extend({
            subject: z
              .object({
                commonName: z.string().optional(),
                organization: z.string().optional(),
                organizationalUnit: z.string().optional(),
                country: z.string().optional(),
                state: z.string().optional(),
                locality: z.string().optional()
              })
              .optional(),
            fingerprints: z
              .object({
                sha256: z.string(),
                sha1: z.string().optional()
              })
              .optional(),
            basicConstraints: z
              .object({
                isCA: z.boolean(),
                pathLength: z.number().optional()
              })
              .optional(),
            caName: z.string().nullable().optional(),
            caType: z.enum(["internal", "external"]).nullable().optional(),
            profileName: z.string().nullable().optional()
          })
        })
      }
    },
    handler: async (req) => {
      const { cert } = await server.services.certificate.getCert({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      return {
        certificate: cert
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/private-key",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getCertificatePrivateKey",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate private key",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.GET.id)
      }),
      response: {
        200: z.string().trim()
      }
    },
    handler: async (req, reply) => {
      const { cert, certPrivateKey } = await server.services.certificate.getCertPrivateKey({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_PRIVATE_KEY,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);

      return certPrivateKey;
    }
  });

  server.route({
    method: "GET",
    url: "/:id/bundle",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getCertificateBundle",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate bundle including the certificate, chain, and private key.",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.GET_CERT.id)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.GET_CERT.certificate),
          certificateChain: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.certificateChain),
          privateKey: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.privateKey),
          serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumberRes)
        })
      }
    },
    handler: async (req, reply) => {
      const { certificate, certificateChain, serialNumber, cert, privateKey } =
        await server.services.certificate.getCertBundle({
          id: req.params.id,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_BUNDLE,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
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
    method: "POST",
    url: "/import-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "importCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Import certificate",
      body: z.object({
        projectSlug: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.projectSlug),

        certificatePem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.certificatePem),
        privateKeyPem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.privateKeyPem),
        chainPem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.chainPem),

        friendlyName: z.string().trim().optional().describe(CERTIFICATES.IMPORT.friendlyName),
        pkiCollectionId: z.string().trim().optional().describe(CERTIFICATES.IMPORT.pkiCollectionId)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.IMPORT.certificate),
          certificateChain: z.string().trim().describe(CERTIFICATES.IMPORT.certificateChain),
          privateKey: z.string().trim().describe(CERTIFICATES.IMPORT.privateKey),
          serialNumber: z.string().trim().describe(CERTIFICATES.IMPORT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, privateKey, serialNumber, cert } =
        await server.services.certificate.importCert({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.IMPORT_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber
          }
        }
      });

      return {
        certificate,
        certificateChain,
        privateKey,
        serialNumber
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/revoke",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "revokeCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Revoke",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.REVOKE.id)
      }),
      body: z.object({
        revocationReason: z.nativeEnum(CrlReason).describe(CERTIFICATES.REVOKE.revocationReason)
      }),
      response: {
        200: z.object({
          message: z.string().trim(),
          serialNumber: z.string().trim().describe(CERTIFICATES.REVOKE.serialNumberRes),
          revokedAt: z.date().describe(CERTIFICATES.REVOKE.revokedAt)
        })
      }
    },
    handler: async (req) => {
      const { revokedAt, cert, ca } = await server.services.certificate.revokeCert({
        id: req.params.id,
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
          type: EventType.REVOKE_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      return {
        message: "Successfully revoked certificate",
        serialNumber: cert.serialNumber,
        revokedAt
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteCertificate",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Delete certificate",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.DELETE.id)
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema
        })
      }
    },
    handler: async (req) => {
      const { deletedCert } = await server.services.certificate.deleteCert({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: deletedCert.projectId,
        event: {
          type: EventType.DELETE_CERT,
          metadata: {
            certId: deletedCert.id,
            cn: deletedCert.commonName,
            serialNumber: deletedCert.serialNumber
          }
        }
      });

      return {
        certificate: deletedCert
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/certificate",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getCertificateBody",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate body of certificate",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.GET_CERT.id)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.GET_CERT.certificate),
          certificateChain: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumberRes)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, cert } = await server.services.certificate.getCertBody({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_BODY,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      return {
        certificate,
        certificateChain,
        serialNumber
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/pkcs12",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      operationId: "exportCertificatePkcs12",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Download certificate in PKCS12 format",
      params: z.object({
        id: z.string().trim().describe(CERTIFICATES.GET.id)
      }),
      body: z.object({
        password: z
          .string()
          .min(6, "Password must be at least 6 characters long")
          .describe("Password for the keystore (minimum 6 characters)"),
        alias: z.string().min(1, "Alias is required").describe("Alias for the certificate in the keystore")
      }),
      response: {
        200: z.any().describe("PKCS12 keystore as binary data")
      }
    },
    handler: async (req, reply) => {
      const { pkcs12Data, cert } = await server.services.certificate.getCertPkcs12({
        id: req.params.id,
        password: req.body.password,
        alias: req.body.alias,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.EXPORT_CERT_PKCS12,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);
      reply.header("Content-Type", "application/octet-stream");
      reply.header(
        "Content-Disposition",
        `attachment; filename="certificate-${cert.serialNumber?.replace(new RE2("[^\\w.-]", "g"), "_")}.p12"`
      );

      return pkcs12Data;
    }
  });
};
