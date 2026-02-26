import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { FULFILLMENT_SKILLS } from "../../shared/skills.js";
import {
  generateTrackingNumber,
  generateShipmentId,
  MOCK_INVENTORY,
} from "../../shared/mock-data.js";
import { getNextAction, LLMDecision } from "../../shared/llm-client.js";

interface FulfillmentRequest {
  action: "reship_correct_item" | "create_shipment" | "process_return";
  sessionId?: string;
  orderId: string;
  item?: string;
  customerEmail?: string;
  ticketId?: string;
}

interface FulfillmentTaskContext {
  request: FulfillmentRequest;
  inventoryChecked?: boolean;
  inventoryResult?: Record<string, unknown>;
  shipmentCreated?: boolean;
  shipmentResult?: { shipmentId: string; trackingNumber: string };
  labelGenerated?: boolean;
  governanceContext: ActionContext;
  actionsPerformed: string[];
  llmHistory: ChatCompletionMessageParam[];
}

const FULFILLMENT_AGENT_SYSTEM_PROMPT = `You are a Fulfillment Agent for an e-commerce company. Your job is to process shipment requests, check inventory, create shipments, and generate shipping labels.

## Your Available Skills (use with action: "call_skill"):
- check_warehouse_inventory: Check if an item is available in the warehouse. Parameters: { "item": "string", "orderId": "string" }
- create_shipment: Create a new shipment for an order. Parameters: { "orderId": "string", "item": "string" }
- generate_shipping_label: Generate a shipping label with tracking number. Parameters: { "shipmentId": "string", "trackingNumber": "string" }
- process_return: Process a return request. Parameters: { "orderId": "string", "reason": "string" }
- update_tracking: Update tracking information. Parameters: { "shipmentId": "string", "status": "string" }

## Agent Communications (use with action: "message_agent"):
- support_agent: Notify support of fulfillment status. Use messageType: "fulfillment_update"

## IMPORTANT - Governance:
- All your actions are subject to governance policies enforced by the system
- Some actions may be DENIED - when this happens, read the denial reason carefully
- Adapt your approach based on denial feedback

## Workflow:
1. First, check warehouse inventory to ensure the item is available
2. If inventory is available, create the shipment
3. After shipment is created, generate a shipping label
4. When all steps are complete, mark the task as complete

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
    "messageType": "fulfillment_update",
    "content": { "relevant": "data for the request" },
    "reasoning": "Why contacting this agent"
  }
}

For completing the task:
{
  "action": "complete",
  "reasoning": "Task is done because...",
  "finalResponse": "Summary of the fulfillment result"
}

Only use action values: "call_skill", "message_agent", or "complete".`;

export class FulfillmentAgentExecutor extends BaseAgentExecutor {
  constructor() {
    super({
      agentId: "fulfillment_agent",
      agentName: "Fulfillment Agent",
      declaredSkills: FULFILLMENT_SKILLS.map((s) => s.id),
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
      orderId: request.orderId,
      customerEmail: request.customerEmail,
      ticketId: request.ticketId,
    };

    const context: FulfillmentTaskContext = {
      request,
      governanceContext,
      actionsPerformed: [],
      llmHistory: [],
    };

    this.log("Received fulfillment request", {
      sessionId: request.sessionId,
      action: request.action,
      orderId: request.orderId,
    });

    this.log("🤖 LLM-POWERED FULFILLMENT: Starting autonomous reasoning loop");

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
          this.log("🎉 LLM decided fulfillment is complete", {
            finalResponse: decision.finalResponse,
          });

          this.publishMessage(
            eventBus,
            JSON.stringify({
              action: "fulfillment_complete",
              orderId: request.orderId,
              shipmentId: context.shipmentResult?.shipmentId,
              trackingNumber: context.shipmentResult?.trackingNumber,
              status: "shipped",
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
          action: "fulfillment_complete",
          orderId: request.orderId,
          shipmentId: context.shipmentResult?.shipmentId,
          trackingNumber: context.shipmentResult?.trackingNumber,
          status: context.shipmentResult ? "shipped" : "incomplete",
          actionsPerformed: context.actionsPerformed,
          note: "Max iterations reached",
        }),
      );
    }
  }

  private async getNextLLMDecision(
    context: FulfillmentTaskContext,
  ): Promise<LLMDecision> {
    const systemPrompt = FULFILLMENT_AGENT_SYSTEM_PROMPT.replace(
      "{{CONTEXT}}",
      JSON.stringify(
        {
          request: context.request,
          inventoryChecked: context.inventoryChecked,
          inventoryResult: context.inventoryResult,
          shipmentCreated: context.shipmentCreated,
          shipmentResult: context.shipmentResult,
          labelGenerated: context.labelGenerated,
        },
        null,
        2,
      ),
    ).replace("{{ACTIONS}}", context.actionsPerformed.join("\n") || "None yet");

    if (context.llmHistory.length === 0) {
      context.llmHistory.push({
        role: "user",
        content: `New fulfillment request received. Action: ${context.request.action}, Order ID: ${context.request.orderId}, Item: ${context.request.item || "Not specified"}. Please process this fulfillment request by checking inventory, creating the shipment, and generating a shipping label.`,
      });
    }

    return getNextAction(systemPrompt, context.llmHistory);
  }

