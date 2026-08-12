import { z } from "zod";

import { AgentPoliciesSchema } from "@app/db/schemas";
import {
  AGENT_POLICY_TARGETS,
  buildAgentPolicyCredentialSlots,
  buildAgentPolicyDefaultRules
} from "@app/ee/services/agent-policy/agent-policy-templates";
import { policyRulesSchema } from "@app/ee/services/agent-policy/policy-rule-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const credentialInputSchema = z.object({
  slotKey: z.string().trim().min(1).max(128).describe("Which credential of the target this secret fills."),
  environment: slugSchema({ max: 64, field: "environment" }).describe("Environment slug the secret lives in."),
  secretPath: z.string().trim().max(512).default("/").describe("Folder the secret lives in."),
  secretKey: z.string().trim().min(1).max(256).describe("Name of the secret to broker.")
});

const AgentPolicyResponseSchema = AgentPoliciesSchema.pick({
  id: true,
  projectId: true,
  name: true,
  target: true,
  createdAt: true,
  updatedAt: true
}).extend({
  agents: z.object({ identityId: z.string(), name: z.string() }).array(),
  rules: z.object({ id: z.string(), hostPattern: z.string(), methods: z.string().array() }).array(),
  credentials: z
    .object({
      id: z.string(),
      slotKey: z.string(),
      environment: z.string(),
      secretPath: z.string(),
      secretKey: z.string(),
      role: z.string(),
      headerName: z.string().nullable(),
      headerPrefix: z.string().nullable(),
      headerPurpose: z.string().nullable(),
      placeholderKey: z.string().nullable(),
      placeholderValue: z.string().nullable(),
      substitutionSurfaces: z.string().array()
    })
    .array()
});

export const registerAgentPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/targets",
    config: { rateLimit: readLimit },
    schema: {
      description: "List the targets an agent policy can use, with the credentials and rules each seeds.",
      operationId: "listAgentPolicyTargets",
      response: {
        200: z.object({
          targets: z
            .object({
              key: z.string(),
              credentials: z
                .object({
                  slotKey: z.string(),
                  label: z.string()
                })
                .array(),
              defaultRules: z.object({ hostPattern: z.string(), methods: z.string().array() }).array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async () => ({
      targets: AGENT_POLICY_TARGETS.map((key) => ({
        key,
        // Placeholder values are minted per policy at create time, so only the shape is exposed here.
        credentials: buildAgentPolicyCredentialSlots(key).map((slot) => ({
          slotKey: slot.slotKey,
          label: slot.label
        })),
        defaultRules: buildAgentPolicyDefaultRules(key)
      }))
    })
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      description: "List the agent policies in a project.",
      operationId: "listAgentPolicies",
      querystring: z.object({ projectId: z.string().trim().min(1).max(64) }),
      response: {
        200: z.object({ agentPolicies: AgentPolicyResponseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentPolicies = await server.services.agentPolicy.list({ projectId: req.query.projectId }, req.permission);
      return { agentPolicies };
    }
  });

  server.route({
    method: "GET",
    url: "/:policyId",
    config: { rateLimit: readLimit },
    schema: {
      description: "Get an agent policy by ID.",
      operationId: "getAgentPolicyById",
      params: z.object({ policyId: z.string().uuid() }),
      response: {
        200: z.object({ agentPolicy: AgentPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentPolicy = await server.services.agentPolicy.getById({ policyId: req.params.policyId }, req.permission);
      return { agentPolicy };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Create an agent policy.",
      operationId: "createAgentPolicy",
      body: z.object({
        projectId: z.string().trim().min(1).max(64),
        name: slugSchema({ min: 1, max: 64, field: "name" }),
        target: z.enum(AGENT_POLICY_TARGETS as [string, ...string[]]),
        identityIds: z.array(z.string().uuid()).min(1).max(100),
        credentials: z.array(credentialInputSchema).max(20).default([]),
        rules: policyRulesSchema
      }),
      response: {
        200: z.object({ agentPolicy: AgentPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentPolicy = await server.services.agentPolicy.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.AGENT_POLICY_CREATE,
          metadata: { policyId: agentPolicy.id, name: agentPolicy.name, target: agentPolicy.target }
        }
      });

      return { agentPolicy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Update an agent policy. The target is fixed at create time and cannot be changed.",
      operationId: "updateAgentPolicy",
      params: z.object({ policyId: z.string().uuid() }),
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }).optional(),
        identityIds: z.array(z.string().uuid()).min(1).max(100).optional(),
        credentials: z.array(credentialInputSchema).max(20).optional(),
        rules: policyRulesSchema.optional()
      }),
      response: {
        200: z.object({ agentPolicy: AgentPolicyResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentPolicy = await server.services.agentPolicy.updateById(
        { policyId: req.params.policyId, ...req.body },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: agentPolicy.projectId,
        event: {
          type: EventType.AGENT_POLICY_UPDATE,
          metadata: { policyId: agentPolicy.id, name: agentPolicy.name, target: agentPolicy.target }
        }
      });

      return { agentPolicy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Delete an agent policy.",
      operationId: "deleteAgentPolicy",
      params: z.object({ policyId: z.string().uuid() }),
      response: {
        200: z.object({
          agentPolicy: AgentPoliciesSchema.pick({ id: true, projectId: true, name: true, target: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentPolicy = await server.services.agentPolicy.deleteById(
        { policyId: req.params.policyId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: agentPolicy.projectId,
        event: {
          type: EventType.AGENT_POLICY_DELETE,
          metadata: { policyId: agentPolicy.id, name: agentPolicy.name, target: agentPolicy.target }
        }
      });

      return { agentPolicy };
    }
  });
};
