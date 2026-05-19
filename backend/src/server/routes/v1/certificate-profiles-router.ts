import RE2 from "re2";
import { z } from "zod";

import { PkiCertificateProfilesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertStatus } from "@app/services/certificate/certificate-types";
import {
  CertExtendedKeyUsageType,
  CertKeyAlgorithm,
  CertKeyUsageType,
  CertSignatureAlgorithm
} from "@app/services/certificate-common/certificate-constants";
import { ExternalConfigUnionSchema } from "@app/services/certificate-profile/certificate-profile-external-config-schemas";
import { EnrollmentType, IssuerType } from "@app/services/certificate-profile/certificate-profile-types";

const CertificateProfileDefaultsResponseSchema = z
  .object({
    ttlDays: z.number().optional(),
    commonName: z.string().optional(),
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
    signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
    keyUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    extendedKeyUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    basicConstraints: z
      .object({
        isCA: z.boolean(),
        pathLength: z.number().optional()
      })
      .optional(),
    organization: z.string().optional(),
    organizationalUnit: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    locality: z.string().optional()
  })
  .nullish();

export const registerCertificateProfilesRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "createCertificateProfile" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      body: z
        .object({
          projectId: z.string().min(1).optional().describe(openApiHidden()),
          caId: z.string().uuid().optional(),
          certificatePolicyId: z.string().uuid(),
          slug: z
            .string()
            .min(1)
            .max(255)
            .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens"),
          description: z.string().max(1000).optional(),
          issuerType: z.nativeEnum(IssuerType).default(IssuerType.CA),
          externalConfigs: ExternalConfigUnionSchema,
          defaults: z
            .object({
              ttlDays: z.number().int().positive().optional(),
              commonName: z.string().optional(),
              keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
              signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
              keyUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
              extendedKeyUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
              basicConstraints: z
                .object({
                  isCA: z.boolean(),
                  pathLength: z.number().int().min(0).optional()
                })
                .optional(),
              organization: z.string().optional(),
              organizationalUnit: z.string().optional(),
              country: z.string().optional(),
              state: z.string().optional(),
              locality: z.string().optional()
            })
            .nullish()
        })
        .refine(
          (data) => {
            if (data.issuerType === IssuerType.CA) {
              return !!data.caId;
            }
            return true;
          },
          {
            message: "CA issuer type requires a CA ID"
          }
        )
        .refine(
          (data) => {
            if (data.issuerType === IssuerType.SELF_SIGNED) {
              return !data.caId;
            }
            return true;
          },
          {
            message: "Self-signed issuer type cannot have a CA ID"
          }
        ),
      response: {
        200: z.object({
          certificateProfile: PkiCertificateProfilesSchema.extend({
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateProfile = await server.services.certificateProfile.createProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id,
            name: certificateProfile.slug,
            projectId: certificateProfile.projectId,
            issuerType: certificateProfile.issuerType
          }
        }
      });

      return { certificateProfile };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listCertificateProfiles" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional(),
        enrollmentType: z.nativeEnum(EnrollmentType).optional(),
        issuerType: z.nativeEnum(IssuerType).optional(),
        caId: z.string().uuid().optional(),
        applicationId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional().describe(openApiHidden())
      }),
      response: {
        200: z.object({
          certificateProfiles: PkiCertificateProfilesSchema.extend({
            certificateAuthority: z
              .object({
                id: z.string(),
                status: z.string(),
                name: z.string(),
                isExternal: z.boolean().optional(),
                externalType: z.string().nullable().optional()
              })
              .optional(),
            metrics: z
              .object({
                profileId: z.string(),
                totalCertificates: z.number(),
                activeCertificates: z.number(),
                expiredCertificates: z.number(),
                expiringCertificates: z.number(),
                revokedCertificates: z.number()
              })
              .optional(),
            estConfig: z
              .object({
                id: z.string(),
                disableBootstrapCaValidation: z.boolean(),
                passphrase: z.string().optional(),
                caChain: z.string().optional()
              })
              .optional(),
            apiConfig: z
              .object({
                id: z.string(),
                autoRenew: z.boolean(),
                renewBeforeDays: z.number().optional()
              })
              .optional(),
            acmeConfig: z
              .object({
                id: z.string(),
                directoryUrl: z.string(),
                skipDnsOwnershipVerification: z.boolean().optional(),
                skipEabBinding: z.boolean().optional()
              })
              .optional(),
            scepConfig: z
              .object({
                id: z.string(),
                scepEndpointUrl: z.string(),
                raCertificatePem: z.string(),
                raCertExpiresAt: z.date(),
                includeCaCertInResponse: z.boolean(),
                allowCertBasedRenewal: z.boolean(),
                challengeType: z.string(),
                challengeEndpointUrl: z.string().optional(),
                dynamicChallengeExpiryMinutes: z.number().optional(),
                dynamicChallengeMaxPending: z.number().optional()
              })
              .optional(),
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { profiles, totalCount } = await server.services.certificateProfile.listProfiles({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.internalCertManagerProjectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.LIST_CERTIFICATE_PROFILES,
          metadata: {
            projectId: req.internalCertManagerProjectId
          }
        }
      });

      return { certificateProfiles: profiles, totalCount };
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
      ...(enableOperationId ? { operationId: "getCertificateProfile" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificateProfile: PkiCertificateProfilesSchema.extend({
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          }).extend({
            certificateAuthority: z
              .object({
                id: z.string(),
                projectId: z.string(),
                status: z.string(),
                name: z.string(),
                isExternal: z.boolean().optional(),
                externalType: z.string().nullable().optional()
              })
              .optional(),
            certificatePolicy: z
              .object({
                id: z.string(),
                projectId: z.string(),
                name: z.string(),
                description: z.string().optional()
              })
              .optional(),
            estConfig: z
              .object({
                id: z.string(),
                disableBootstrapCaValidation: z.boolean(),
                passphrase: z.string(),
                caChain: z.string().optional()
              })
              .optional(),
            apiConfig: z
              .object({
                id: z.string(),
                autoRenew: z.boolean(),
                renewBeforeDays: z.number().optional()
              })
              .optional(),
            acmeConfig: z
              .object({
                id: z.string(),
                directoryUrl: z.string(),
                skipDnsOwnershipVerification: z.boolean().optional(),
                skipEabBinding: z.boolean().optional()
              })
              .optional(),
            scepConfig: z
              .object({
                id: z.string(),
                scepEndpointUrl: z.string(),
                raCertificatePem: z.string(),
                raCertExpiresAt: z.date(),
                includeCaCertInResponse: z.boolean(),
                allowCertBasedRenewal: z.boolean(),
                challengeType: z.string(),
                challengeEndpointUrl: z.string().optional(),
                dynamicChallengeExpiryMinutes: z.number().optional(),
                dynamicChallengeMaxPending: z.number().optional()
              })
              .optional(),
            externalConfigs: ExternalConfigUnionSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateProfile = await server.services.certificateProfile.getProfileByIdWithConfigs({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateProfile.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id,
            name: certificateProfile.slug
          }
        }
      });

      return { certificateProfile };
    }
  });

  server.route({
    method: "GET",
    url: "/slug/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "getCertificateProfileBySlug" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        slug: z.string().min(1)
      }),
      response: {
        200: z.object({
          certificateProfile: PkiCertificateProfilesSchema.extend({
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateProfile = await server.services.certificateProfile.getProfileBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        slug: req.params.slug
      });

      return { certificateProfile };
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
      ...(enableOperationId ? { operationId: "updateCertificateProfile" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        slug: z
          .string()
          .min(1)
          .max(255)
          .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens")
          .optional(),
        description: z.string().max(1000).nullable().optional(),
        issuerType: z.nativeEnum(IssuerType).optional(),
        externalConfigs: ExternalConfigUnionSchema,
        defaults: z
          .object({
            ttlDays: z.number().int().positive().optional(),
            commonName: z.string().optional(),
            keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
            signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
            keyUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
            extendedKeyUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
            basicConstraints: z
              .object({
                isCA: z.boolean(),
                pathLength: z.number().int().min(0).optional()
              })
              .optional(),
            organization: z.string().optional(),
            organizationalUnit: z.string().optional(),
            country: z.string().optional(),
            state: z.string().optional(),
            locality: z.string().optional()
          })
          .nullish()
      }),
      response: {
        200: z.object({
          certificateProfile: PkiCertificateProfilesSchema.extend({
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateProfile = await server.services.certificateProfile.updateProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateProfile.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id,
            name: certificateProfile.slug
          }
        }
      });

      return { certificateProfile };
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
      ...(enableOperationId ? { operationId: "deleteCertificateProfile" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificateProfile: PkiCertificateProfilesSchema.extend({
            externalConfigs: ExternalConfigUnionSchema,
            defaults: CertificateProfileDefaultsResponseSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateProfile = await server.services.certificateProfile.deleteProfile({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateProfile.projectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id,
            name: certificateProfile.slug
          }
        }
      });

      return { certificateProfile };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listCertificateProfileCertificates" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        status: z.nativeEnum(CertStatus).optional(),
        search: z.string().optional()
      }),
      response: {
        200: z.object({
          certificates: z.array(
            z.object({
              id: z.string(),
              serialNumber: z.string(),
              cn: z.string(),
              status: z.string(),
              notBefore: z.date(),
              notAfter: z.date(),
              revokedAt: z.date().nullable().optional(),
              createdAt: z.date()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificates = await server.services.certificateProfile.getProfileCertificates({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id,
        ...req.query
      });

      return { certificates };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/certificates/latest-active-bundle",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "getCertificateProfileLatestActiveBundle" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      description: "Get latest active certificate bundle for a profile",
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificate: z.string().nullable(),
          certificateChain: z.string().nullable(),
          privateKey: z.string().nullable(),
          serialNumber: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const response = await server.services.certificateProfile.getLatestActiveCertificateBundle({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id
      });

      if (!response) {
        return {
          certificate: null,
          certificateChain: null,
          privateKey: null,
          serialNumber: null
        };
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: response.certObj.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_PROFILE_LATEST_ACTIVE_BUNDLE,
          metadata: {
            certificateProfileId: response.profile.id,
            certificateId: response.certObj.id,
            commonName: response.certObj.commonName,
            profileName: response.profile.slug,
            serialNumber: response.certObj.serialNumber
          }
        }
      });

      return {
        certificate: response.certificate,
        certificateChain: response.certificateChain,
        privateKey: response.privateKey,
        serialNumber: response.certObj.serialNumber
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/acme/eab-secret/reveal",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "revealCertificateProfileAcmeEabSecret" } : {}),
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          eabKid: z.string(),
          eabSecret: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { eabKid, eabSecret } = await server.services.certificateProfile.revealAcmeEabSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        profileId: req.params.id
      });
      return { eabKid, eabSecret };
    }
  });
};
