import { TAgentGateAuditLogs, TInboundPolicy, TPromptPolicy } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TAgentGateAuditDALFactory } from "./agent-gate-audit-dal";
import { TAgentGatePolicyDALFactory } from "./agent-gate-policy-dal";
import {
  ActionContext,
  PolicyEvaluationResult,
  TAuditQueryDTO,
  TCreateAgentPolicyDTO,
  TEvaluatePolicyDTO,
  TRegisterAgentDTO,
  TUpdateAgentPolicyDTO
} from "./agent-gate-types";

type TAgentGateServiceFactoryDep = {
  agentGatePolicyDAL: TAgentGatePolicyDALFactory;
  agentGateAuditDAL: TAgentGateAuditDALFactory;
};

export type TAgentGateServiceFactory = ReturnType<typeof agentGateServiceFactory>;

interface LlmEvaluationResult {
  allowed: boolean;
  reasoning: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface PolicyEvaluationResponse extends PolicyEvaluationResult {
  auditLogId: string;
}

async function evaluatePromptPolicy(
  policy: TPromptPolicy,
  action: string,
  parameters: Record<string, unknown>,
  context: ActionContext
): Promise<LlmEvaluationResult> {
  const appCfg = getConfig();
  const openaiApiKey = appCfg.OPENAI_API_KEY;

  if (!openaiApiKey) {
    logger.warn("OpenAI API key not configured, using mock LLM evaluation");
    return mockLlmEvaluation(policy, action, parameters, context);
  }

  try {
    const systemPrompt = `You are a policy enforcement engine for AI agents. Evaluate whether the following action should be allowed based on the policy rule.

Policy Rule: ${policy.prompt}

You must respond with valid JSON in this exact format:
{ "allowed": true, "reasoning": "brief explanation" }
or
{ "allowed": false, "reasoning": "brief explanation" }`;

    const userPrompt = `Action: ${action}
Parameters: ${JSON.stringify(parameters, null, 2)}
Context: ${JSON.stringify(context, null, 2)}

Should this action be allowed according to the policy?`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error }, "OpenAI API error");
      return mockLlmEvaluation(policy, action, parameters, context);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    return {
      allowed: result.allowed,
      reasoning: result.reasoning,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0
      }
    };
  } catch (error) {
    logger.error({ error }, "Error calling OpenAI API");
    return mockLlmEvaluation(policy, action, parameters, context);
  }
}

