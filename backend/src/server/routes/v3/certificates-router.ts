import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  validateAltNamesField,
  validateAndMapAltNameType,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

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
      body: z.object({
        profileId: z.string().uuid(),
        commonName: validateTemplateRegexField,
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        keyUsages: z.nativeEnum(CertKeyUsage).array().optional(),
        extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional(),
        notBefore: validateCaDateField.optional(),
        notAfter: validateCaDateField.optional(),
        altNames: validateAltNamesField.optional(),
        organization: z.string().optional(),
        organizationUnit: z.string().optional(),
        locality: z.string().optional(),
        state: z.string().optional(),
        country: z.string().length(2).optional(),
        email: z.string().email().optional(),
        streetAddress: z.string().optional(),
        postalCode: z.string().optional(),
        signatureAlgorithm: z.string().optional(),
        keyAlgorithm: z.string().optional()
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
      const data = await server.services.certificateV3.issueCertificateFromProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId,
        certificateRequest: {
          commonName: req.body.commonName,
          organization: req.body.organization,
          organizationUnit: req.body.organizationUnit,
          locality: req.body.locality,
          state: req.body.state,
          country: req.body.country,
          email: req.body.email,
          streetAddress: req.body.streetAddress,
          postalCode: req.body.postalCode,
          keyUsages: req.body.keyUsages,
          extendedKeyUsages: req.body.extendedKeyUsages,
          subjectAlternativeNames: req.body.altNames
            ? req.body.altNames
                .split(", ")
                .map((name) => name.trim())
                .map((name) => {
                  const mappedType = validateAndMapAltNameType(name);
                  if (!mappedType) return null;
                  const typeMapping = {
                    dns: "dns_name",
                    ip: "ip_address",
                    email: "email",
                    url: "uri"
                  } as const;
                  return {
                    type: typeMapping[mappedType.type] as "dns_name" | "ip_address" | "email" | "uri",
                    value: mappedType.value
                  };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null)
            : undefined,
          validity: {
            ttl: req.body.ttl
          },
          notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
          notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
          signatureAlgorithm: req.body.signatureAlgorithm,
          keyAlgorithm: req.body.keyAlgorithm
        }
      });

      const profile = await server.services.certificateProfile.getProfileById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: profile.projectId,
        event: {
          type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId,
            commonName: req.body.commonName || ""
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
      body: z.object({
        profileId: z.string().uuid(),
        csr: z.string().trim().min(1).max(4096),
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        notBefore: validateCaDateField.optional(),
        notAfter: validateCaDateField.optional()
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
        notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined
      });

      const profile = await server.services.certificateProfile.getProfileById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: profile.projectId,
        event: {
          type: EventType.SIGN_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            certificateId: data.certificateId
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
      body: z.object({
        profileId: z.string().uuid(),
        identifiers: z
          .array(
            z.object({
              type: z.enum(["dns", "ip"]),
              value: z.string()
            })
          )
          .min(1),
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        keyUsages: z.nativeEnum(CertKeyUsage).array().optional(),
        extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional(),
        notBefore: validateCaDateField.optional(),
        notAfter: validateCaDateField.optional(),
        commonName: validateTemplateRegexField.optional(),
        organization: z.string().optional(),
        organizationUnit: z.string().optional(),
        locality: z.string().optional(),
        state: z.string().optional(),
        country: z.string().length(2).optional(),
        email: z.string().email().optional(),
        streetAddress: z.string().optional(),
        postalCode: z.string().optional(),
        signatureAlgorithm: z.string().optional(),
        keyAlgorithm: z.string().optional()
      }),
      response: {
        200: z.object({
          orderId: z.string(),
          status: z.enum(["pending", "processing", "valid", "invalid"]),
          identifiers: z.array(
            z.object({
              type: z.enum(["dns", "ip"]),
              value: z.string(),
              status: z.enum(["pending", "processing", "valid", "invalid"])
            })
          ),
          authorizations: z.array(
            z.object({
              identifier: z.object({
                type: z.enum(["dns", "ip"]),
                value: z.string()
              }),
              status: z.enum(["pending", "processing", "valid", "invalid"]),
              expires: z.string().optional(),
              challenges: z.array(
                z.object({
                  type: z.string(),
                  status: z.enum(["pending", "processing", "valid", "invalid"]),
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
          identifiers: req.body.identifiers,
          validity: {
            ttl: req.body.ttl
          },
          commonName: req.body.commonName,
          organization: req.body.organization,
          organizationUnit: req.body.organizationUnit,
          locality: req.body.locality,
          state: req.body.state,
          country: req.body.country,
          email: req.body.email,
          streetAddress: req.body.streetAddress,
          postalCode: req.body.postalCode,
          keyUsages: req.body.keyUsages,
          extendedKeyUsages: req.body.extendedKeyUsages,
          notBefore: req.body.notBefore ? new Date(req.body.notBefore) : undefined,
          notAfter: req.body.notAfter ? new Date(req.body.notAfter) : undefined,
          signatureAlgorithm: req.body.signatureAlgorithm,
          keyAlgorithm: req.body.keyAlgorithm
        }
      });

      const profile = await server.services.certificateProfile.getProfileById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.body.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: profile.projectId,
        event: {
          type: EventType.ORDER_CERTIFICATE_FROM_PROFILE,
          metadata: {
            certificateProfileId: req.body.profileId,
            orderId: data.orderId,
            identifiers: req.body.identifiers.map((id) => `${id.type}:${id.value}`)
          }
        }
      });

      return data;
    }
  });
};
