import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { TicketClassification, CustomerTicket } from "../../shared/types.js";
import { TRIAGE_SKILLS } from "../../shared/skills.js";
import { getNextAction, LLMDecision } from "../../shared/llm-client.js";
import { sessionMemory } from "../../shared/session-memory.js";

interface TriageTaskContext {
  ticket: CustomerTicket;
  classification?: TicketClassification;
  severityAssessment?: { severity: string; reasoning: string };
  governanceContext: ActionContext;
  actionsPerformed: string[];
  llmHistory: ChatCompletionMessageParam[];
}

const TRIAGE_AGENT_SYSTEM_PROMPT = `You are a Triage Agent for an e-commerce customer support system. Your job is to analyze incoming customer tickets, classify them, assess their severity, and route them to the appropriate agent.

## Your Available Skills (use with action: "call_skill"):
- classify_ticket: Analyze and classify the ticket. Parameters: { "ticketId": "string", "description": "string" }
- assess_severity: Evaluate urgency and assign severity. Parameters: { "ticketId": "string", "classification": { "category": "string", "severity": "string", "requiresEscalation": boolean } }

## Agent Communications (use with action: "message_agent"):
- support_agent: Send classified and triaged tickets for resolution. Use messageType: "ticket_routed"

## IMPORTANT - Governance:
- All your actions are subject to governance policies enforced by the system
- Some actions may be DENIED - when this happens, read the denial reason carefully
- Adapt your approach based on denial feedback

## Workflow:
1. First, classify the ticket to understand what type of issue it is (billing, shipping, product, account, other)
2. Then, assess the severity based on the classification and issue details
3. After classification and severity assessment, you MUST use "message_agent" to send the ticket to the support_agent with messageType "ticket_routed". This is how you hand off the ticket.
4. Only after successfully messaging the support_agent, mark the task as complete

## Classification Categories:
- billing: Payment issues, duplicate charges, refunds
- shipping: Delivery problems, wrong items, tracking issues
- product: Defective items, broken products, quality issues
- account: Login problems, password resets, account access
- other: General inquiries, other issues

## Severity Levels:
- low: General inquiries, non-urgent issues
- medium: Standard issues requiring attention
- high: Significant problems like wrong items, billing errors
- critical: Urgent issues requiring immediate attention (keywords: urgent, immediately, asap)

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
    "messageType": "ticket_routed",
    "content": { "relevant": "data for the request" },
    "reasoning": "Why contacting this agent"
  }
}

For completing the task:
{
  "action": "complete",
  "reasoning": "Task is done because...",
  "finalResponse": "Summary of the triage result"
}

Only use action values: "call_skill", "message_agent", or "complete".`;

export class TriageAgentExecutor extends BaseAgentExecutor {
  constructor() {
    super({
      agentId: "triage_agent",
      agentName: "Triage Agent",
      declaredSkills: TRIAGE_SKILLS.map((s) => s.id),
    });
  }

