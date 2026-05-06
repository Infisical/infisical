import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ApiEnrollmentSchema = z.object({
  id: z.string().uuid(),
  autoRenew: z.boolean(),
  renewBeforeDays: z.number().int().nullable()
});

const EstEnrollmentStateSchema = z.object({
  id: z.string().uuid(),
  disableBootstrapCaValidation: z.boolean(),
  estEndpointUrl: z.string()
});

const AcmeEnrollmentStateSchema = z.object({
  id: z.string().uuid(),
  skipDnsOwnershipVerification: z.boolean(),
  skipEabBinding: z.boolean(),
  directoryUrl: z.string()
});

const ScepEnrollmentStateSchema = z.object({
  id: z.string().uuid(),
  challengeType: z.nativeEnum(ScepChallengeType),
  includeCaCertInResponse: z.boolean(),
  allowCertBasedRenewal: z.boolean(),
  dynamicChallengeExpiryMinutes: z.number().int().nullable(),
  dynamicChallengeMaxPending: z.number().int().nullable(),
  scepEndpointUrl: z.string(),
  challengeEndpointUrl: z.string().nullable(),
  raCertificatePem: z.string(),
  raCertExpiresAt: z.date()
});

const EnrollmentStateSchema = z.object({
  applicationId: z.string().uuid(),
  profileId: z.string().uuid(),
  api: ApiEnrollmentSchema.nullable(),
  est: EstEnrollmentStateSchema.nullable(),
  acme: AcmeEnrollmentStateSchema.nullable(),
  scep: ScepEnrollmentStateSchema.nullable(),
  estConfigured: z.boolean(),
  acmeConfigured: z.boolean(),
  scepConfigured: z.boolean()
});

export const registerPkiApplicationEnrollmentRoutes = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/profiles/:profileId/enrollment",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplicationEnrollment",
      description: "Get the enrollment state for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: { 200: EnrollmentStateSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.getEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.GET_PKI_APPLICATION_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/api",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationApiEnrollment",
      description: "Enable or update the API enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      body: z.object({
        autoRenew: z.boolean().default(false),
        renewBeforeDays: z.number().int().min(1).max(365).optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          api: ApiEnrollmentSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setApiEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          autoRenew: req.body.autoRenew,
          renewBeforeDays: req.body.renewBeforeDays
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_API_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            autoRenew: result.api.autoRenew,
            renewBeforeDays: result.api.renewBeforeDays
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/api",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationApiEnrollment",
      description: "Disable the API enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearApiEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.CLEAR_PKI_APPLICATION_API_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/est",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationEstEnrollment",
      description: "Enable or update the EST enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z.object({
        passphrase: z.string().min(8),
        disableBootstrapCaValidation: z.boolean().optional().default(false),
        caChain: z.string().optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          est: z.object({ id: z.string().uuid(), disableBootstrapCaValidation: z.boolean() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setEstEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          passphrase: req.body.passphrase,
          disableBootstrapCaValidation: req.body.disableBootstrapCaValidation,
          caChain: req.body.caChain
        }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_EST_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            disableBootstrapCaValidation: result.est.disableBootstrapCaValidation
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/est",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationEstEnrollment",
      description: "Disable the EST enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: {
        200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearEstEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.CLEAR_PKI_APPLICATION_EST_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/acme",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationAcmeEnrollment",
      description: "Enable or update the ACME enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z
        .object({
          skipDnsOwnershipVerification: z.boolean().optional().default(false),
          skipEabBinding: z.boolean().optional().default(false)
        })
        .refine((v) => !(v.skipDnsOwnershipVerification && v.skipEabBinding), {
          message: "skipDnsOwnershipVerification and skipEabBinding cannot both be enabled — pick at most one.",
          path: ["skipEabBinding"]
        }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          acme: z.object({
            id: z.string().uuid(),
            skipDnsOwnershipVerification: z.boolean(),
            skipEabBinding: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setAcmeEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          skipDnsOwnershipVerification: req.body.skipDnsOwnershipVerification,
          skipEabBinding: req.body.skipEabBinding
        }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_ACME_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            skipDnsOwnershipVerification: result.acme.skipDnsOwnershipVerification,
            skipEabBinding: result.acme.skipEabBinding
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/acme",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationAcmeEnrollment",
      description: "Disable the ACME enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearAcmeEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.CLEAR_PKI_APPLICATION_ACME_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles/:profileId/enrollment/acme/eab/reveal",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revealPkiApplicationAcmeEabSecret",
      description: "Reveal the ACME EAB secret for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          eabKid: z.string(),
          eabSecret: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.revealAcmeEabSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.REVEAL_PKI_APPLICATION_ACME_EAB_SECRET,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles/:profileId/enrollment/acme/eab/rotate",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "rotatePkiApplicationAcmeEabSecret",
      description: "Rotate the ACME EAB secret for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.rotateAcmeEabSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.ROTATE_PKI_APPLICATION_ACME_EAB_SECRET,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/scep",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationScepEnrollment",
      description: "Enable or update the SCEP enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z.object({
        challengeType: z.nativeEnum(ScepChallengeType).optional(),
        challengePassword: z.string().optional(),
        includeCaCertInResponse: z.boolean().optional().default(true),
        allowCertBasedRenewal: z.boolean().optional().default(true),
        dynamicChallengeExpiryMinutes: z.number().int().min(5).max(1440).optional(),
        dynamicChallengeMaxPending: z.number().int().min(1).max(1000).optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          scep: z.object({ id: z.string().uuid(), challengeType: z.nativeEnum(ScepChallengeType) })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setScepEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: req.body
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_SCEP_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            challengeType: result.scep.challengeType
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/scep",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationScepEnrollment",
      description: "Disable the SCEP enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearScepEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.CLEAR_PKI_APPLICATION_SCEP_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });
};
