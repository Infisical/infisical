import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { CustomerTicket, TicketClassification } from "../../shared/types.js";
import { ESCALATION_SKILLS } from "../../shared/skills.js";

interface EscalationRequest {
  sessionId?: string; // For unified audit trail
  ticketId: string;
  orderId: string;
  requestedRefund: number;
  reason: string;
  ticket?: CustomerTicket;
  classification?: TicketClassification;
  fromAgent: string;
}

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

    this.log("Received escalation request", {
      sessionId: request.sessionId,
      ticketId: request.ticketId,
      requestedRefund: request.requestedRefund,
      fromAgent: request.fromAgent,
    });

    const governanceContext: ActionContext = {
      sessionId: request.sessionId, // Propagate sessionId for unified audit trail
      ticketId: request.ticketId,
      orderId: request.orderId,
      issueCategory: request.classification?.category,
      issueSeverity: request.classification?.severity,
      refundAmount: request.requestedRefund,
    };

    const reviewResult = await this.reviewCase(
      eventBus,
      taskId,
      contextId,
      request,
      governanceContext,
    );

    if (!reviewResult) return;

    const decision = await this.approveRefund(
      eventBus,
      taskId,
      contextId,
      request,
      governanceContext,
    );

    if (!decision) return;

    // Publish the approval as a message - this will be returned to the calling agent
    this.publishMessage(
      eventBus,
      JSON.stringify({
        action: "escalation_approved",
        ticketId: request.ticketId,
        orderId: request.orderId,
        approvedAmount: decision.approvedAmount,
        reasoning: decision.reasoning,
        ticket: request.ticket,
        classification: request.classification,
      }),
    );

    this.log("Escalation approved", {
      ticketId: request.ticketId,
      approvedAmount: decision.approvedAmount,
    });
  }

  private extractRequest(message: Message): EscalationRequest {
    for (const part of message.parts) {
      // Handle data parts (from agent-to-agent forwarding)
      if (part.kind === "data" && part.data) {
        const data = part.data as Record<string, unknown>;
        const ticket = data.ticket as CustomerTicket | undefined;

        // Extract sessionId from direct field or from ticket
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
      // Handle text parts (legacy/direct calls)
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          // Extract sessionId from direct field or from ticket
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

  private async reviewCase(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: EscalationRequest,
    governanceContext: ActionContext,
  ): Promise<boolean> {
    this.log("SKILL: review_case", {
      ticketId: request.ticketId,
      orderId: request.orderId,
    });

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "review_case",
      { ticketId: request.ticketId, orderId: request.orderId },
      governanceContext,
      async () => {
        await this.simulateDelay(600);
        return {
          ticketId: request.ticketId,
          orderId: request.orderId,
          requestedBy: request.fromAgent,
          requestedAmount: request.requestedRefund,
          reason: request.reason,
          classification: request.classification,
          findings: [
            "Order verified in system",
            "Wrong item shipment confirmed by delivery records",
            "Customer has no history of fraudulent claims",
            "Issue severity: HIGH",
            "Customer impact: SIGNIFICANT - received completely wrong item",
          ],
          recommendation: "APPROVE",
        };
      },
    );

    return result.allowed;
  }

  private async approveRefund(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: EscalationRequest,
    governanceContext: ActionContext,
  ): Promise<{ approvedAmount: number; reasoning: string } | null> {
    this.log("SKILL: approve_refund", {
      requestedAmount: request.requestedRefund,
    });

    const approvedAmount = Math.min(request.requestedRefund, 500);
    const reasoning = this.generateApprovalReasoning(request, approvedAmount);

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "approve_refund",
      {
        ticketId: request.ticketId,
        requestedAmount: request.requestedRefund,
        approvedAmount,
      },
      governanceContext,
      async () => {
        await this.simulateDelay(400);
        return {
          requestedAmount: request.requestedRefund,
          approvedAmount: approvedAmount,
          status: "approved",
          reasoning: reasoning,
          approvalLevel: "escalation_agent",
          maxApprovalLimit: 500,
          timestamp: new Date().toISOString(),
        };
      },
    );

    if (!result.allowed) return null;

    this.log("COMM: Notifying Support Agent of approval", {
      approvedAmount,
    });

    return { approvedAmount, reasoning };
  }

  private generateApprovalReasoning(
    request: EscalationRequest,
    approvedAmount: number,
  ): string {
    const reasons: string[] = [];

    if (request.reason.toLowerCase().includes("wrong item")) {
      reasons.push("Wrong item shipment verified - clear fulfillment error");
    }

    reasons.push("Customer impact is significant - received incorrect product");
    reasons.push(
      `Refund of $${approvedAmount} is within escalation agent approval limit ($500)`,
    );
    reasons.push("No indication of customer fraud or abuse");

    return reasons.join(". ") + ".";
  }
}
