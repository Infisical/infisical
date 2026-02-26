import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { CustomerTicket, TicketClassification } from "../../shared/types.js";
import { ESCALATION_SKILLS } from "../../shared/skills.js";
import { getNextAction, LLMDecision } from "../../shared/llm-client.js";
import { sessionMemory } from "../../shared/session-memory.js";

interface EscalationRequest {
  sessionId?: string;
  ticketId: string;
  orderId: string;
  requestedRefund: number;
  reason: string;
  ticket?: CustomerTicket;
  classification?: TicketClassification;
  fromAgent: string;
}

interface EscalationTaskContext {
  request: EscalationRequest;
  caseReviewed?: boolean;
  reviewFindings?: string[];
  reviewRecommendation?: string;
  refundApproved?: boolean;
  approvedAmount?: number;
  approvalReasoning?: string;
  flaggedForHuman?: boolean;
  policyOverridden?: boolean;
  governanceContext: ActionContext;
  actionsPerformed: string[];
  llmHistory: ChatCompletionMessageParam[];
}

const ESCALATION_AGENT_SYSTEM_PROMPT = `You are an Escalation Agent for an e-commerce company. Your job is to review escalated cases from support agents, make decisions on refund approvals beyond standard limits, and handle exceptional circumstances.

## Your Available Skills (use with action: "call_skill"):
- review_case: Review the escalated case details and history. Parameters: { "ticketId": "string", "orderId": "string" }
- approve_refund: Approve a refund for the customer. Parameters: { "ticketId": "string", "requestedAmount": number, "approvedAmount": number }
- override_policy: Override standard policy for exceptional circumstances. Parameters: { "ticketId": "string", "policyId": "string", "reason": "string" }
- flag_for_human_review: Flag case for human review when outside your authority. Parameters: { "ticketId": "string", "reason": "string" }

## Agent Communications (use with action: "message_agent"):
- support_agent: Notify support agent of your decision. Use messageType: "escalation_decision"

## IMPORTANT - Governance:
- All your actions are subject to governance policies enforced by the system
- Some actions may be DENIED - when this happens, read the denial reason carefully
- The denial reason will tell you what you need to do (e.g., "exceeds authority, flag for human review")
- Do NOT assume you know your limits - try the action and let governance guide you
- Adapt your approach based on denial feedback

## Decision Criteria:
- Verify the order and issue are legitimate
- Check for customer fraud history
- Assess the severity and customer impact
- Use your best judgment on the appropriate refund amount

## Workflow:
1. First, review the case to understand the details and verify the request
2. Based on the review, decide whether to approve, partially approve, or flag for human review
3. If approving, call approve_refund with the appropriate amount
4. If an action is denied due to exceeding authority, flag for human review
5. When decision is made, mark the task as complete

## Current Task Context:
{{CONTEXT}}

## Actions Performed So Far:
{{ACTIONS}}

## Response Format - use EXACTLY one of these JSON structures:

For calling a skill:
{
  "action": "call_skill",
  "reasoning": "Why I'm doing this",
  "skillCall": {
    "skillId": "the_skill_id",
    "parameters": { "param1": "value1" },
    "reasoning": "Specific reason for this skill"
  }
}

For messaging another agent:
{
  "action": "message_agent",
  "reasoning": "Why I'm doing this",
  "agentMessage": {
    "targetAgent": "support_agent",
    "messageType": "escalation_decision",
    "content": { "relevant": "data for the request" },
    "reasoning": "Why contacting this agent"
  }
}

For completing the task:
{
  "action": "complete",
  "reasoning": "Task is done because...",
  "finalResponse": "Summary of the escalation decision"
}

Only use action values: "call_skill", "message_agent", or "complete".`;

export class EscalationAgentExecutor extends BaseAgentExecutor {
  constructor() {
    super({
      agentId: "escalation_agent",
      agentName: "Escalation Agent",
      declaredSkills: ESCALATION_SKILLS.map((s) => s.id),
    });
  }

