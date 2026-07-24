import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

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
  raCertExpiresAt: z.date(),
  validationConnectionId: z.string().uuid().nullable(),
  signRaWithCa: z.boolean()
});

const EnrollmentStateSchema = z.object({
  applicationId: z.string().uuid(),
  profileId: z.string().uuid(),
  api: ApiEnrollmentSchema.nullable(),
  est: EstEnrollmentStateSchema.nullable(),
  acme: AcmeEnrollmentStateSchema.nullable(),
  scep: ScepEnrollmentStateSchema.nullable(),
  raCaSigningSupported: z.boolean(),
  caType: z.nativeEnum(CaType),
  estConfigured: z.boolean(),
  acmeConfigured: z.boolean(),
  scepConfigured: z.boolean()
});

export const registerPkiApplicationEnrollmentStateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/profiles/:profileId/enrollment",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplicationEnrollment",
      description: "Get the enrollment state for a profile on an application.",
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
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
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
};
