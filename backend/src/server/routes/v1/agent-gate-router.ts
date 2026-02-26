import { z } from "zod";

import {
  AgentGateAuditLogsSchema,
  AgentGatePoliciesSchema,
  InboundPolicySchema,
  PolicyEvaluationResultSchema,
  SelfPoliciesSchema
} from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ActionContextSchema = z.object({
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  ticketId: z.string().optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  customerEmail: z.string().optional(),
  issueCategory: z.enum(["billing", "shipping", "product", "account", "other"]).optional(),
  issueSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
  customerLoyaltyStatus: z.enum(["standard", "silver", "gold", "platinum"]).optional(),
  daysSinceTicketCreated: z.number().optional(),
  refundAmount: z.number().optional(),
  hasEscalationApproval: z.boolean().optional(),
  escalationApprovalContext: z
    .object({
      approvedBy: z.string(),
      approvedAmount: z.number(),
      approvedAt: z.string()
    })
    .optional(),
  additionalContext: z.record(z.unknown()).optional()
});

const SkillInvocationRequestSchema = z.object({
  type: z.literal("skill"),
  skillId: z.string(),
  parameters: z.record(z.unknown())
});

const CommunicationRequestSchema = z.object({
  type: z.literal("communication"),
  messageType: z.string(),
  content: z.record(z.unknown())
});

const ActionRequestSchema = z.discriminatedUnion("type", [SkillInvocationRequestSchema, CommunicationRequestSchema]);

const PolicyEvaluationRequestSchema = z.object({
  requestingAgentId: z.string(),
  targetAgentId: z.string(),
  action: ActionRequestSchema,
  context: ActionContextSchema,
  agentReasoning: z.string().optional().describe("The reasoning provided by the agent for taking this action")
});

const PolicyEvaluationResponseSchema = PolicyEvaluationResultSchema.extend({
  auditLogId: z.string().uuid().describe("The ID of the audit log entry. Use this to track execution status.")
});