  async executeTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    userMessage: Message,
  ): Promise<void> {
    const { taskId, contextId } = requestContext;

    const request = this.extractRequest(userMessage);

    const governanceContext: ActionContext = {
      sessionId: request.sessionId,
      ticketId: request.ticketId,
      orderId: request.orderId,
      issueCategory: request.classification?.category,
      issueSeverity: request.classification?.severity,
      refundAmount: request.requestedRefund,
    };

    const context: EscalationTaskContext = {
      request,
      governanceContext,
      actionsPerformed: [],
      llmHistory: [],
    };

    this.log("Received escalation request", {
      sessionId: request.sessionId,
      ticketId: request.ticketId,
      requestedRefund: request.requestedRefund,
      fromAgent: request.fromAgent,
    });

    this.log("🤖 LLM-POWERED ESCALATION: Starting autonomous reasoning loop");

    const maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      this.log(`🧠 LLM Decision Loop - Iteration ${iteration}`);

      try {
        const decision = await this.getNextLLMDecision(context);

        this.log("LLM Decision", {
          action: decision.action,
          reasoning: decision.reasoning,
        });

        if (decision.action === "complete") {
          this.log("🎉 LLM decided escalation is complete", {
            finalResponse: decision.finalResponse,
          });

          this.publishMessage(
            eventBus,
            JSON.stringify({
              action: context.refundApproved
                ? "escalation_approved"
                : context.flaggedForHuman
                  ? "escalation_flagged_for_human"
                  : "escalation_complete",
              ticketId: request.ticketId,
              orderId: request.orderId,
              approvedAmount: context.approvedAmount,
              reasoning: context.approvalReasoning,
              flaggedForHuman: context.flaggedForHuman,
              ticket: request.ticket,
              classification: request.classification,
              actionsPerformed: context.actionsPerformed,
              llmSummary: decision.finalResponse,
            }),
          );
          break;
        }

        if (decision.action === "call_skill" && decision.skillCall) {
          await this.executeSkillFromLLM(
            eventBus,
            taskId,
            contextId,
            context,
            decision.skillCall,
          );
          continue;
        }

        if (decision.action === "message_agent" && decision.agentMessage) {
          await this.executeAgentMessageFromLLM(
            eventBus,
            taskId,
            contextId,
            context,
            decision.agentMessage,
          );
          continue;
        }

        this.log("⚠️ Unrecognized action from LLM", {
          action: decision.action,
        });
        context.llmHistory.push({
          role: "assistant",
          content: JSON.stringify(decision),
        });
        context.llmHistory.push({
          role: "user",
          content: `Invalid action "${decision.action}". You must use one of: "call_skill", "message_agent", or "complete". Please try again with the correct format.`,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        this.log("LLM Error", { error: errorMessage });

        context.llmHistory.push({
          role: "assistant",
          content: JSON.stringify({ error: errorMessage }),
        });
        context.llmHistory.push({
          role: "user",
          content: `The previous action failed with error: ${errorMessage}. Please try a different approach or complete the task with what you've accomplished.`,
        });
      }
    }

    if (iteration >= maxIterations) {
      this.log("⚠️ Max iterations reached, forcing completion");
      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "escalation_complete",
          ticketId: request.ticketId,
          orderId: request.orderId,
          sessionId: request.sessionId,
          ticket: request.ticket,
          classification: request.classification,
          approvedAmount: context.approvedAmount,
          flaggedForHuman: context.flaggedForHuman,
          actionsPerformed: context.actionsPerformed,
          note: "Max iterations reached",
        }),
      );
    }
  }

  private async getNextLLMDecision(
    context: EscalationTaskContext,
  ): Promise<LLMDecision> {
    const systemPrompt = ESCALATION_AGENT_SYSTEM_PROMPT.replace(
      "{{CONTEXT}}",
      JSON.stringify(
        {
          request: {
            ticketId: context.request.ticketId,
            orderId: context.request.orderId,
            requestedRefund: context.request.requestedRefund,
            reason: context.request.reason,
            fromAgent: context.request.fromAgent,
            classification: context.request.classification,
          },
          caseReviewed: context.caseReviewed,
          reviewFindings: context.reviewFindings,
          reviewRecommendation: context.reviewRecommendation,
          refundApproved: context.refundApproved,
          approvedAmount: context.approvedAmount,
          flaggedForHuman: context.flaggedForHuman,
          policyOverridden: context.policyOverridden,
        },
        null,
        2,
      ),
    ).replace("{{ACTIONS}}", context.actionsPerformed.join("\n") || "None yet");

    if (context.llmHistory.length === 0) {
      context.llmHistory.push({
        role: "user",
        content: `New escalation request received from ${context.request.fromAgent}. Ticket ID: ${context.request.ticketId}, Order ID: ${context.request.orderId}, Requested Refund: $${context.request.requestedRefund}, Reason: ${context.request.reason}. Category: ${context.request.classification?.category || "unknown"}, Severity: ${context.request.classification?.severity || "unknown"}. Please review this case and make an appropriate decision.`,
      });
    }

    return getNextAction(systemPrompt, context.llmHistory);
  }

  private async executeSkillFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: EscalationTaskContext,
    skillCall: {
      skillId: string;
      parameters: Record<string, unknown>;
      reasoning: string;
    },
  ): Promise<void> {
    const { skillId, parameters, reasoning } = skillCall;

    this.log(`SKILL: ${skillId}`, { parameters, reasoning });

    const executor = this.getSkillExecutor(skillId, context, parameters);

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      skillId,
      parameters,
      context.governanceContext,
      executor,
      reasoning,
    );

    if (result.allowed) {
      context.actionsPerformed.push(`✅ ${skillId}: ${reasoning}`);
      context.llmHistory.push({
        role: "assistant",
        content: JSON.stringify({ action: "call_skill", skillCall, reasoning }),
      });
      context.llmHistory.push({
        role: "user",
        content: `Skill ${skillId} executed successfully. Result: ${JSON.stringify(result.result)}. What's next?`,
      });

      this.updateContextFromSkillResult(context, skillId, result.result);
    } else {
      context.actionsPerformed.push(
        `❌ ${skillId}: DENIED - ${result.governance.reasoning}`,
      );
      context.llmHistory.push({
        role: "assistant",
        content: JSON.stringify({ action: "call_skill", skillCall, reasoning }),
      });
      // Provide specific guidance based on the denied skill
      let guidance = `Skill ${skillId} was DENIED by governance policy. Reason: ${result.governance.reasoning}.`;

      if (skillId === "approve_refund") {
        // If refund approval was denied (likely due to amount limits), guide to flag for human review
        guidance += ` Since the refund approval was denied, you should use flag_for_human_review to escalate this to a human manager who can approve higher amounts.`;
      } else if (skillId === "review_case") {
        // Critical skill - cannot proceed without it
        guidance += ` CRITICAL: This is a required skill for escalation review. You must complete the task and report that the escalation could not be processed due to policy denial.`;
      } else {
        guidance += ` You may need to flag for human review or try a different approach.`;
      }

      context.llmHistory.push({
        role: "user",
        content: guidance,
      });
    }
  }

  private async executeAgentMessageFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: EscalationTaskContext,
    agentMessage: {
      targetAgent: string;
      messageType: string;
      content: Record<string, unknown>;
      reasoning: string;
    },
  ): Promise<void> {
    const { targetAgent, messageType, content, reasoning } = agentMessage;

    this.log(`COMM: ${targetAgent}`, { messageType, reasoning });

    const commResult = await this.governedAgentMessage(
      eventBus,
      taskId,
      contextId,
      targetAgent,
      messageType,
      {
        action: context.flaggedForHuman
          ? "escalation_flagged_for_human"
          : messageType,
        targetAgent,
        sessionId: context.governanceContext.sessionId,
        ticketId: context.request.ticketId,
        orderId: context.request.orderId,
        approvedAmount: context.approvedAmount,
        reasoning: context.approvalReasoning,
        flaggedForHuman: context.flaggedForHuman || false,
        flagReason: context.flaggedForHuman
          ? "Amount exceeds escalation agent authority"
          : undefined,
        ticket: context.request.ticket,
        classification: context.request.classification,
        ...content,
      },
      context.governanceContext,
      reasoning,
    );

    if (commResult.allowed) {
      context.actionsPerformed.push(
        `✅ Message ${targetAgent}: ${messageType} - ${reasoning}`,
      );

      context.llmHistory.push({
        role: "assistant",
        content: JSON.stringify({
          action: "message_agent",
          agentMessage,
          reasoning,
        }),
      });
      context.llmHistory.push({
        role: "user",
        content: `Message to ${targetAgent} sent successfully. You can now complete the task.`,
      });
    } else {
      context.actionsPerformed.push(
        `❌ Message ${targetAgent}: DENIED - ${commResult.governance.reasoning}`,
      );
      context.llmHistory.push({
        role: "assistant",
        content: JSON.stringify({
          action: "message_agent",
          agentMessage,
          reasoning,
        }),
      });
      context.llmHistory.push({
        role: "user",
        content: `Communication with ${targetAgent} was DENIED by governance policy. Reason: ${commResult.governance.reasoning}. You can still complete the task - the decision will be returned to the calling agent.`,
      });
    }
  }

  private getSkillExecutor(
    skillId: string,
    context: EscalationTaskContext,
    parameters: Record<string, unknown>,
  ): () => Promise<Record<string, unknown>> {
    switch (skillId) {
      case "review_case":
        return async () => {
          await this.simulateDelay(600);
          return {
            ticketId: context.request.ticketId,
            orderId: context.request.orderId,
            requestedBy: context.request.fromAgent,
            requestedAmount: context.request.requestedRefund,
            reason: context.request.reason,
            classification: context.request.classification,
            findings: [
              "Order verified in system",
              "Issue confirmed by records",
              "Customer has no history of fraudulent claims",
              `Issue severity: ${context.request.classification?.severity?.toUpperCase() || "MEDIUM"}`,
              "Customer impact assessment completed",
            ],
            recommendation: "APPROVE",
          };
        };

      case "approve_refund":
        return async () => {
          await this.simulateDelay(400);
          const requestedAmount =
            (parameters.requestedAmount as number) ||
            context.request.requestedRefund;
          const approvedAmount =
            (parameters.approvedAmount as number) || requestedAmount;
          const reasoning = this.generateApprovalReasoning(
            context.request,
            approvedAmount,
          );
          return {
            requestedAmount,
            approvedAmount,
            status: "approved",
            reasoning,
            approvalLevel: "escalation_agent",
            timestamp: new Date().toISOString(),
          };
        };

      case "override_policy":
        return async () => {
          await this.simulateDelay(300);
          return {
            ticketId: context.request.ticketId,
            policyId: parameters.policyId || "standard_refund_limit",
            overridden: true,
            reason: parameters.reason || "Exceptional circumstances",
            timestamp: new Date().toISOString(),
          };
        };

      case "flag_for_human_review":
        return async () => {
          await this.simulateDelay(200);
          return {
            ticketId: context.request.ticketId,
            flagId: `FLAG-${Date.now()}`,
            status: "pending_human_review",
            reason:
              (parameters.reason as string) ||
              "Requires human manager approval",
            requestedAmount: context.request.requestedRefund,
            timestamp: new Date().toISOString(),
          };
        };

      default:
        return async () => ({ error: `Unknown skill: ${skillId}` });
    }
  }

  private updateContextFromSkillResult(
    context: EscalationTaskContext,
    skillId: string,
    result: unknown,
  ): void {
    const res = result as Record<string, unknown>;

    if (skillId === "review_case" && res && !res.error) {
      context.caseReviewed = true;
      context.reviewFindings = res.findings as string[];
      context.reviewRecommendation = res.recommendation as string;
    }

    if (skillId === "approve_refund" && res && !res.error) {
      context.refundApproved = true;
      context.approvedAmount = res.approvedAmount as number;
      context.approvalReasoning = res.reasoning as string;
    }

    if (skillId === "flag_for_human_review" && res && !res.error) {
      context.flaggedForHuman = true;

      // Update session memory to reflect human review status
      const sessionId = context.request.sessionId;
      if (sessionId) {
        sessionMemory.updateStatus(
          sessionId,
          "pending_human_review",
          `Escalation flagged for human review: ${res.reason || "Amount exceeds approval authority"}`,
        );
        this.log("📝 Session memory updated: pending_human_review", {
          sessionId,
        });
      }
    }

    if (skillId === "override_policy" && res && !res.error) {
      context.policyOverridden = true;
    }
  }

  private extractRequest(message: Message): EscalationRequest {
    for (const part of message.parts) {
      if (part.kind === "data" && part.data) {
        const data = part.data as Record<string, unknown>;
        const ticket = data.ticket as CustomerTicket | undefined;

        let sessionId = data.sessionId as string | undefined;
        if (!sessionId && ticket?.sessionId) {
          sessionId = ticket.sessionId;
        }

        return {
          sessionId,
          ticketId: (data.ticketId as string) || ticket?.ticketId || "UNKNOWN",
          orderId: (data.orderId as string) || ticket?.orderId || "UNKNOWN",
          requestedRefund:
            (data.requestedRefund as number) ||
            (data.requestedAmount as number) ||
            0,
          reason: (data.reason as string) || "No reason provided",
          ticket,
          classification: data.classification as
            | TicketClassification
            | undefined,
          fromAgent:
            (data.fromAgent as string) ||
            (data._sourceAgent as string) ||
            "support_agent",
        };
      }
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          const sessionId = parsed.sessionId || parsed.ticket?.sessionId;

          return {
            sessionId,
            ticketId: parsed.ticketId || parsed.ticket?.ticketId || "UNKNOWN",
            orderId: parsed.orderId || parsed.ticket?.orderId || "UNKNOWN",
            requestedRefund:
              parsed.requestedRefund || parsed.requestedAmount || 0,
            reason: parsed.reason || "No reason provided",
            ticket: parsed.ticket,
            classification: parsed.classification,
            fromAgent: parsed.fromAgent || "support_agent",
          };
        } catch {
          // Not JSON
        }
      }
    }

    return {
      ticketId: "UNKNOWN",
      orderId: "UNKNOWN",
      requestedRefund: 0,
      reason: "Unknown",
      fromAgent: "unknown",
    };
  }

  private generateApprovalReasoning(
    request: EscalationRequest,
    approvedAmount: number,
  ): string {
    const reasons: string[] = [];

    if (request.reason.toLowerCase().includes("wrong item")) {
      reasons.push("Wrong item shipment verified - clear fulfillment error");
    }

    reasons.push("Customer impact is significant");
    reasons.push(`Refund of $${approvedAmount} recommended for approval`);
    reasons.push("No indication of customer fraud or abuse");

    return reasons.join(". ") + ".";
  }
}
