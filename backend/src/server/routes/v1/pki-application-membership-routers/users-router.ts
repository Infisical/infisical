import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ApplicationMemberKind } from "@app/services/pki-application/pki-application-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApplicationIdParamsSchema } from "../pki-application-schemas";
import { ApplicationMemberSchema, RemoveResponseSchema, RoleBodySchema } from "./schemas";

const UserParamsSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string().uuid()
});

const AddUsersBodySchema = z
  .object({
    userIds: z.string().uuid().array().default([]),
    emails: z
      .string()
      .email()
      .array()
      .default([])
      .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
    role: z.string().min(1).default("operator")
  })
  .refine((val) => val.userIds.length + val.emails.length > 0, {
    message: "Provide at least one userId or email."
  });

const AddUsersResponseSchema = z.object({
  memberships: z.array(ApplicationMemberSchema),
  skipped: z.array(z.string()),
  unresolved: z.array(z.string())
});

export const registerPkiApplicationUserMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationUserMembers",
      description: "List user members of an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      response: { 200: z.object({ memberships: z.array(ApplicationMemberSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.pkiApplicationMembership.listMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.User
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.LIST_PKI_APPLICATION_MEMBERS,
          metadata: { applicationId: req.params.applicationId }
        }
      });

      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/users",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addPkiApplicationUserMembers",
      description:
        "Add user members to an application by userId, email, or username. Only users who are already members of the project can be added.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      body: AddUsersBodySchema,
      response: { 200: AddUsersResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { emails } = req.body;

      const result = await server.services.pkiApplicationMembership.addUserMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        applicationId: req.params.applicationId,
        userIds: req.body.userIds,
        emails,
        role: req.body.role
      });

      for (const m of result.memberships) {
        // eslint-disable-next-line no-await-in-loop
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId,
          event: {
            type: EventType.ADD_PKI_APPLICATION_MEMBER,
            metadata: {
              applicationId: m.applicationId,
              applicationName: m.applicationName,
              membershipId: m.membershipId,
              userId: m.actorUserId ?? undefined,
              userName: m.details?.email ?? m.details?.username ?? m.details?.name ?? undefined,
              role: m.role
            }
          }
        });

        // eslint-disable-next-line no-await-in-loop
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.PkiApplicationMemberAdded,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            applicationId: req.params.applicationId,
            orgId: req.permission.orgId,
            role: req.body.role
          }
        });
      }

      return result;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationUserMemberRole",
      description: "Update the role of a user member on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: UserParamsSchema,
      body: RoleBodySchema,
      response: { 200: z.object({ membership: ApplicationMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pkiApplicationMembership.updateMemberRole({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.User,
        memberId: req.params.userId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_APPLICATION_MEMBER_ROLE,
          metadata: {
            applicationId: membership.applicationId,
            applicationName: membership.applicationName,
            membershipId: membership.membershipId,
            userId: membership.actorUserId ?? undefined,
            userName:
              membership.details?.email ?? membership.details?.username ?? membership.details?.name ?? undefined,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removePkiApplicationUserMember",
      description: "Remove a user from an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: UserParamsSchema,
      response: { 200: RemoveResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationMembership.removeMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.User,
        memberId: req.params.userId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: result.applicationId,
            applicationName: result.applicationName,
            membershipId: result.membershipId,
            userId: result.actorUserId ?? undefined,
            userName: result.details?.email ?? result.details?.username ?? result.details?.name ?? undefined
          }
        }
      });

      return { membershipId: result.membershipId, applicationId: result.applicationId };
    }
  });
};
