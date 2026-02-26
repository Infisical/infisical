import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import {
  CustomerTicket,
  TicketClassification,
  OrderInfo,
} from "../../shared/types.js";
import { SUPPORT_SKILLS } from "../../shared/skills.js";
import {
  MOCK_ORDERS,
  MOCK_INVENTORY,
  generateTrackingNumber,
} from "../../shared/mock-data.js";
import {
  getNextAction,
  composeEmail,
  LLMDecision,
} from "../../shared/llm-client.js";
import { sendTicketResolutionEmail } from "../../shared/email-service.js";

interface SupportTaskContext {
  ticket: CustomerTicket;
  classification: TicketClassification;
  order?: OrderInfo;
  escalationApproved?: boolean;
  approvedRefundAmount?: number;
  flaggedForHumanReview?: boolean;
  humanReviewReason?: string;
  fulfillmentTrackingNumber?: string;
  governanceContext: ActionContext;
  totalRefundIssued: number;
  actionsPerformed: string[];
  llmHistory: ChatCompletionMessageParam[];
}

const SUPPORT_AGENT_SYSTEM_PROMPT = `You are a Support Agent for an e-commerce company. Resolve customer issues using the skills and agent communications available to you.

## Your Available Skills (use with action: "call_skill"):
- lookup_order_history: Look up order details. Parameters: { "orderId": "string" }
- check_inventory: Check if an item is in stock. Parameters: { "item": "string" }
- issue_refund: Issue a refund to the customer. Parameters: { "amount": number, "reason": "string" }
- access_payment_info: Access customer payment details. Parameters: { "orderId": "string" }
- compose_response: Compose an email response. Parameters: { "ticketId": "string" }
- send_customer_email: Send email to customer. Parameters: { "to": "email", "subject": "string", "body": "string" }
- request_escalation: Request manager approval. Parameters: { "ticketId": "string", "reason": "string", "requestedAmount": number }

## Agent Communications (use with action: "message_agent"):
- fulfillment_agent: For shipments and reshipments. Use messageType: "create_shipment"
- escalation_agent: For approvals beyond your authority. Use messageType: "approve_refund"

## IMPORTANT - Governance:
- All your actions are subject to governance policies enforced by the system
- Some actions may be DENIED - when this happens, read the denial reason carefully
- The denial reason will tell you what you need to do (e.g., "needs escalation approval")
- Adapt your approach based on denial feedback
- Do NOT assume you know the limits - try the action and let governance guide you

## Workflow:
1. Start by looking up the order to understand the situation
2. Take actions that make sense for the issue
3. If an action is denied, adapt based on the denial reason
4. After resolving the issue, compose and send an email to the customer
5. When everything is resolved, mark the task as complete

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
    "targetAgent": "fulfillment_agent or escalation_agent",
    "messageType": "create_shipment or approve_refund",
    "content": { "relevant": "data for the request" },
    "reasoning": "Why contacting this agent"
  }
}

For completing the task:
{
  "action": "complete",
  "reasoning": "Task is done because...",
  "finalResponse": "Summary of what was resolved for the customer"
}

Only use action values: "call_skill", "message_agent", or "complete".`;

export class SupportAgentExecutor extends BaseAgentExecutor {
  constructor() {
    super({
      agentId: "support_agent",
      agentName: "Support Agent",
      declaredSkills: SUPPORT_SKILLS.map((s) => s.id),
    });
  }

