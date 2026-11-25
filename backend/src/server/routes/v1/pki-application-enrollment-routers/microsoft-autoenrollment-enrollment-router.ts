import { z } from "zod";

import { MicrosoftAutoenrollmentParamsSchema } from "@app/ee/routes/microsoft-autoenrollment/microsoft-autoenrollment-schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { MAX_KEYTAB_BYTES } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-fns";
import { ApiDocsTags, MICROSOFT_AUTOENROLLMENT } from "@app/lib/api-docs";
import { isValidSid } from "@app/lib/windows-sid/windows-sid-fns";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { MicrosoftAutoenrollmentStateSchema } from "@app/server/routes/v1/pki-application-schemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const MAX_ALLOWED_GROUPS = 50;
const MAX_SID_LENGTH = 184;

export const registerPkiApplicationMicrosoftAutoenrollmentEnrollmentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/microsoft-autoenrollment",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationMicrosoftAutoenrollmentEnrollment",
      description:
        "Turn on or update Microsoft Autoenrollment for a profile on an application. Computers pick up the change on their next policy refresh and keep the certificates they hold until they renew them.",
      tags: [ApiDocsTags.PkiApplications],
      params: MicrosoftAutoenrollmentParamsSchema,
      body: z.object({
        connectionId: z.string().uuid().optional().describe(MICROSOFT_AUTOENROLLMENT.SET.connectionId),
        allowedGroupSids: z
          .array(
            z
              .string()
              .trim()
              .max(MAX_SID_LENGTH)
              .refine(isValidSid, (sid) => ({
                message: `'${sid}' is not a valid security identifier. Write it as Active Directory shows it, such as S-1-5-21-1004336348-1177238915-682003330-513.`
              }))
          )
          .max(MAX_ALLOWED_GROUPS)
          .nullable()
          .optional()
          .describe(MICROSOFT_AUTOENROLLMENT.SET.allowedGroupSids),
        renewBeforeDays: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe(MICROSOFT_AUTOENROLLMENT.SET.renewBeforeDays),
        keytab: z
          .string()
          .min(1, "The keytab file is empty. Create the keytab again with ktpass and upload it.")
          .base64()
          .max(Math.ceil(MAX_KEYTAB_BYTES / 3) * 4, "The keytab file cannot be larger than 64 KB")
          .optional()
          .describe(MICROSOFT_AUTOENROLLMENT.SET.keytab),
        reuseKeytab: z
          .object({
            profileId: z.string().uuid()
          })
          .optional()
          .describe(MICROSOFT_AUTOENROLLMENT.SET.reuseKeytab),
        allowAnyChannelBinding: z.boolean().optional().describe(MICROSOFT_AUTOENROLLMENT.SET.allowAnyChannelBinding)
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          applicationName: z.string(),
          profileId: z.string().uuid(),
          microsoftAutoenrollment: MicrosoftAutoenrollmentStateSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setMicrosoftAutoenrollmentEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actorRootOrgId: req.permission.rootOrgId,
        actorParentOrgId: req.permission.parentOrgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: req.body
      });
      const response = {
        applicationId: result.applicationId,
        applicationName: result.applicationName,
        profileId: result.profileId,
        microsoftAutoenrollment: result.microsoftAutoenrollment
      };
      if (!result.isChanged) return response;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            applicationName: result.applicationName,
            profileId: req.params.profileId,
            profileName: result.profileName,
            servicePrincipalName: result.microsoftAutoenrollment.servicePrincipalName,
            keyVersion: result.microsoftAutoenrollment.keyVersion,
            connectionId: result.microsoftAutoenrollment.connectionId,
            connectionName: result.connectionName,
            allowedGroups: result.microsoftAutoenrollment.allowedGroups,
            renewBeforeDays: result.microsoftAutoenrollment.renewBeforeDays,
            allowAnyChannelBinding: result.microsoftAutoenrollment.allowAnyChannelBinding,
            keytabSource: result.keytabSource,
            ...(result.reusedFromProfileId && {
              reusedFromProfileId: result.reusedFromProfileId,
              reusedFromProfileName: result.reusedFromProfileName
            })
          }
        }
      });
      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.EnrollmentMethodConfigured,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: req.internalCertManagerProjectId,
          enrollmentMethod: EnrollmentType.MICROSOFT_AUTOENROLLMENT
        }
      });

      return response;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/microsoft-autoenrollment",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationMicrosoftAutoenrollmentEnrollment",
      description: "Turn off Microsoft Autoenrollment for a profile on an application and delete its stored keytab.",
      tags: [ApiDocsTags.PkiApplications],
      params: MicrosoftAutoenrollmentParamsSchema,
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearMicrosoftAutoenrollmentEnrollment({
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
          type: EventType.CLEAR_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            applicationName: result.applicationName,
            profileId: req.params.profileId,
            profileName: result.profileName
          }
        }
      });
      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.EnrollmentMethodRemoved,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: req.internalCertManagerProjectId,
          enrollmentMethod: EnrollmentType.MICROSOFT_AUTOENROLLMENT
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles/:profileId/enrollment/microsoft-autoenrollment/reenroll",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "reenrollPkiApplicationMicrosoftAutoenrollmentComputers",
      description:
        "Make every computer that holds a certificate from this profile request a new one on its next autoenrollment run.",
      tags: [ApiDocsTags.PkiApplications],
      params: MicrosoftAutoenrollmentParamsSchema,
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          templateMajorRevision: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.reenrollMicrosoftAutoenrollmentComputers({
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
          type: EventType.REENROLL_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_COMPUTERS,
          metadata: {
            applicationId: req.params.applicationId,
            applicationName: result.applicationName,
            profileId: req.params.profileId,
            profileName: result.profileName,
            templateMajorRevision: result.templateMajorRevision
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:applicationId/profiles/:profileId/enrollment/microsoft-autoenrollment/service-principal",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplicationMicrosoftAutoenrollmentServicePrincipal",
      description:
        "Get the Kerberos service principal the keytab must be created for. Its host is the instance URL's host after following CNAME records, because Windows asks for a ticket for the final name.",
      tags: [ApiDocsTags.PkiApplications],
      params: MicrosoftAutoenrollmentParamsSchema,
      response: {
        200: z.object({ servicePrincipalName: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.pkiApplicationEnrollment.getMicrosoftAutoenrollmentServicePrincipal({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      })
  });
};