  async executeTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    userMessage: Message,
  ): Promise<void> {
    const { taskId, contextId } = requestContext;

    const ticketData = this.extractTicketData(userMessage);

    const governanceContext: ActionContext = {
      sessionId: ticketData.sessionId,
      ticketId: ticketData.ticketId,
      orderId: ticketData.orderId,
      customerEmail: ticketData.customerEmail,
    };

    const context: TriageTaskContext = {
      ticket: ticketData,
      governanceContext,
      actionsPerformed: [],
      llmHistory: [],
    };

    // Initialize session memory for this new ticket
    const sessionId = ticketData.sessionId || `session-${Date.now()}`;
    sessionMemory.getOrCreate(sessionId, ticketData.ticketId);

    this.log("Processing ticket", {
      sessionId: ticketData.sessionId,
      ticketId: ticketData.ticketId,
    });

    this.log("🤖 LLM-POWERED TRIAGE: Starting autonomous reasoning loop");

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
          this.log("🎉 LLM decided triage is complete", {
            finalResponse: decision.finalResponse,
          });

          this.publishMessage(
            eventBus,
            JSON.stringify({
              action: "triage_complete",
              ticketId: context.ticket.ticketId,
              classification: context.classification,
              severityAssessment: context.severityAssessment,
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
          action: "triage_complete",
          ticketId: context.ticket.ticketId,
          classification: context.classification,
          severityAssessment: context.severityAssessment,
          actionsPerformed: context.actionsPerformed,
          note: "Max iterations reached",
        }),
      );
    }
  }

  private async getNextLLMDecision(
    context: TriageTaskContext,
  ): Promise<LLMDecision> {
    const systemPrompt = TRIAGE_AGENT_SYSTEM_PROMPT.replace(
      "{{CONTEXT}}",
      JSON.stringify(
        {
          ticket: context.ticket,
          classification: context.classification,
          severityAssessment: context.severityAssessment,
        },
        null,
        2,
      ),
    ).replace("{{ACTIONS}}", context.actionsPerformed.join("\n") || "None yet");

    if (context.llmHistory.length === 0) {
      context.llmHistory.push({
        role: "user",
        content: `New ticket received for triage. Customer: ${context.ticket.customerName}, Issue: ${context.ticket.issueDescription}. Please classify this ticket, assess its severity, and route it to the appropriate agent.`,
      });
    }

    return getNextAction(systemPrompt, context.llmHistory);
  }

  private async executeSkillFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: TriageTaskContext,
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
      context.llmHistory.push({
        role: "user",
        content: `Skill ${skillId} was DENIED by governance policy. Reason: ${result.governance.reasoning}. Try a different approach.`,
      });
    }
  }

  private async executeAgentMessageFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: TriageTaskContext,
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
        action: "ticket_routed",
        targetAgent,
        sessionId: context.governanceContext.sessionId,
        ticket: context.ticket,
        classification: context.classification,
        ...content,
      },
      context.governanceContext,
      reasoning,
    );

    if (commResult.allowed) {
      const supportTaskId = commResult.result?.targetTaskId;
      const supportResponse = commResult.result?.response;

      context.actionsPerformed.push(
        `✅ Message ${targetAgent}: ${messageType} - ${reasoning}`,
      );

      this.log("Ticket forwarded to Support Agent", {
        supportTaskId,
        supportStatus:
          supportResponse?.kind === "task"
            ? supportResponse.status.state
            : "message",
      });

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
        content: `Message to ${targetAgent} sent successfully. Support task ID: ${supportTaskId}. The ticket has been routed. You can now complete the triage task.`,
      });

      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "ticket_routed_and_processed",
          targetAgent,
          ticket: context.ticket,
          classification: context.classification,
          supportTaskId,
          supportResponse:
            supportResponse?.kind === "task"
              ? {
                  taskId: supportResponse.id,
                  status: supportResponse.status.state,
                  artifacts: supportResponse.artifacts,
                }
              : supportResponse,
        }),
      );
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
        content: `Communication with ${targetAgent} was DENIED by governance policy. Reason: ${commResult.governance.reasoning}. Try a different approach.`,
      });

      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "ticket_routing_denied",
          targetAgent,
          ticket: context.ticket,
          classification: context.classification,
          reason: commResult.governance.reasoning,
        }),
      );
    }
  }

  private getSkillExecutor(
    skillId: string,
    context: TriageTaskContext,
    parameters: Record<string, unknown>,
  ): () => Promise<Record<string, unknown>> {
    switch (skillId) {
      case "classify_ticket":
        return async () => {
          await this.simulateDelay(500);
          return this.classifyTicket(context.ticket) as unknown as Record<
            string,
            unknown
          >;
        };

      case "assess_severity":
        return async () => {
          await this.simulateDelay(300);
          const classification =
            (parameters.classification as TicketClassification) ||
            context.classification;
          return {
            severity: classification?.severity || "medium",
            reasoning: this.getSeverityReasoning(
              classification || {
                category: "other",
                severity: "medium",
                requiresEscalation: false,
              },
              context.ticket,
            ),
          };
        };

      default:
        return async () => ({ error: `Unknown skill: ${skillId}` });
    }
  }

  private updateContextFromSkillResult(
    context: TriageTaskContext,
    skillId: string,
    result: unknown,
  ): void {
    const res = result as Record<string, unknown>;

    if (skillId === "classify_ticket" && res && !res.error) {
      context.classification = res as unknown as TicketClassification;
    }

    if (skillId === "assess_severity" && res && !res.error) {
      context.severityAssessment = res as { severity: string; reasoning: string };
    }
  }

  private extractTicketData(message: Message): CustomerTicket {
    for (const part of message.parts) {
      if (part.kind === "data" && part.data) {
        return part.data as unknown as CustomerTicket;
      }
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          if (parsed.ticketId) {
            return parsed as CustomerTicket;
          }
        } catch {
          return {
            ticketId: `TKT-${Date.now()}`,
            orderId: "UNKNOWN",
            customerEmail: "unknown@email.com",
            customerName: "Unknown Customer",
            issueDescription: part.text,
            createdAt: new Date(),
            daysSinceCreated: 0,
          };
        }
      }
    }

    return {
      ticketId: `TKT-${Date.now()}`,
      orderId: "UNKNOWN",
      customerEmail: "unknown@email.com",
      customerName: "Unknown Customer",
      issueDescription: "No description provided",
      createdAt: new Date(),
      daysSinceCreated: 0,
    };
  }

  private classifyTicket(ticket: CustomerTicket): TicketClassification {
    const description = ticket.issueDescription.toLowerCase();

    let category: TicketClassification["category"] = "other";
    let severity: TicketClassification["severity"] = "medium";
    let requiresEscalation = false;

    if (
      description.includes("charged twice") ||
      description.includes("duplicate charge") ||
      description.includes("billing") ||
      description.includes("payment")
    ) {
      category = "billing";
      severity = "high";
    } else if (
      description.includes("wrong item") ||
      (description.includes("received") && description.includes("instead")) ||
      description.includes("shipping") ||
      description.includes("delivery") ||
      description.includes("tracking")
    ) {
      category = "shipping";
      if (description.includes("wrong item")) {
        severity = "high";
      }
    } else if (
      description.includes("broken") ||
      description.includes("defective") ||
      description.includes("not working") ||
      description.includes("product")
    ) {
      category = "product";
    } else if (
      description.includes("account") ||
      description.includes("password") ||
      description.includes("login")
    ) {
      category = "account";
    }

    if (
      description.includes("urgent") ||
      description.includes("immediately") ||
      description.includes("asap")
    ) {
      severity = "critical";
      requiresEscalation = true;
    }

    return { category, severity, requiresEscalation };
  }

  private getSeverityReasoning(
    classification: TicketClassification,
    ticket: CustomerTicket,
  ): string {
    const reasons: string[] = [];

    if (
      classification.category === "shipping" &&
      ticket.issueDescription.toLowerCase().includes("wrong item")
    ) {
      reasons.push(
        "Wrong item delivered - customer received incorrect product",
      );
    }

    if (classification.category === "billing") {
      reasons.push("Billing issue - potential financial impact for customer");
    }

    if (classification.severity === "high") {
      reasons.push("High severity due to order fulfillment error");
    }

    return reasons.join(". ") || "Standard priority ticket";
  }
}
