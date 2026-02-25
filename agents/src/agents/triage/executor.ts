import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { TicketClassification, CustomerTicket } from "../../shared/types.js";
import { TRIAGE_SKILLS } from "../../shared/skills.js";

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

    // Session ID flows through all agents for unified audit trail
    const governanceContext: ActionContext = {
      sessionId: ticketData.sessionId,
      ticketId: ticketData.ticketId,
      orderId: ticketData.orderId,
      customerEmail: ticketData.customerEmail,
    };

    this.log("Processing ticket", {
      sessionId: ticketData.sessionId,
      ticketId: ticketData.ticketId,
    });

    this.log("SKILL: classify_ticket", { ticketId: ticketData.ticketId });

    const classifyResult = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "classify_ticket",
      {
        ticketId: ticketData.ticketId,
        description: ticketData.issueDescription,
      },
      governanceContext,
      async () => {
        await this.simulateDelay(500);
        return this.classifyTicket(ticketData);
      },
    );

    if (!classifyResult.allowed) {
      this.log("SKILL: classify_ticket DENIED", {
        reason: classifyResult.governance.reasoning,
      });
      return;
    }

    const classification = classifyResult.result;

    this.log("SKILL: assess_severity", { ticketId: ticketData.ticketId });

    const severityResult = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "assess_severity",
      { ticketId: ticketData.ticketId, classification },
      governanceContext,
      async () => {
        await this.simulateDelay(300);
        return {
          severity: classification.severity,
          reasoning: this.getSeverityReasoning(classification, ticketData),
        };
      },
    );

    if (!severityResult.allowed) {
      this.log("SKILL: assess_severity DENIED", {
        reason: severityResult.governance.reasoning,
      });
      return;
    }

    this.log("SKILL: route_ticket", {
      ticketId: ticketData.ticketId,
      routeTo: "support_agent",
      classification: classification.category,
    });

    const routeResult = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "route_ticket",
      { ticketId: ticketData.ticketId, targetAgent: "support_agent" },
      governanceContext,
      async () => {
        await this.simulateDelay(200);
        return {
          targetAgent: "support_agent",
          classification: classification,
          ticket: ticketData,
          routedAt: new Date().toISOString(),
        };
      },
    );

    if (!routeResult.allowed) {
      this.log("SKILL: route_ticket DENIED", {
        reason: routeResult.governance.reasoning,
      });
      return;
    }

    const commResult = await this.governedAgentMessage(
      eventBus,
      taskId,
      contextId,
      "support_agent",
      "ticket_routed",
      {
        action: "ticket_routed",
        targetAgent: "support_agent",
        sessionId: ticketData.sessionId, // Pass sessionId to downstream agent
        ticket: ticketData,
        classification: classification,
      },
      governanceContext,
    );

    if (commResult.allowed) {
      const supportTaskId = commResult.result?.targetTaskId;
      const supportResponse = commResult.result?.response;

      this.log("Ticket forwarded to Support Agent", {
        supportTaskId,
        supportStatus:
          supportResponse?.kind === "task"
            ? supportResponse.status.state
            : "message",
      });

      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "ticket_routed_and_processed",
          targetAgent: "support_agent",
          ticket: ticketData,
          classification: classification,
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
      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "ticket_routing_denied",
          targetAgent: "support_agent",
          ticket: ticketData,
          classification: classification,
          reason: commResult.governance.reasoning,
        }),
      );
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
