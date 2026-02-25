import { Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { BaseAgentExecutor } from "../../shared/base-executor.js";
import { ActionContext } from "../../governance/index.js";
import { FULFILLMENT_SKILLS } from "../../shared/skills.js";
import {
  generateTrackingNumber,
  generateShipmentId,
  MOCK_INVENTORY,
} from "../../shared/mock-data.js";

interface FulfillmentRequest {
  action: "reship_correct_item" | "create_shipment" | "process_return";
  sessionId?: string; // For unified audit trail
  orderId: string;
  item?: string;
  customerEmail?: string;
}

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

    this.log("Received fulfillment request", {
      sessionId: request.sessionId,
      action: request.action,
      orderId: request.orderId,
    });

    const governanceContext: ActionContext = {
      sessionId: request.sessionId, // Propagate sessionId for unified audit trail
      orderId: request.orderId,
      customerEmail: request.customerEmail,
    };

    const inventoryResult = await this.checkWarehouseInventory(
      eventBus,
      taskId,
      contextId,
      request,
      governanceContext,
    );

    const shipmentResult = await this.createShipment(
      eventBus,
      taskId,
      contextId,
      request,
      governanceContext,
    );

    if (shipmentResult) {
      await this.generateShippingLabel(
        eventBus,
        taskId,
        contextId,
        request,
        shipmentResult,
        governanceContext,
      );

      await this.attemptCustomerContact(
        eventBus,
        taskId,
        contextId,
        request,
        shipmentResult,
        governanceContext,
      );

      this.publishMessage(
        eventBus,
        JSON.stringify({
          action: "fulfillment_complete",
          orderId: request.orderId,
          shipmentId: shipmentResult.shipmentId,
          trackingNumber: shipmentResult.trackingNumber,
          status: "shipped",
        }),
      );
    }
  }

  private extractRequest(message: Message): FulfillmentRequest {
    for (const part of message.parts) {
      // Handle data parts (from agent-to-agent forwarding)
      if (part.kind === "data" && part.data) {
        const data = part.data as Record<string, unknown>;

        // Extract sessionId from various possible locations
        let sessionId = data.sessionId as string | undefined;
        if (
          !sessionId &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).sessionId
        ) {
          sessionId = (data.ticket as Record<string, unknown>)
            .sessionId as string;
        }

        // Extract orderId from various locations
        let orderId = data.orderId as string | undefined;
        if (
          !orderId &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).orderId
        ) {
          orderId = (data.ticket as Record<string, unknown>).orderId as string;
        }

        // Extract customerEmail
        let customerEmail = data.customerEmail as string | undefined;
        if (
          !customerEmail &&
          data.ticket &&
          (data.ticket as Record<string, unknown>).customerEmail
        ) {
          customerEmail = (data.ticket as Record<string, unknown>)
            .customerEmail as string;
        }

        // Determine action from message type or explicit action field
        const action = (data.action ||
          data._messageType ||
          "create_shipment") as FulfillmentRequest["action"];

        return {
          action,
          sessionId,
          orderId: orderId || "UNKNOWN",
          item: data.item as string | undefined,
          customerEmail,
        };
      }
      // Handle text parts (legacy/direct calls)
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          return {
            action: parsed.action || "create_shipment",
            sessionId: parsed.sessionId || parsed.ticket?.sessionId,
            orderId: parsed.orderId || parsed.ticket?.orderId || "UNKNOWN",
            item: parsed.item,
            customerEmail: parsed.customerEmail || parsed.ticket?.customerEmail,
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

  private async checkWarehouseInventory(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: FulfillmentRequest,
    governanceContext: ActionContext,
  ): Promise<boolean> {
    this.log("SKILL: check_warehouse_inventory", { item: request.item });

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "check_warehouse_inventory",
      { item: request.item, orderId: request.orderId },
      governanceContext,
      async () => {
        await this.simulateDelay(300);
        const inventoryItem = MOCK_INVENTORY["macbook-pro-16"];
        return {
          item: request.item || inventoryItem.name,
          inStock: true,
          quantity: inventoryItem.quantity,
          warehouse: inventoryItem.warehouse,
          location: "Aisle 4, Shelf B",
        };
      },
    );

    return result.allowed;
  }

  private async createShipment(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: FulfillmentRequest,
    governanceContext: ActionContext,
  ): Promise<{ shipmentId: string; trackingNumber: string } | null> {
    this.log("SKILL: create_shipment", { orderId: request.orderId });

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "create_shipment",
      { orderId: request.orderId, item: request.item },
      governanceContext,
      async () => {
        await this.simulateDelay(500);
        const shipmentId = generateShipmentId();
        const trackingNumber = generateTrackingNumber();
        return {
          shipmentId,
          trackingNumber,
          orderId: request.orderId,
          item: request.item,
          status: "created",
          carrier: "FedEx",
          estimatedDelivery: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        };
      },
    );

    if (!result.allowed) return null;

    return {
      shipmentId: result.result.shipmentId,
      trackingNumber: result.result.trackingNumber,
    };
  }

  private async generateShippingLabel(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: FulfillmentRequest,
    shipmentResult: { shipmentId: string; trackingNumber: string },
    governanceContext: ActionContext,
  ): Promise<void> {
    this.log("SKILL: generate_shipping_label", {
      shipmentId: shipmentResult.shipmentId,
    });

    await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "generate_shipping_label",
      {
        shipmentId: shipmentResult.shipmentId,
        trackingNumber: shipmentResult.trackingNumber,
      },
      governanceContext,
      async () => {
        await this.simulateDelay(400);
        return {
          shipmentId: shipmentResult.shipmentId,
          trackingNumber: shipmentResult.trackingNumber,
          carrier: "FedEx",
          labelUrl: `https://shipping.example.com/labels/${shipmentResult.shipmentId}.pdf`,
          barcode: `*${shipmentResult.trackingNumber}*`,
        };
      },
    );

    this.log("Shipping label generated", {
      trackingNumber: shipmentResult.trackingNumber,
    });
  }

  private async attemptCustomerContact(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    request: FulfillmentRequest,
    shipmentResult: { shipmentId: string; trackingNumber: string },
    governanceContext: ActionContext,
  ): Promise<void> {
    this.log("SKILL: contact_customer (ATTEMPTING)", {
      reason: "Send tracking number directly to customer",
    });

    const result = await this.governedSkillExecution(
      eventBus,
      taskId,
      contextId,
      "contact_customer",
      {
        customerEmail: request.customerEmail,
        trackingNumber: shipmentResult.trackingNumber,
      },
      governanceContext,
      async () => {
        await this.simulateDelay(200);
        return { sent: true };
      },
    );

    if (!result.allowed) {
      this.log("SKILL: contact_customer DENIED by structured policy", {
        reason:
          "Not in allowed_actions - tracking info included in task response",
      });
    }
  }
}
