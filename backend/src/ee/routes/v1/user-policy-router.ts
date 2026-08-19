import { z } from "zod";

import { UserPoliciesSchema } from "@app/db/schemas";
import { AGENT_POLICY_TARGETS } from "@app/ee/services/agent-policy/agent-policy-templates";
import { policyRulesSchema } from "@app/ee/services/agent-policy/policy-rule-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const UserPolicyResponseSchema = UserPoliciesSchema.pick({
  id: true,
  projectId: true,
  name: true,
  target: true,
  createdAt: true,
  updatedAt: true
}).extend({
  users: z
    .object({
      userId: z.string(),
      username: z.string(),
      email: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable()
    })
    .array(),
  rules: z.object({ id: z.string(), hostPattern: z.string(), methods: z.string().array() }).array()
});

export const registerUserPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      description: "List the user policies in a project.",
      operationId: "listUserPolicies",
      querystring: z.object({ projectId: z.string().trim().min(1).max(64) }),
      response: {
        200: z.object({ userPolicies: UserPolicyResponseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const userPolicies = await server.services.userPolicy.list({ projectId: req.query.projectId }, req.permission);
      return { userPolicies };
    }
  });

  server.route({
    method: "GET",
    url: "/:policyId",
    config: { rateLimit: readLimit },
    schema: {
      description: "Get a user policy by ID.",
      operationId: "getUserPolicyById",
      params: z.object({ policyId: z.string().uuid() }),
      response: {
        200: z.object({ userPolicy: UserPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const userPolicy = await server.services.userPolicy.getById({ policyId: req.params.policyId }, req.permission);
      return { userPolicy };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Create a user policy.",
      operationId: "createUserPolicy",
      body: z.object({
        projectId: z.string().trim().min(1).max(64),
        name: slugSchema({ min: 1, max: 64, field: "name" }),
        target: z.enum(AGENT_POLICY_TARGETS as [string, ...string[]]),
        userIds: z.array(z.string().uuid()).min(1).max(200),
        rules: policyRulesSchema
      }),
      response: {
        200: z.object({ userPolicy: UserPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const userPolicy = await server.services.userPolicy.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.USER_POLICY_CREATE,
          metadata: { policyId: userPolicy.id, name: userPolicy.name, target: userPolicy.target }
        }
      });

      return { userPolicy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Update a user policy. The target is fixed at create time and cannot be changed.",
      operationId: "updateUserPolicy",
      params: z.object({ policyId: z.string().uuid() }),
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }).optional(),
        userIds: z.array(z.string().uuid()).min(1).max(200).optional(),
        rules: policyRulesSchema.optional()
      }),
      response: {
        200: z.object({ userPolicy: UserPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const userPolicy = await server.services.userPolicy.updateById(
        { policyId: req.params.policyId, ...req.body },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: userPolicy.projectId,
        event: {
          type: EventType.USER_POLICY_UPDATE,
          metadata: { policyId: userPolicy.id, name: userPolicy.name, target: userPolicy.target }
        }
      });

      return { userPolicy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Delete a user policy.",
      operationId: "deleteUserPolicy",
      params: z.object({ policyId: z.string().uuid() }),
      response: {
        200: z.object({
          userPolicy: UserPoliciesSchema.pick({ id: true, projectId: true, name: true, target: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const userPolicy = await server.services.userPolicy.deleteById({ policyId: req.params.policyId }, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: userPolicy.projectId,
        event: {
          type: EventType.USER_POLICY_DELETE,
          metadata: { policyId: userPolicy.id, name: userPolicy.name, target: userPolicy.target }
        }
      });

      return { userPolicy };
    }
  });
};
