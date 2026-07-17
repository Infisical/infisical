import RE2 from "re2";
import { z } from "zod";

import { PkiCertificateProfilesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertStatus } from "@app/services/certificate/certificate-types";
import {
  CertExtendedKeyUsageType,
  CertKeyAlgorithm,
  CertKeyUsageType,
  CertSignatureAlgorithm,
  domainComponentSchema
} from "@app/services/certificate-common/certificate-constants";
import { ExternalConfigUnionSchema } from "@app/services/certificate-profile/certificate-profile-external-config-schemas";
import { EnrollmentType, IssuerType } from "@app/services/certificate-profile/certificate-profile-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

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
    locality: z.string().optional(),
    domainComponents: z.array(z.string()).optional()
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
          enrollmentType: z.nativeEnum(EnrollmentType).optional().describe(openApiHidden()),
          issuerType: z.nativeEnum(IssuerType).default(IssuerType.CA),
          estConfig: z
            .object({
              disableBootstrapCaValidation: z.boolean().default(false),
              passphrase: z.string().min(1),
              caChain: z.string().optional()
            })
            .optional()
            .describe(openApiHidden()),
          apiConfig: z
            .object({
              autoRenew: z.boolean().default(false),
              renewBeforeDays: z.number().min(1).max(30).optional()
            })
            .optional()
            .describe(openApiHidden()),
          acmeConfig: z
            .object({
              skipDnsOwnershipVerification: z.boolean().optional(),
              skipEabBinding: z.boolean().optional()
            })
            .optional()
            .describe(openApiHidden()),
          scepConfig: z
            .object({
              challengeType: z.nativeEnum(ScepChallengeType).default(ScepChallengeType.STATIC),
              challengePassword: z.string().optional(),
              includeCaCertInResponse: z.boolean().optional(),
              allowCertBasedRenewal: z.boolean().optional(),
              dynamicChallengeExpiryMinutes: z.number().int().min(1).max(1440).default(60),
              dynamicChallengeMaxPending: z.number().int().min(1).max(1000).default(100)
            })
            .optional()
            .describe(openApiHidden()),
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
              locality: z.string().optional(),
              domainComponents: z.array(domainComponentSchema).optional()
            })
            .nullish()
        })
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
              return !(data.acmeConfig.skipEabBinding && data.acmeConfig.skipDnsOwnershipVerification);
            }
            return true;
          },
          {
            message: "Cannot skip both External Account Binding (EAB) and DNS ownership verification at the same time."
          }
        )
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.EST) {
              return !data.apiConfig && !data.acmeConfig && !data.scepConfig;
            }
            return true;
          },
          {
            message: "EST enrollment type cannot have API, ACME, or SCEP configuration"
          }
        )
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.API) {
              return !data.estConfig && !data.acmeConfig && !data.scepConfig;
            }
            return true;
          },
          {
            message: "API enrollment type cannot have EST, ACME, or SCEP configuration"
          }
        )
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.ACME) {
              return !data.estConfig && !data.apiConfig && !data.scepConfig;
            }
            return true;
          },
          {
            message: "ACME enrollment type cannot have EST, API, or SCEP configuration"
          }
        )
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.SCEP && data.scepConfig) {
              // Static mode requires a challenge password with min 8 chars; dynamic mode does not
              if (data.scepConfig.challengeType === ScepChallengeType.DYNAMIC) return true;
              return !!data.scepConfig.challengePassword && data.scepConfig.challengePassword.length >= 8;
            }
            return true;
          },
          {
            message: "SCEP static challenge requires a challenge password with at least 8 characters"
          }
        )
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.SCEP) {
              return !data.estConfig && !data.apiConfig && !data.acmeConfig;
            }
            return true;
          },
          {
            message: "SCEP enrollment type cannot have EST, API, or ACME configuration"
          }
        )
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
        )
        .refine(
          (data) => {
            if (data.issuerType === IssuerType.SELF_SIGNED && data.enrollmentType !== undefined) {
              return data.enrollmentType === EnrollmentType.API;
            }
            return true;
          },
          {
            message: "Self-signed issuer type only supports API enrollment"
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
            enrollmentType: certificateProfile.enrollmentType,
            issuerType: certificateProfile.issuerType
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificateProfileCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          issuerType: certificateProfile.issuerType
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
      body: z
        .object({
          slug: z
            .string()
            .min(1)
            .max(255)
            .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens")
            .optional(),
          description: z.string().max(1000).nullable().optional(),
          enrollmentType: z.nativeEnum(EnrollmentType).optional().describe(openApiHidden()),
          issuerType: z.nativeEnum(IssuerType).optional(),
          estConfig: z
            .object({
              disableBootstrapCaValidation: z.boolean().default(false),
              passphrase: z.string().min(1).optional(),
              caChain: z.string().optional()
            })
            .optional()
            .describe(openApiHidden()),
          apiConfig: z
            .object({
              autoRenew: z.boolean().default(false),
              renewBeforeDays: z.number().min(1).max(30).optional()
            })
            .optional()
            .describe(openApiHidden()),
          acmeConfig: z
            .object({
              skipDnsOwnershipVerification: z.boolean().optional(),
              skipEabBinding: z.boolean().optional()
            })
            .optional()
            .describe(openApiHidden()),
          scepConfig: z
            .object({
              challengeType: z.nativeEnum(ScepChallengeType).optional(),
              challengePassword: z.string().optional(),
              includeCaCertInResponse: z.boolean().optional(),
              allowCertBasedRenewal: z.boolean().optional(),
              dynamicChallengeExpiryMinutes: z.number().int().min(1).max(1440).optional(),
              dynamicChallengeMaxPending: z.number().int().min(1).max(1000).optional()
            })
            .optional()
            .describe(openApiHidden()),
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
              locality: z.string().optional(),
              domainComponents: z.array(domainComponentSchema).optional()
            })
            .nullish()
        })
        .refine(
          (data) => {
            if (data.enrollmentType === EnrollmentType.EST) {
              if (data.apiConfig) {
                return false;
              }
            }
            if (data.enrollmentType === EnrollmentType.API) {
              if (data.estConfig) {
                return false;
              }
            }
            return true;
          },
          {
            message: "Cannot have EST config with API enrollment type or API config with EST enrollment type."
          }
        )
        .refine(
          (data) => {
            if (data.acmeConfig) {
              return !(data.acmeConfig.skipEabBinding && data.acmeConfig.skipDnsOwnershipVerification);
            }
            return true;
          },
          {
            message: "Cannot skip both External Account Binding (EAB) and DNS ownership verification at the same time."
          }
        )
        .refine(
          (data) => {
            if (data.scepConfig?.challengePassword) {
              if (data.scepConfig.challengeType === ScepChallengeType.DYNAMIC) return true;
              return data.scepConfig.challengePassword.length >= 8;
            }
            return true;
          },
          {
            message: "SCEP static challenge requires a challenge password with at least 8 characters"
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificateProfileDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId
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
