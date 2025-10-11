import { z } from "zod";

import { CertificateProfilesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  createCertificateProfileSchema,
  deleteCertificateProfileSchema,
  listCertificateProfilesSchema,
  updateCertificateProfileSchema
} from "@app/services/certificate-profile/certificate-profile-schemas";

export const registerCertificateProfilesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateProfiles],
      body: createCertificateProfileSchema,
      response: {
        200: z.object({
          certificateProfile: CertificateProfilesSchema
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
        projectId: req.body.projectId,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id,
            name: certificateProfile.slug,
            projectId: certificateProfile.projectId,
            enrollmentType: certificateProfile.enrollmentType
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      querystring: listCertificateProfilesSchema.extend({
        includeMetrics: z.coerce.boolean().optional().default(false),
        expiringDays: z.coerce.number().min(1).max(365).optional().default(7)
      }),
      response: {
        200: z.object({
          certificateProfiles: CertificateProfilesSchema.extend({
            metrics: z
              .object({
                profileId: z.string(),
                totalCertificates: z.number(),
                activeCertificates: z.number(),
                expiredCertificates: z.number(),
                expiringCertificates: z.number(),
                revokedCertificates: z.number()
              })
              .optional()
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
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.LIST_CERTIFICATE_PROFILES,
          metadata: {
            projectId: req.query.projectId
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().min(1)
      }),
      querystring: z.object({
        includeMetrics: z.coerce.boolean().optional().default(false),
        expiringDays: z.coerce.number().min(1).max(365).optional().default(7)
      }),
      response: {
        200: z.object({
          certificateProfile: CertificateProfilesSchema.extend({
            certificateAuthority: z
              .object({
                id: z.string(),
                projectId: z.string(),
                status: z.string(),
                name: z.string()
              })
              .optional(),
            certificateTemplate: z
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
                hashedPassphrase: z.string(),
                encryptedCaChain: z.any()
              })
              .optional(),
            apiConfig: z
              .object({
                id: z.string(),
                autoRenew: z.boolean(),
                autoRenewDays: z.number().optional()
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
              .optional()
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

      let result = certificateProfile;

      if (req.query.includeMetrics) {
        const metrics = await server.services.certificateProfile.getProfileMetrics({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          profileId: req.params.id,
          expiringDays: req.query.expiringDays
        });
        result = { ...certificateProfile, metrics };
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateProfile.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_PROFILE,
          metadata: {
            certificateProfileId: certificateProfile.id
          }
        }
      });

      return { certificateProfile: result };
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        slug: z.string().min(1)
      }),
      querystring: z.object({
        projectId: z.string().min(1)
      }),
      response: {
        200: z.object({
          certificateProfile: CertificateProfilesSchema
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
        projectId: req.query.projectId,
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().min(1)
      }),
      body: updateCertificateProfileSchema,
      response: {
        200: z.object({
          certificateProfile: CertificateProfilesSchema
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: deleteCertificateProfileSchema,
      response: {
        200: z.object({
          certificateProfile: CertificateProfilesSchema
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
            certificateProfileId: certificateProfile.id
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
      tags: [ApiDocsTags.PkiCertificateProfiles],
      params: z.object({
        id: z.string().min(1)
      }),
      querystring: z.object({
        offset: z.number().min(0).default(0),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["active", "expired", "revoked"]).optional(),
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
};
