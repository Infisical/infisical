import { z } from "zod";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { auditActorFields } from "@app/ee/services/agent-vault/agent-vault-actor-name-fns";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamProductRole } from "@app/ee/services/pam/pam-enums";
import { unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { sanitizeEmail } from "@app/lib/validator";
import { inviteUserRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry, getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerInviteOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/signup",
    config: {
      rateLimit: smtpRateLimit()
    },
    method: "POST",
    schema: {
      operationId: "inviteUsersToOrganization",
      body: z.object({
        inviteeEmails: z
          .string()
          .trim()
          .email()
          .array()
          .max(100)
          .transform((val) => unique(val.map((el) => sanitizeEmail(el)))),
        organizationId: z.string().trim(),
        organizationRoleSlug: z.string().default(OrgMembershipRole.Member),
        // Signup-created projects the invitees get member access to.
        projectIds: z.string().trim().array().max(5).optional(),
        // Grants membership on the org's consolidated PAM project (PAM has no signup-created project).
        grantPamAccess: z.boolean().optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          completeInviteLinks: z
            .array(
              z.object({
                email: z.string(),
                link: z.string()
              })
            )
            .optional(),
          // Product-access grants are best-effort; present only when at least one grant failed.
          grantFailures: z
            .object({
              projectIds: z.string().array(),
              pamAccess: z.boolean()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const { signUpTokens: completeInviteLinks } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          usernames: req.body.inviteeEmails,
          roles: [{ isTemporary: false, role: req.body.organizationRoleSlug }]
        }
      });

      const projects = req.body.projectIds?.length
        ? await server.services.project.getProjectNamesByIds({
            orgId: req.permission.orgId,
            projectIds: req.body.projectIds
          })
        : undefined;
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.INVITE_ORG_MEMBERS,
          metadata: {
            inviteeEmails: req.body.inviteeEmails,
            organizationRoleSlug: req.body.organizationRoleSlug,
            projects
          }
        }
      });

      // Best-effort: the org invite already succeeded, so a product-side failure must not fail
      // the request. Failures are still reported back so the client can tell the inviter.
      const failedProjectIds: string[] = [];
      let pamAccessFailed = false;

      if (req.body.projectIds?.length) {
        // Agent Vault projects go through its own member service, as its Access Control page does, so invitees are
        // audited and metered as Agent Vault members.
        const agentVaultProjectIds = await server.services.agentVaultProjectResolver.filterAgentVaultProjectIds(
          req.permission.orgId,
          req.body.projectIds
        );

        for await (const projectId of req.body.projectIds) {
          try {
            if (agentVaultProjectIds.has(projectId)) {
              const { members } = await server.services.agentVaultMembership.addProductMembers({
                projectId,
                ctx: {
                  actorId: req.permission.id,
                  actor: req.permission.type,
                  actorOrgId: req.permission.orgId,
                  actorAuthMethod: req.permission.authMethod
                },
                userIds: [],
                groupIds: [],
                machineIdentityIds: [],
                emails: req.body.inviteeEmails,
                role: ProjectMembershipRole.Member
              });

              for await (const member of members) {
                await server.services.auditLog.createAuditLog({
                  ...req.auditLogInfo,
                  orgId: req.permission.orgId,
                  projectId,
                  event: {
                    type: EventType.AGENT_VAULT_MEMBER_ADD,
                    metadata: { ...auditActorFields(member), role: member.role }
                  }
                });
                emitAgentVaultTelemetry(server.services.telemetry, req, {
                  event: PostHogEventTypes.AgentVaultProductMemberAdded,
                  properties: { memberType: AgentVaultMemberType.User, role: member.role }
                });
              }
              // eslint-disable-next-line no-continue
              continue;
            }

            const { memberships } = await server.services.membershipUser.createMembership({
              permission: req.permission,
              scopeData: {
                scope: AccessScope.Project,
                orgId: req.permission.orgId,
                projectId
              },
              data: {
                usernames: req.body.inviteeEmails,
                roles: [{ isTemporary: false, role: ProjectMembershipRole.Member }]
              }
            });

            if (memberships.length) {
              await server.services.auditLog.createAuditLog({
                ...req.auditLogInfo,
                orgId: req.permission.orgId,
                projectId,
                event: {
                  type: EventType.ADD_BATCH_PROJECT_MEMBER,
                  metadata: {
                    members: memberships.map(({ actorUserId, id }) => ({
                      userId: actorUserId || "",
                      membershipId: id,
                      email: ""
                    }))
                  }
                }
              });
            }
          } catch (err) {
            logger.error(err, `Failed to grant invitees access to project [projectId=${projectId}]`);
            failedProjectIds.push(projectId);
          }
        }
      }

      // PAM must go through its product-membership service so role validation, metering,
      // and access-request cleanup apply.
      if (req.body.grantPamAccess) {
        try {
          const pamProjectId = await server.services.pamProjectResolver.resolve(req.permission.orgId);
          const { memberships } = await server.services.pamMembership.addProductUserMembers({
            projectId: pamProjectId,
            actorId: req.permission.id,
            actor: req.permission.type,
            actorOrgId: req.permission.orgId,
            actorAuthMethod: req.permission.authMethod,
            userIds: [],
            emails: req.body.inviteeEmails,
            role: PamProductRole.Member
          });

          for await (const membership of memberships) {
            await server.services.auditLog.createAuditLog({
              ...req.auditLogInfo,
              orgId: req.permission.orgId,
              projectId: pamProjectId,
              event: {
                type: EventType.PAM_PRODUCT_MEMBER_ADD,
                metadata: { userId: membership.userId, role: membership.role }
              }
            });
            void server.services.telemetry.sendPostHogEvents({
              event: PostHogEventTypes.PamProductMemberAdded,
              distinctId: getTelemetryDistinctId(req),
              organizationId: req.permission.orgId,
              properties: { orgId: req.permission.orgId }
            });
          }
        } catch (err) {
          logger.error(err, "Failed to grant invitees PAM access");
          pamAccessFailed = true;
        }
      }

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserOrgInvitation,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          inviteeEmails: req.body.inviteeEmails,
          organizationRoleSlug: req.body.organizationRoleSlug,
          ...req.auditLogInfo
        }
      });

      const hasGrantFailures = failedProjectIds.length > 0 || pamAccessFailed;
      return {
        completeInviteLinks,
        message: `Send an invite link to ${req.body.inviteeEmails.join(", ")}`,
        ...(hasGrantFailures
          ? {
              grantFailures: {
                projectIds: failedProjectIds,
                pamAccess: pamAccessFailed
              }
            }
          : {})
      };
    }
  });

  server.route({
    url: "/signup-resend",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) =>
          (req.body as { membershipId?: string })?.membershipId?.trim().substring(0, 100) || req.realIp
      })
    },
    method: "POST",
    schema: {
      operationId: "resendOrganizationMemberInvitation",
      body: z.object({
        membershipId: z.string()
      }),
      response: {
        200: z.object({
          signupToken: z
            .object({
              email: z.string(),
              link: z.string()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.org.resendOrgMemberInvitation({
        orgId: req.permission.orgId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        membershipId: req.body.membershipId
      });
    }
  });

  server.route({
    url: "/verify",
    method: "POST",
    config: {
      rateLimit: inviteUserRateLimit
    },
    schema: {
      operationId: "verifyUserToOrganization",
      body: z.object({
        email: z
          .string()
          .trim()
          .email()
          .refine((val) => val === val.toLowerCase(), "Email must be lowercase"),
        organizationId: z.string().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          token: z.string().optional(),
          organizationName: z.string().describe("Name of the organization associated with the verified invitation")
        })
      }
    },
    handler: async (req) => {
      const { token, organizationName } = await server.services.org.verifyUserToOrg({
        orgId: req.body.organizationId,
        code: req.body.code,
        email: req.body.email
      });

      return {
        message: "Successfully verified email",
        token,
        organizationName
      };
    }
  });
};