export const registerAgentGateRouter = async (server: FastifyZodProvider) => {
  // Policy Evaluation - Core endpoint (now returns auditLogId for execution tracking)
  server.route({
    method: "POST",
    url: "/evaluate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description:
        "Evaluate a policy for an agent action. Returns auditLogId which can be used to track execution status.",
      body: PolicyEvaluationRequestSchema,
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: PolicyEvaluationResponseSchema
      }
    },
    handler: async (req) => {
      const result = await server.services.agentGate.evaluatePolicy({
        projectId: req.query.projectId,
        request: req.body
      });
      return result;
    }
  });

  // Execution Tracking - Start (marks audit log as execution started)
  server.route({
    method: "POST",
    url: "/audit/:auditLogId/start",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Mark an audit log entry as execution started",
      params: z.object({
        auditLogId: z.string().uuid()
      }),
      response: {
        200: AgentGateAuditLogsSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.startExecution(req.params.auditLogId);
    }
  });

  // Execution Tracking - Complete (marks audit log as execution completed/failed)
  server.route({
    method: "POST",
    url: "/audit/:auditLogId/complete",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Mark an audit log entry as execution completed or failed",
      params: z.object({
        auditLogId: z.string().uuid()
      }),
      body: z.object({
        status: z.enum(["completed", "failed"]),
        result: z.record(z.unknown()).optional(),
        error: z.string().optional()
      }),
      response: {
        200: AgentGateAuditLogsSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.completeExecution(req.params.auditLogId, req.body);
    }
  });

  // Agent Registration
  server.route({
    method: "POST",
    url: "/agents/register",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Register an agent and get its effective permissions",
      body: z.object({
        agentId: z.string(),
        declaredSkills: z.array(z.string())
      }),
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          effectivePermissions: z.array(z.string())
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.agentGate.registerAgent({
        projectId: req.query.projectId,
        registration: req.body
      });
      return result;
    }
  });

  // Get Agent Policy
  server.route({
    method: "GET",
    url: "/agents/:agentId/policy",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get the policy for a specific agent",
      params: z.object({
        agentId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: AgentGatePoliciesSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.getPolicy(req.query.projectId, req.params.agentId);
    }
  });

  // Update Agent Policy
  server.route({
    method: "PUT",
    url: "/agents/:agentId/policy",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update the policy for a specific agent",
      params: z.object({
        agentId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      body: z.object({
        selfPolicies: SelfPoliciesSchema.optional(),
        inboundPolicies: z.array(InboundPolicySchema).optional()
      }),
      response: {
        200: AgentGatePoliciesSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.updatePolicy({
        projectId: req.query.projectId,
        agentId: req.params.agentId,
        ...req.body
      });
    }
  });

  // Create Agent Policy
  server.route({
    method: "POST",
    url: "/agents/:agentId/policy",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create a policy for a new agent",
      params: z.object({
        agentId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      body: z.object({
        selfPolicies: SelfPoliciesSchema,
        inboundPolicies: z.array(InboundPolicySchema)
      }),
      response: {
        200: AgentGatePoliciesSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.createPolicy({
        projectId: req.query.projectId,
        agentId: req.params.agentId,
        ...req.body
      });
    }
  });

  // Delete Agent Policy
  server.route({
    method: "DELETE",
    url: "/agents/:agentId/policy",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete the policy for a specific agent",
      params: z.object({
        agentId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: AgentGatePoliciesSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.deletePolicy(req.query.projectId, req.params.agentId);
    }
  });

  // List All Policies
  server.route({
    method: "GET",
    url: "/policies",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "List all agent policies in the project",
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: z.object({
          policies: z.array(AgentGatePoliciesSchema)
        })
      }
    },
    handler: async (req) => {
      const policies = await server.services.agentGate.listPolicies(req.query.projectId);
      return { policies };
    }
  });

  // Create Audit Log (manual creation, separate from evaluate)
  server.route({
    method: "POST",
    url: "/audit",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create an audit log entry manually",
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      body: z.object({
        sessionId: z.string().optional(),
        timestamp: z.string(),
        requestingAgentId: z.string(),
        targetAgentId: z.string(),
        actionType: z.enum(["skill", "communication"]),
        action: z.string(),
        result: z.enum(["allowed", "denied"]),
        policyEvaluations: z.array(PolicyEvaluationResultSchema),
        context: ActionContextSchema.optional(),
        agentReasoning: z.string().optional().describe("The reasoning provided by the agent for taking this action")
      }),
      response: {
        200: AgentGateAuditLogsSchema
      }
    },
    handler: async (req) => {
      return server.services.agentGate.createAuditLog(req.query.projectId, req.body);
    }
  });

  // Query Audit Logs
  server.route({
    method: "GET",
    url: "/audit",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Query audit logs with filters",
      querystring: z.object({
        projectId: z.string().describe("The project ID"),
        sessionId: z.string().optional().describe("Filter by session ID to get all events in a workflow"),
        agentId: z.string().optional(),
        action: z.string().optional(),
        result: z.enum(["allowed", "denied"]).optional(),
        executionStatus: z
          .enum(["pending", "started", "completed", "failed"])
          .optional()
          .describe("Filter by execution completion status"),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        limit: z.coerce.number().optional().default(100),
        offset: z.coerce.number().optional().default(0)
      }),
      response: {
        200: z.object({
          logs: z.array(AgentGateAuditLogsSchema)
        })
      }
    },
    handler: async (req) => {
      const { projectId, sessionId, agentId, action, result, executionStatus, startTime, endTime, limit, offset } =
        req.query;
      const logs = await server.services.agentGate.queryAuditLogs({
        projectId,
        filters: {
          sessionId,
          agentId,
          action,
          result,
          executionStatus,
          startTime,
          endTime
        },
        limit,
        offset
      });
      return { logs };
    }
  });

  // Seed demo policies endpoint (for hackathon demo)
  server.route({
    method: "POST",
    url: "/seed-demo",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Seed demo policies for the customer support scenario (no body required)",
      querystring: z.object({
        projectId: z.string().describe("The project ID")
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          agentsCreated: z.array(z.string())
        })
      }
    },
    handler: async (req) => {
      const { projectId } = req.query;

      const demoPolicies = [
        {
          agentId: "triage_agent",
          selfPolicies: {
            allowedActions: ["classify_ticket", "assess_severity", "route_ticket"],
            promptPolicies: []
          },
          inboundPolicies: []
        },
        {
          agentId: "support_agent",
          selfPolicies: {
            allowedActions: [
              "lookup_order_history",
              "check_inventory",
              "issue_refund",
              "access_payment_info",
              "compose_response",
              "send_customer_email",
              "request_escalation"
            ],
            promptPolicies: [
              {
                id: "refund_context_check",
                description: "Contextual refund approval",
                prompt:
                  "Allow refunds up to $50 automatically. Over $50: allow if customer waited 7+ days OR wrong-item issue with Gold/Platinum status OR has escalation approval. Otherwise deny and require escalation.",
                onActions: ["issue_refund"],
                enforce: "llm" as const
              },
              {
                id: "payment_data_access",
                description: "Payment info access control",
                prompt:
                  "Only allow access to payment information for high-severity billing disputes. Deny for other issue types.",
                onActions: ["access_payment_info"],
                enforce: "llm" as const
              },
              {
                id: "customer_email_quality",
                description: "Email quality check",
                prompt:
                  "Verify email has professional tone, complete information, and no unverified claims before sending.",
                onActions: ["send_customer_email"],
                enforce: "llm" as const
              }
            ]
          },
          inboundPolicies: [
            {
              fromAgentId: "triage_agent",
              allowedToRequest: ["*"],
              promptPolicies: []
            },
            {
              fromAgentId: "escalation_agent",
              allowedToRequest: ["*"],
              promptPolicies: []
            },
            {
              fromAgentId: "fulfillment_agent",
              allowedToRequest: ["*"],
              promptPolicies: []
            }
          ]
        },
        {
          agentId: "fulfillment_agent",
          selfPolicies: {
            allowedActions: [
              "create_shipment",
              "process_return",
              "check_warehouse_inventory",
              "generate_shipping_label",
              "update_tracking"
            ],
            promptPolicies: []
          },
          inboundPolicies: [
            {
              fromAgentId: "support_agent",
              allowedToRequest: ["create_shipment", "process_return", "check_warehouse_inventory"],
              promptPolicies: []
            }
          ]
        },
        {
          agentId: "escalation_agent",
          selfPolicies: {
            allowedActions: ["review_case", "approve_refund", "override_policy", "flag_for_human_review"],
            promptPolicies: []
          },
          inboundPolicies: [
            {
              fromAgentId: "support_agent",
              allowedToRequest: ["review_case", "approve_refund"],
              promptPolicies: []
            },
            {
              fromAgentId: "triage_agent",
              allowedToRequest: ["review_case"],
              promptPolicies: []
            }
          ]
        }
      ];

      for (const policy of demoPolicies) {
        await server.services.agentGate.createPolicy({
          projectId,
          agentId: policy.agentId,
          selfPolicies: policy.selfPolicies,
          inboundPolicies: policy.inboundPolicies
        });
      }

      return {
        success: true,
        agentsCreated: demoPolicies.map((p) => p.agentId)
      };
    }
  });
};