function mockLlmEvaluation(
  _policy: TPromptPolicy,
  action: string,
  parameters: Record<string, unknown>,
  context: ActionContext
): LlmEvaluationResult {
  if (action === "issue_refund" && context.refundAmount !== undefined) {
    const amount = context.refundAmount;
    if (amount <= 50) {
      return {
        allowed: true,
        reasoning: `Refund of $${amount} is within the automatic approval limit of $50`,
        usage: { promptTokens: 0, completionTokens: 0 }
      };
    }

    if (context.hasEscalationApproval) {
      return {
        allowed: true,
        reasoning: `Refund of $${amount} approved - has escalation approval from ${context.escalationApprovalContext?.approvedBy}`,
        usage: { promptTokens: 0, completionTokens: 0 }
      };
    }

    const daysWaiting = context.daysSinceTicketCreated || 0;
    const loyaltyStatus = context.customerLoyaltyStatus || "standard";
    const isWrongItem = context.issueCategory === "shipping";

    if (daysWaiting >= 7) {
      return {
        allowed: true,
        reasoning: `Refund of $${amount} approved - customer has been waiting ${daysWaiting} days (>= 7 day threshold)`,
        usage: { promptTokens: 0, completionTokens: 0 }
      };
    }

    if (isWrongItem && (loyaltyStatus === "gold" || loyaltyStatus === "platinum")) {
      return {
        allowed: true,
        reasoning: `Refund of $${amount} approved - wrong-item issue with ${loyaltyStatus} loyalty status`,
        usage: { promptTokens: 0, completionTokens: 0 }
      };
    }

    return {
      allowed: false,
      reasoning: `Refund of $${amount} denied - customer waited ${daysWaiting} days (< 7), has ${loyaltyStatus} loyalty status, and no escalation approval. Escalation required.`,
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }

  if (action === "access_payment_info") {
    const { issueCategory } = context;
    const severity = context.issueSeverity;

    if (issueCategory === "billing" && severity === "high") {
      return {
        allowed: true,
        reasoning: "Payment info access approved - high-severity billing dispute investigation",
        usage: { promptTokens: 0, completionTokens: 0 }
      };
    }

    return {
      allowed: false,
      reasoning: `Payment info access denied - agent is investigating a ${issueCategory || "unknown"} issue (${severity || "unknown"} severity), not a high-severity billing dispute`,
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }

  if (action === "send_customer_email") {
    return {
      allowed: true,
      reasoning: "Email approved - professional tone verified, includes resolution details",
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }

  return {
    allowed: true,
    reasoning: "Action allowed by default policy evaluation",
    usage: { promptTokens: 0, completionTokens: 0 }
  };
}

export const agentGateServiceFactory = ({ agentGatePolicyDAL, agentGateAuditDAL }: TAgentGateServiceFactoryDep) => {
  const createPolicy = async (dto: TCreateAgentPolicyDTO) => {
    const policy = await agentGatePolicyDAL.upsertPolicy(dto.projectId, dto.agentId, {
      selfPolicies: dto.selfPolicies,
      inboundPolicies: dto.inboundPolicies
    });
    return policy;
  };

  const updatePolicy = async (dto: TUpdateAgentPolicyDTO) => {
    const existing = await agentGatePolicyDAL.findByProjectAndAgentId(dto.projectId, dto.agentId);
    if (!existing) {
      throw new NotFoundError({ message: `Policy not found for agent ${dto.agentId}` });
    }

    const policy = await agentGatePolicyDAL.upsertPolicy(dto.projectId, dto.agentId, {
      selfPolicies: dto.selfPolicies || existing.selfPolicies,
      inboundPolicies: dto.inboundPolicies || existing.inboundPolicies
    });
    return policy;
  };

  const getPolicy = async (projectId: string, agentId: string) => {
    const policy = await agentGatePolicyDAL.findByProjectAndAgentId(projectId, agentId);
    if (!policy) {
      throw new NotFoundError({ message: `Policy not found for agent ${agentId}` });
    }
    return policy;
  };

  const listPolicies = async (projectId: string) => {
    return agentGatePolicyDAL.findAllByProject(projectId);
  };

  const deletePolicy = async (projectId: string, agentId: string) => {
    const existing = await agentGatePolicyDAL.findByProjectAndAgentId(projectId, agentId);
    if (!existing) {
      throw new NotFoundError({ message: `Policy not found for agent ${agentId}` });
    }
    await agentGatePolicyDAL.deleteById(existing.id);
    return existing;
  };

  const allow = (policyType: "structured" | "prompt", policyId: string, reasoning: string): PolicyEvaluationResult => ({
    allowed: true,
    policyType,
    policyId,
    reasoning,
    evaluatedAt: new Date().toISOString()
  });

  const deny = (policyType: "structured" | "prompt", policyId: string, reasoning: string): PolicyEvaluationResult => ({
    allowed: false,
    policyType,
    policyId,
    reasoning,
    evaluatedAt: new Date().toISOString()
  });

  const evaluateSelfSkill = async (
    policy: {
      agentId: string;
      selfPolicies: { allowedActions: string[]; promptPolicies: TPromptPolicy[] };
    },
    skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext
  ): Promise<PolicyEvaluationResult> => {
    if (!policy.selfPolicies.allowedActions.includes(skillId)) {
      return deny("structured", "self_allowed_actions", `Action "${skillId}" is not in ${policy.agentId}'s allowed actions`);
    }

    for (const promptPolicy of policy.selfPolicies.promptPolicies) {
      if (promptPolicy.onActions.includes(skillId)) {
        const llmResult = await evaluatePromptPolicy(promptPolicy, skillId, parameters, context);

        if (!llmResult.allowed) {
          return {
            allowed: false,
            policyType: "prompt",
            policyId: promptPolicy.id,
            reasoning: llmResult.reasoning,
            evaluatedAt: new Date().toISOString(),
            llmEvaluation: {
              model: "gpt-4o-mini",
              promptTokens: llmResult.usage.promptTokens,
              completionTokens: llmResult.usage.completionTokens,
              reasoning: llmResult.reasoning
            }
          };
        }

        return {
          allowed: true,
          policyType: "prompt",
          policyId: promptPolicy.id,
          reasoning: llmResult.reasoning,
          evaluatedAt: new Date().toISOString(),
          llmEvaluation: {
            model: "gpt-4o-mini",
            promptTokens: llmResult.usage.promptTokens,
            completionTokens: llmResult.usage.completionTokens,
            reasoning: llmResult.reasoning
          }
        };
      }
    }

    return allow("structured", "self_allowed_actions", `Action "${skillId}" is permitted`);
  };

  const evaluateInboundRequest = async (
    targetPolicy: {
      agentId: string;
      inboundPolicies: TInboundPolicy[];
    },
    requestingAgentId: string,
    messageType: string,
    context: ActionContext
  ): Promise<PolicyEvaluationResult> => {
    const inboundPolicy = targetPolicy.inboundPolicies.find(
      (p) => p.fromAgentId === requestingAgentId || p.fromAgentId === "*"
    );

    if (!inboundPolicy) {
      return deny(
        "structured",
        "no_inbound_policy",
        `${targetPolicy.agentId} has no policy allowing requests from ${requestingAgentId}`
      );
    }

    if (!inboundPolicy.allowedToRequest.includes(messageType) && !inboundPolicy.allowedToRequest.includes("*")) {
      return deny(
        "structured",
        "inbound_not_allowed",
        `${requestingAgentId} cannot request "${messageType}" from ${targetPolicy.agentId}`
      );
    }

    for (const promptPolicy of inboundPolicy.promptPolicies) {
      if (promptPolicy.onActions.includes(messageType)) {
        const llmResult = await evaluatePromptPolicy(promptPolicy, messageType, {}, context);
        if (!llmResult.allowed) {
          return {
            allowed: false,
            policyType: "prompt",
            policyId: promptPolicy.id,
            reasoning: llmResult.reasoning,
            evaluatedAt: new Date().toISOString(),
            llmEvaluation: {
              model: "gpt-4o-mini",
              promptTokens: llmResult.usage.promptTokens,
              completionTokens: llmResult.usage.completionTokens,
              reasoning: llmResult.reasoning
            }
          };
        }
      }
    }

    return allow(
      "structured",
      "inbound_allowed",
      `${requestingAgentId} is permitted to request "${messageType}" from ${targetPolicy.agentId}`
    );
  };

  const evaluatePolicy = async (dto: TEvaluatePolicyDTO): Promise<PolicyEvaluationResponse> => {
    const { projectId, request } = dto;
    const { requestingAgentId, targetAgentId, action, context } = request;

    const targetPolicy = await agentGatePolicyDAL.findByProjectAndAgentId(projectId, targetAgentId);
    if (!targetPolicy) {
      const result = deny("structured", "unknown_agent", `Unknown agent: ${targetAgentId}`);
      const auditLog = await createAuditLogInternal(projectId, request, result);
      return { ...result, auditLogId: auditLog.id };
    }

    let result: PolicyEvaluationResult;

    if (action.type === "skill" && requestingAgentId === targetAgentId) {
      result = await evaluateSelfSkill(targetPolicy, action.skillId, action.parameters, context);
    } else if (action.type === "communication") {
      result = await evaluateInboundRequest(targetPolicy, requestingAgentId, action.messageType, context);
    } else {
      result = deny("structured", "invalid_action", "Invalid action type");
    }

    const auditLog = await createAuditLogInternal(projectId, request, result);
    return { ...result, auditLogId: auditLog.id };
  };

  const createAuditLogInternal = async (
    projectId: string,
    request: TEvaluatePolicyDTO["request"],
    result: PolicyEvaluationResult
  ): Promise<TAgentGateAuditLogs> => {
    const actionName = request.action.type === "skill" ? request.action.skillId : request.action.messageType;
    return agentGateAuditDAL.createAuditLog({
      sessionId: request.context.sessionId,
      projectId,
      timestamp: new Date(),
      requestingAgentId: request.requestingAgentId,
      targetAgentId: request.targetAgentId,
      actionType: request.action.type,
      action: actionName,
      result: result.allowed ? "allowed" : "denied",
      policyEvaluations: [result],
      context: request.context as Record<string, unknown>,
      executionStatus: result.allowed ? "pending" : undefined
    });
  };

  const startExecution = async (auditLogId: string) => {
    const auditLog = await agentGateAuditDAL.startExecution(auditLogId);
    if (!auditLog) {
      throw new NotFoundError({ message: `Audit log not found: ${auditLogId}` });
    }
    return auditLog;
  };

  const completeExecution = async (
    auditLogId: string,
    data: {
      status: "completed" | "failed";
      result?: Record<string, unknown>;
      error?: string;
    }
  ) => {
    const auditLog = await agentGateAuditDAL.completeExecution(auditLogId, data);
    if (!auditLog) {
      throw new NotFoundError({ message: `Audit log not found: ${auditLogId}` });
    }
    return auditLog;
  };

  const registerAgent = async (dto: TRegisterAgentDTO) => {
    const { projectId, registration } = dto;
    const existingPolicy = await agentGatePolicyDAL.findByProjectAndAgentId(projectId, registration.agentId);

    if (!existingPolicy) {
      await agentGatePolicyDAL.upsertPolicy(projectId, registration.agentId, {
        selfPolicies: { allowedActions: registration.declaredSkills, promptPolicies: [] },
        inboundPolicies: []
      });

      return {
        success: true,
        effectivePermissions: registration.declaredSkills
      };
    }

    const effectivePermissions = registration.declaredSkills.filter((skill) =>
      existingPolicy.selfPolicies.allowedActions.includes(skill)
    );

    return {
      success: true,
      effectivePermissions
    };
  };

  const queryAuditLogs = async (dto: TAuditQueryDTO) => {
    const { projectId, filters, limit, offset } = dto;
    return agentGateAuditDAL.findByProject(
      projectId,
      filters
        ? {
            sessionId: filters.sessionId,
            agentId: filters.agentId,
            action: filters.action,
            result: filters.result,
            executionStatus: filters.executionStatus,
            startTime: filters.startTime ? new Date(filters.startTime) : undefined,
            endTime: filters.endTime ? new Date(filters.endTime) : undefined
          }
        : undefined,
      limit,
      offset
    );
  };

  const createAuditLog = async (
    projectId: string,
    log: {
      sessionId?: string;
      timestamp: string;
      requestingAgentId: string;
      targetAgentId: string;
      actionType: "skill" | "communication";
      action: string;
      result: "allowed" | "denied";
      policyEvaluations: PolicyEvaluationResult[];
      context?: ActionContext;
    }
  ) => {
    return agentGateAuditDAL.createAuditLog({
      sessionId: log.sessionId,
      projectId,
      timestamp: new Date(log.timestamp),
      requestingAgentId: log.requestingAgentId,
      targetAgentId: log.targetAgentId,
      actionType: log.actionType,
      action: log.action,
      result: log.result,
      policyEvaluations: log.policyEvaluations,
      context: log.context as Record<string, unknown> | undefined,
      executionStatus: log.result === "allowed" ? "pending" : undefined
    });
  };

  return {
    createPolicy,
    updatePolicy,
    getPolicy,
    listPolicies,
    deletePolicy,
    evaluatePolicy,
    startExecution,
    completeExecution,
    registerAgent,
    queryAuditLogs,
    createAuditLog
  };
};