  private async executeSkillFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: FulfillmentTaskContext,
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
        content: `Skill ${skillId} was DENIED by governance policy. Reason: ${result.governance.reasoning}. Try a different approach or proceed with what's available.`,
      });
    }
  }

  private async executeAgentMessageFromLLM(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    context: FulfillmentTaskContext,
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
        action: messageType,
        targetAgent,
        sessionId: context.governanceContext.sessionId,
        orderId: context.request.orderId,
        shipmentResult: context.shipmentResult,
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
        content: `Message to ${targetAgent} sent successfully. What's next?`,
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
        content: `Communication with ${targetAgent} was DENIED by governance policy. Reason: ${commResult.governance.reasoning}. Continue with the fulfillment process.`,
      });
    }
  }

  private getSkillExecutor(
    skillId: string,
    context: FulfillmentTaskContext,
    parameters: Record<string, unknown>,
  ): () => Promise<Record<string, unknown>> {
    switch (skillId) {
      case "check_warehouse_inventory":
        return async () => {
          await this.simulateDelay(300);
          const inventoryItem = MOCK_INVENTORY["macbook-pro-16"];
          return {
            item: (parameters.item as string) || context.request.item || inventoryItem.name,
            inStock: true,
            quantity: inventoryItem.quantity,
            warehouse: inventoryItem.warehouse,
            location: "Aisle 4, Shelf B",
          };
        };

      case "create_shipment":
        return async () => {
          await this.simulateDelay(500);
          const shipmentId = generateShipmentId();
          const trackingNumber = generateTrackingNumber();
          return {
            shipmentId,
            trackingNumber,
            orderId: context.request.orderId,
            item: context.request.item,
            status: "created",
            carrier: "FedEx",
            estimatedDelivery: new Date(
              Date.now() + 5 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          };
        };

      case "generate_shipping_label":
        return async () => {
          await this.simulateDelay(400);
          const shipmentId =
            (parameters.shipmentId as string) ||
            context.shipmentResult?.shipmentId ||
            "UNKNOWN";
          const trackingNumber =
            (parameters.trackingNumber as string) ||
            context.shipmentResult?.trackingNumber ||
            "UNKNOWN";
          return {
            shipmentId,
            trackingNumber,
            carrier: "FedEx",
            labelUrl: `https://shipping.example.com/labels/${shipmentId}.pdf`,
            barcode: `*${trackingNumber}*`,
          };
        };

      case "process_return":
        return async () => {
          await this.simulateDelay(400);
          return {
            returnId: `RET-${Date.now()}`,
            orderId: context.request.orderId,
            status: "return_initiated",
            returnLabel: `https://shipping.example.com/returns/RET-${Date.now()}.pdf`,
          };
        };

      case "update_tracking":
        return async () => {
          await this.simulateDelay(200);
          return {
            shipmentId: parameters.shipmentId || context.shipmentResult?.shipmentId,
            status: parameters.status || "in_transit",
            updatedAt: new Date().toISOString(),
          };
        };

      default:
        return async () => ({ error: `Unknown skill: ${skillId}` });
    }
  }

  private updateContextFromSkillResult(
    context: FulfillmentTaskContext,
    skillId: string,
    result: unknown,
  ): void {
    const res = result as Record<string, unknown>;

    if (skillId === "check_warehouse_inventory" && res && !res.error) {
      context.inventoryChecked = true;
      context.inventoryResult = res;
    }

    if (skillId === "create_shipment" && res && !res.error) {
      context.shipmentCreated = true;
      context.shipmentResult = {
        shipmentId: res.shipmentId as string,
        trackingNumber: res.trackingNumber as string,
      };
    }

    if (skillId === "generate_shipping_label" && res && !res.error) {
      context.labelGenerated = true;
    }
  }

  private extractRequest(message: Message): FulfillmentRequest {
    for (const part of message.parts) {
      if (part.kind === "data" && part.data) {
        const data = part.data as Record<string, unknown>;

        let sessionId = data.sessionId as string | undefined;
        if (
          !sessionId &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).sessionId
        ) {
          sessionId = (data.ticket as Record<string, unknown>)
            .sessionId as string;
        }

        let orderId = data.orderId as string | undefined;
        if (
          !orderId &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).orderId
        ) {
          orderId = (data.ticket as Record<string, unknown>).orderId as string;
        }

        let customerEmail = data.customerEmail as string | undefined;
        if (
          !customerEmail &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).customerEmail
        ) {
          customerEmail = (data.ticket as Record<string, unknown>)
            .customerEmail as string;
        }

        let ticketId = data.ticketId as string | undefined;
        if (
          !ticketId &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).ticketId
        ) {
          ticketId = (data.ticket as Record<string, unknown>)
            .ticketId as string;
        }

        const action = (data.action ||
          data._messageType ||
          "create_shipment") as FulfillmentRequest["action"];

        return {
          action,
          sessionId,
          orderId: orderId || "UNKNOWN",
          item: data.item as string | undefined,
          customerEmail,
          ticketId,
        };
      }
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          return {
            action: parsed.action || "create_shipment",
            sessionId: parsed.sessionId || parsed.ticket?.sessionId,
            orderId: parsed.orderId || parsed.ticket?.orderId || "UNKNOWN",
            item: parsed.item,
            customerEmail: parsed.customerEmail || parsed.ticket?.customerEmail,
            ticketId: parsed.ticketId || parsed.ticket?.ticketId,
          };
        } catch {
          // Not JSON
        }
      }
    }

    return {
      action: "create_shipment",
      orderId: "UNKNOWN",
    };
  }
}