  async executeTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    userMessage: Message,
  ): Promise<void> {
    const { taskId, contextId } = requestContext;

    const context = this.extractContext(userMessage);

    this.log("Received ticket from Triage", {
      ticketId: context.ticket.ticketId,
      classification: context.classification.category,
    });

    // If ticket was flagged for human review, complete immediately with appropriate message
    if (context.flaggedForHumanReview) {
      this.log("🛑 Ticket flagged for human review - completing task", {
        reason: context.humanReviewReason,
      });

      const resolutionMessage = `This ticket requires human manager review. ${context.humanReviewReason || "The requested action exceeds automated approval limits."}. A manager will review and process this request. The customer will be notified once the review is complete.`;

      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "ticket_pending_human_review",
          ticketId: context.ticket.ticketId,
          resolution: {
            status: "pending_human_review",
            reason: context.humanReviewReason,
            actionsPerformed: [
              "Escalation requested",
              "Flagged for human review",
            ],
          },
          llmSummary: resolutionMessage,
        }),
      );

      // Send notification email about pending review
      try {
        await sendTicketResolutionEmail({
          ticketId: context.ticket.ticketId,
          orderId: context.ticket.orderId,
          customerName: context.ticket.customerName,
          customerEmail: context.ticket.customerEmail,
          issueDescription: context.ticket.issueDescription,
          resolution: {
            summary: `Your request is being reviewed by a manager. ${context.humanReviewReason || "The requested action requires additional approval."}. You will receive an update once the review is complete.`,
            actionsPerformed: [
              "Escalation requested",
              "Flagged for human review",
            ],
          },
        });
        this.log("📧 Human review notification email sent");
      } catch (emailError) {
        this.log("⚠️ Failed to send human review notification email", {
          error:
            emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }

      return;
    }

    this.log("🤖 LLM-POWERED AGENT: Starting autonomous reasoning loop");

    const maxIterations = 15;
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
          this.log("🎉 LLM decided task is complete", {
            finalResponse: decision.finalResponse,
          });

          this.publishMessage(
            eventBus,
            JSON.stringify({
              action: "ticket_resolved",
              ticketId: context.ticket.ticketId,
              resolution: {
                totalRefundIssued: context.totalRefundIssued,
                reshipmentCreated: !!context.fulfillmentTrackingNumber,
                trackingNumber: context.fulfillmentTrackingNumber,
                actionsPerformed: context.actionsPerformed,
              },
              llmSummary: decision.finalResponse,
            }),
          );

          // Send resolution email notification
          try {
            await sendTicketResolutionEmail({
              ticketId: context.ticket.ticketId,
              orderId: context.ticket.orderId,
              customerName: context.ticket.customerName,
              customerEmail: context.ticket.customerEmail,
              issueDescription: context.ticket.issueDescription,
              resolution: {
                summary:
                  decision.finalResponse || "Your issue has been resolved.",
                totalRefundIssued: context.totalRefundIssued || undefined,
                reshipmentCreated: !!context.fulfillmentTrackingNumber,
                trackingNumber: context.fulfillmentTrackingNumber,
                actionsPerformed: context.actionsPerformed,
              },
            });
            this.log("📧 Resolution email sent successfully");
          } catch (emailError) {
            this.log("⚠️ Failed to send resolution email", {
              error:
                emailError instanceof Error
                  ? emailError.message
                  : "Unknown error",
            });
          }

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

          // Check if escalation response flagged for human review - exit loop
          if (context.flaggedForHumanReview) {
            this.log(
              "🛑 Agent response indicates human review required - completing task",
              {
                reason: context.humanReviewReason,
              },
            );

            this.publishMessage(
              eventBus,
              JSON.stringify({
                action: "ticket_pending_human_review",
                ticketId: context.ticket.ticketId,
                orderId: context.ticket.orderId,
                reason: context.humanReviewReason,
                actionsPerformed: context.actionsPerformed,
              }),
            );

            try {
              await sendTicketResolutionEmail({
                ticketId: context.ticket.ticketId,
                orderId: context.ticket.orderId,
                customerName: context.ticket.customerName,
                customerEmail: context.ticket.customerEmail,
                issueDescription: context.ticket.issueDescription,
                resolution: {
                  summary: `Your request is pending manager review. Reason: ${context.humanReviewReason}. We will contact you once a decision is made.`,
                  actionsPerformed: context.actionsPerformed,
                },
              });
              this.log("📧 Human review notification email sent");
            } catch (emailError) {
              this.log("⚠️ Failed to send human review email", {
                error:
                  emailError instanceof Error
                    ? emailError.message
                    : "Unknown error",
              });
            }

            break;
          }

          continue;
        }

        // Handle unrecognized action - tell LLM to use proper format
        this.log("⚠️ Unrecognized action from LLM", {
          action: decision.action,
        });
        context.llmHistory.push({
          role: "assistant",
          content: JSON.stringify(decision),
        });
        context.llmHistory.push({
          role: "user",
          content: `Invalid action "${decision.action}". You must use one of: "call_skill", "message_agent", or "complete". 
          
If you want to request escalation, use: { "action": "call_skill", "skillCall": { "skillId": "request_escalation", "parameters": {...}, "reasoning": "..." } }

If you want to message an agent, use: { "action": "message_agent", "agentMessage": { "targetAgent": "fulfillment_agent", "messageType": "reship_request", "content": {...}, "reasoning": "..." } }

Please try again with the correct format.`,
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
          action: "ticket_resolved",
          ticketId: context.ticket.ticketId,
          resolution: {
            totalRefundIssued: context.totalRefundIssued,
            reshipmentCreated: !!context.fulfillmentTrackingNumber,
            trackingNumber: context.fulfillmentTrackingNumber,
            actionsPerformed: context.actionsPerformed,
            note: "Max iterations reached",
          },
        }),
      );

      // Send resolution email even when max iterations reached
      try {
        await sendTicketResolutionEmail({
          ticketId: context.ticket.ticketId,
          orderId: context.ticket.orderId,
          customerName: context.ticket.customerName,
          customerEmail: context.ticket.customerEmail,
          issueDescription: context.ticket.issueDescription,
          resolution: {
            summary:
              "Your support ticket has been processed. Our team has taken the actions listed below to resolve your issue.",
            totalRefundIssued: context.totalRefundIssued || undefined,
            reshipmentCreated: !!context.fulfillmentTrackingNumber,
            trackingNumber: context.fulfillmentTrackingNumber,
            actionsPerformed: context.actionsPerformed,
          },
        });
        this.log("📧 Resolution email sent successfully");
      } catch (emailError) {
        this.log("⚠️ Failed to send resolution email", {
          error:
            emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    }
  }

  private async getNextLLMDecision(
    context: SupportTaskContext,
  ): Promise<LLMDecision> {
    const systemPrompt = SUPPORT_AGENT_SYSTEM_PROMPT.replace(
      "{{CONTEXT}}",
      JSON.stringify(
        {
          ticket: context.ticket,
          classification: context.classification,
          order: context.order,
          escalationApproved: context.escalationApproved,
          approvedRefundAmount: context.approvedRefundAmount,
          fulfillmentTrackingNumber: context.fulfillmentTrackingNumber,
          totalRefundIssued: context.totalRefundIssued,
        },
        null,
        2,
      ),
    ).replace("{{ACTIONS}}", context.actionsPerformed.join("\n") || "None yet");

    if (context.llmHistory.length === 0) {
      context.llmHistory.push({
        role: "user",
        content: `New support ticket received. Customer: ${context.ticket.customerName}, Issue: ${context.ticket.issueDescription}. Category: ${context.classification.category}, Severity: ${context.classification.severity}. What should I do first?`,
      });
    }

    return getNextAction(systemPrompt, context.llmHistory);
  }

  private async executeSkillFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: SupportTaskContext,
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
      this.getGovernanceContext(context, skillId, parameters),
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

      // Build guidance message based on directive from policy
      let guidance = `Skill ${skillId} was DENIED by governance policy. Reason: ${result.governance.reasoning}.`;
      if (result.governance.directive) {
        guidance += ` DIRECTIVE: ${result.governance.directive}.`;
        if (result.governance.directiveMessage) {
          guidance += ` ${result.governance.directiveMessage}`;
        }
      } else {
        guidance +=
          " You may need to request escalation or try a different approach.";
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
    context: SupportTaskContext,
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
        ...content,
        sessionId: context.governanceContext.sessionId, // Propagate sessionId to downstream agents
        ticket: context.ticket,
        classification: context.classification,
      },
      context.governanceContext,
      reasoning,
    );

    if (commResult.allowed) {
      context.actionsPerformed.push(
        `✅ Message ${targetAgent}: ${messageType} - ${reasoning}`,
      );

      const responseData = this.extractAgentResponse(commResult.result);

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
        content: `Message to ${targetAgent} sent successfully. Response: ${JSON.stringify(responseData)}. What's next?`,
      });

      this.updateContextFromAgentResponse(
        context,
        targetAgent,
        messageType,
        responseData,
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
    }
  }

  private getSkillExecutor(
    skillId: string,
    context: SupportTaskContext,
    parameters: Record<string, unknown>,
  ): () => Promise<Record<string, unknown>> {
    switch (skillId) {
      case "lookup_order_history":
        return async () => {
          await this.simulateDelay(400);
          const order = MOCK_ORDERS[context.ticket.orderId];
          if (order) {
            context.order = order;
            return { ...order } as Record<string, unknown>;
          }
          return { error: "Order not found", orderId: context.ticket.orderId };
        };

      case "check_inventory":
        return async () => {
          await this.simulateDelay(300);
          const item =
            (parameters.item as string) || context.order?.expectedItem;
          const inventoryItem = MOCK_INVENTORY["macbook-pro-16"];
          return {
            item,
            inStock: true,
            quantity: inventoryItem?.quantity || 15,
            warehouse: inventoryItem?.warehouse || "WAREHOUSE-A",
          };
        };

      case "issue_refund":
        return async () => {
          await this.simulateDelay(300);
          const amount = (parameters.amount as number) || 0;
          context.totalRefundIssued += amount;
          return {
            refundId: `REF-${Date.now()}`,
            amount,
            status: "processed",
            totalRefundIssued: context.totalRefundIssued,
          };
        };

      case "access_payment_info":
        return async () => {
          await this.simulateDelay(300);
          return {
            paymentMethod: "VISA ****1234",
            lastFour: "1234",
            expiryDate: "12/26",
          };
        };

      case "compose_response":
        return async () => {
          await this.simulateDelay(400);
          const email = await composeEmail(
            context.ticket.customerName,
            context.ticket.issueDescription,
            {
              refundAmount: context.totalRefundIssued || undefined,
              trackingNumber: context.fulfillmentTrackingNumber,
              reshipment: !!context.fulfillmentTrackingNumber,
            },
          );
          return email;
        };

      case "send_customer_email":
        return async () => {
          await this.simulateDelay(300);
          return {
            messageId: `MSG-${Date.now()}`,
            to: context.ticket.customerEmail,
            sentAt: new Date().toISOString(),
            status: "sent",
          };
        };

      case "request_escalation":
        return async () => {
          await this.simulateDelay(200);
          return {
            escalationId: `ESC-${Date.now()}`,
            status: "submitted",
            requestedAmount: parameters.requestedAmount,
          };
        };

      default:
        return async () => ({ error: `Unknown skill: ${skillId}` });
    }
  }

  private getGovernanceContext(
    context: SupportTaskContext,
    skillId: string,
    parameters: Record<string, unknown>,
  ): ActionContext {
    const baseContext = { ...context.governanceContext };

    if (skillId === "issue_refund") {
      baseContext.refundAmount = parameters.amount as number;
    }

    return baseContext;
  }

  private updateContextFromSkillResult(
    context: SupportTaskContext,
    skillId: string,
    result: unknown,
  ): void {
    const res = result as Record<string, unknown>;

    if (skillId === "lookup_order_history" && res && !res.error) {
      context.order = res as unknown as OrderInfo;
    }
  }

  private extractAgentResponse(result: {
    targetTaskId?: string;
    response?: unknown;
  }): Record<string, unknown> {
    if (!result.response) {
      return { status: "sent", targetTaskId: result.targetTaskId };
    }

    const response = result.response as Record<string, unknown>;
    if (response.kind === "task") {
      const task = response as {
        id: string;
        status: {
          state: string;
          message?: {
            parts: Array<{ kind: string; text?: string; data?: unknown }>;
          };
        };
        history?: Array<{
          parts: Array<{ kind: string; text?: string; data?: unknown }>;
        }>;
        artifacts?: Array<{ parts: Array<{ kind: string; data?: unknown }> }>;
      };

      const extracted: Record<string, unknown> = {
        taskId: task.id,
        status: task.status?.state,
      };

      // Extract from status message (final response)
      if (task.status?.message?.parts) {
        for (const part of task.status.message.parts) {
          if (part.kind === "text" && part.text) {
            try {
              const parsed = JSON.parse(part.text);
              Object.assign(extracted, parsed);
            } catch {
              extracted.message = part.text;
            }
          }
          if (part.kind === "data" && part.data) {
            Object.assign(extracted, part.data as Record<string, unknown>);
          }
        }
      }

      // Extract from task history (last agent message)
      if (task.history && task.history.length > 0) {
        const lastMessage = task.history[task.history.length - 1];
        if (lastMessage.parts) {
          for (const part of lastMessage.parts) {
            if (part.kind === "text" && part.text) {
              try {
                const parsed = JSON.parse(part.text);
                Object.assign(extracted, parsed);
              } catch {
                // Not JSON
              }
            }
            if (part.kind === "data" && part.data) {
              Object.assign(extracted, part.data as Record<string, unknown>);
            }
          }
        }
      }

      // Extract from artifacts
      if (task.artifacts) {
        for (const artifact of task.artifacts) {
          if (artifact.parts) {
            for (const part of artifact.parts) {
              if (part.kind === "data" && part.data) {
                const data = part.data as Record<string, unknown>;
                if (data.trackingNumber)
                  extracted.trackingNumber = data.trackingNumber;
                if (data.approvedAmount)
                  extracted.approvedAmount = data.approvedAmount;
                if (data.action) extracted.action = data.action;
              }
            }
          }
        }
      }

      return extracted;
    }

    // Handle Message responses (not tasks)
    if (response.kind === "message") {
      const message = response as {
        messageId: string;
        parts?: Array<{ kind: string; text?: string; data?: unknown }>;
      };
      const extracted: Record<string, unknown> = {
        messageId: message.messageId,
      };

      if (message.parts) {
        for (const part of message.parts) {
          if (part.kind === "text" && part.text) {
            try {
              const parsed = JSON.parse(part.text);
              Object.assign(extracted, parsed);
            } catch {
              extracted.message = part.text;
            }
          }
          if (part.kind === "data" && part.data) {
            Object.assign(extracted, part.data as Record<string, unknown>);
          }
        }
      }

      return extracted;
    }

    return response;
  }

  private updateContextFromAgentResponse(
    context: SupportTaskContext,
    targetAgent: string,
    messageType: string,
    response: Record<string, unknown>,
  ): void {
    this.log("Processing agent response", {
      targetAgent,
      messageType,
      responseKeys: Object.keys(response),
      response,
    });

    if (targetAgent === "fulfillment_agent") {
      // Use tracking number from response if available, otherwise generate
      if (response.trackingNumber) {
        context.fulfillmentTrackingNumber = response.trackingNumber as string;
      } else {
        context.fulfillmentTrackingNumber = generateTrackingNumber();
      }
      this.log("Fulfillment complete", {
        trackingNumber: context.fulfillmentTrackingNumber,
      });
    }

    if (targetAgent === "escalation_agent") {
      // Check if escalation was approved
      if (
        response.action === "escalation_approved" ||
        response.status === "completed"
      ) {
        context.escalationApproved = true;
        context.approvedRefundAmount =
          (response.approvedAmount as number) || 200;
        context.governanceContext.hasEscalationApproval = true;
        context.governanceContext.escalationApprovalContext = {
          approvedBy: "escalation_agent",
          approvedAmount: context.approvedRefundAmount,
          approvedAt: new Date().toISOString(),
        };
        this.log("Escalation approved", {
          approvedAmount: context.approvedRefundAmount,
        });
      }

      // Check if escalation was flagged for human review
      if (
        response.action === "escalation_flagged_for_human" ||
        response.flaggedForHuman === true
      ) {
        context.flaggedForHumanReview = true;
        context.humanReviewReason =
          (response.reason as string) ||
          (response.llmSummary as string) ||
          "Requires manager approval";
        this.log("Escalation flagged for human review", {
          reason: context.humanReviewReason,
        });
      }
    }
  }

  private extractContext(message: Message): SupportTaskContext {
    let ticket: CustomerTicket = {
      ticketId: "UNKNOWN",
      orderId: "UNKNOWN",
      customerEmail: "unknown@email.com",
      customerName: "Unknown",
      issueDescription: "Unknown issue",
      createdAt: new Date(),
    };
    let classification: TicketClassification = {
      category: "other",
      severity: "medium",
      requiresEscalation: false,
    };
    let sessionId: string | undefined;
    let escalationApproved = false;
    let approvedRefundAmount: number | undefined;
    let fulfillmentTrackingNumber: string | undefined;
    let flaggedForHumanReview = false;
    let humanReviewReason: string | undefined;

    for (const part of message.parts) {
      if (part.kind === "data" && part.data) {
        const data = part.data as Record<string, unknown>;
        // Extract sessionId from the message
        if (data.sessionId) {
          sessionId = data.sessionId as string;
        }
        if (
          data.action === "ticket_routed" ||
          data._messageType === "ticket_routed"
        ) {
          ticket = data.ticket as CustomerTicket;
          classification = data.classification as TicketClassification;
          // Also check ticket for sessionId
          if ((ticket as CustomerTicket & { sessionId?: string }).sessionId) {
            sessionId = (ticket as CustomerTicket & { sessionId?: string })
              .sessionId;
          }
        }
        if (data.action === "escalation_approved") {
          ticket = data.ticket as CustomerTicket;
          classification = data.classification as TicketClassification;
          escalationApproved = true;
          approvedRefundAmount = data.approvedAmount as number;
        }
        if (
          data.action === "escalation_decision" ||
          data._messageType === "escalation_decision"
        ) {
          if (data.ticket) {
            ticket = data.ticket as CustomerTicket;
          }
          if (data.classification) {
            classification = data.classification as TicketClassification;
          }
          if (data.sessionId) {
            sessionId = data.sessionId as string;
          }
          if (data.approvedAmount) {
            approvedRefundAmount = data.approvedAmount as number;
            escalationApproved = true;
          }
          if (data.decision === "APPROVED" || data.decision === "approved") {
            escalationApproved = true;
          }
          // Detect if flagged for human review
          if (
            data.decision === "FLAGGED_FOR_HUMAN_REVIEW" ||
            data.flaggedForHuman === true
          ) {
            flaggedForHumanReview = true;
            humanReviewReason =
              (data.flagReason as string) ||
              (data.reason as string) ||
              (data.nextSteps as string) ||
              "Requires manager approval";
          }
        }
        // Handle escalation completion messages (flagged for human or generic complete)
        if (
          data.action === "escalation_flagged_for_human" ||
          data.action === "escalation_complete"
        ) {
          if (data.ticket) {
            ticket = data.ticket as CustomerTicket;
          }
          if (data.classification) {
            classification = data.classification as TicketClassification;
          }
          if (data.sessionId) {
            sessionId = data.sessionId as string;
          }
          if (data.approvedAmount) {
            approvedRefundAmount = data.approvedAmount as number;
            escalationApproved = true;
          }
          // Mark as flagged for human review
          if (
            data.action === "escalation_flagged_for_human" ||
            data.flaggedForHuman === true
          ) {
            flaggedForHumanReview = true;
            humanReviewReason =
              (data.flagReason as string) ||
              (data.reason as string) ||
              "Requires manager approval";
          }
        }
        if (data.action === "fulfillment_complete") {
          ticket = data.ticket as CustomerTicket;
          classification = data.classification as TicketClassification;
          fulfillmentTrackingNumber = data.trackingNumber as string;
        }
        if (
          data.action === "fulfillment_update" ||
          data._messageType === "fulfillment_update"
        ) {
          if (data.ticket) {
            ticket = data.ticket as CustomerTicket;
          }
          if (data.classification) {
            classification = data.classification as TicketClassification;
          }
          if (data.sessionId) {
            sessionId = data.sessionId as string;
          }
          if (data.trackingNumber) {
            fulfillmentTrackingNumber = data.trackingNumber as string;
          }
          if (data.shipmentResult) {
            const shipment = data.shipmentResult as {
              trackingNumber?: string;
            };
            if (shipment.trackingNumber) {
              fulfillmentTrackingNumber = shipment.trackingNumber;
            }
          }
        }
      }
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          if (parsed.sessionId) {
            sessionId = parsed.sessionId;
          }
          if (parsed.action === "ticket_routed") {
            ticket = parsed.ticket;
            classification = parsed.classification;
            if (parsed.ticket?.sessionId) {
              sessionId = parsed.ticket.sessionId;
            }
          }
          if (parsed.action === "escalation_approved") {
            ticket = parsed.ticket;
            classification = parsed.classification;
            escalationApproved = true;
            approvedRefundAmount = parsed.approvedAmount;
          }
          if (parsed.action === "escalation_decision") {
            if (parsed.ticket) {
              ticket = parsed.ticket;
            }
            if (parsed.classification) {
              classification = parsed.classification;
            }
            if (parsed.sessionId) {
              sessionId = parsed.sessionId;
            }
            if (parsed.approvedAmount) {
              approvedRefundAmount = parsed.approvedAmount;
              escalationApproved = true;
            }
            if (
              parsed.decision === "APPROVED" ||
              parsed.decision === "approved"
            ) {
              escalationApproved = true;
            }
            // Detect if flagged for human review
            if (
              parsed.decision === "FLAGGED_FOR_HUMAN_REVIEW" ||
              parsed.flaggedForHuman === true
            ) {
              flaggedForHumanReview = true;
              humanReviewReason =
                parsed.reason ||
                parsed.nextSteps ||
                "Requires manager approval";
            }
          }
          // Handle escalation completion messages (flagged for human or generic complete)
          if (
            parsed.action === "escalation_flagged_for_human" ||
            parsed.action === "escalation_complete"
          ) {
            if (parsed.ticket) {
              ticket = parsed.ticket;
            }
            if (parsed.classification) {
              classification = parsed.classification;
            }
            if (parsed.sessionId) {
              sessionId = parsed.sessionId;
            }
            if (parsed.approvedAmount) {
              approvedRefundAmount = parsed.approvedAmount;
              escalationApproved = true;
            }
            // Mark as flagged for human review
            if (
              parsed.action === "escalation_flagged_for_human" ||
              parsed.flaggedForHuman === true
            ) {
              flaggedForHumanReview = true;
              humanReviewReason = parsed.reason || "Requires manager approval";
            }
          }
          if (parsed.action === "fulfillment_complete") {
            ticket = parsed.ticket;
            classification = parsed.classification;
            fulfillmentTrackingNumber = parsed.trackingNumber;
          }
          if (parsed.action === "fulfillment_update") {
            if (parsed.ticket) {
              ticket = parsed.ticket;
            }
            if (parsed.classification) {
              classification = parsed.classification;
            }
            if (parsed.sessionId) {
              sessionId = parsed.sessionId;
            }
            if (parsed.trackingNumber) {
              fulfillmentTrackingNumber = parsed.trackingNumber;
            }
            if (parsed.shipmentResult?.trackingNumber) {
              fulfillmentTrackingNumber = parsed.shipmentResult.trackingNumber;
            }
          }
        } catch {
          // Not JSON
        }
      }
    }

    // Store sessionId in ticket for downstream propagation
    if (sessionId) {
      ticket.sessionId = sessionId;
    }

    const governanceContext: ActionContext = {
      sessionId, // Include sessionId for unified audit trail
      ticketId: ticket.ticketId,
      orderId: ticket.orderId,
      customerEmail: ticket.customerEmail,
      issueCategory: classification.category,
      issueSeverity: classification.severity,
      customerLoyaltyStatus: ticket.loyaltyStatus,
      daysSinceTicketCreated: ticket.daysSinceCreated ?? 0,
      hasEscalationApproval: escalationApproved,
      escalationApprovalContext: escalationApproved
        ? {
            approvedBy: "escalation_agent",
            approvedAmount: approvedRefundAmount || 0,
            approvedAt: new Date().toISOString(),
          }
        : undefined,
    };

    this.log("Extracted context", {
      sessionId,
      ticketId: ticket.ticketId,
      flaggedForHumanReview,
    });

    return {
      ticket,
      classification,
      escalationApproved,
      approvedRefundAmount,
      flaggedForHumanReview,
      humanReviewReason,
      fulfillmentTrackingNumber,
      governanceContext,
      totalRefundIssued: 0,
      actionsPerformed: [],
      llmHistory: [],
    };
  }
}
