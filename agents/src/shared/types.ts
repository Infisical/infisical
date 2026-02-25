import { AgentCard } from "@a2a-js/sdk";

export interface CustomerTicket {
  ticketId: string;
  sessionId?: string; // Tracks all events across agents for this ticket workflow
  orderId: string;
  customerEmail: string;
  customerName: string;
  issueDescription: string;
  loyaltyStatus?: "standard" | "silver" | "gold" | "platinum";
  createdAt: Date;
  daysSinceCreated?: number;
}

export interface OrderInfo {
  orderId: string;
  customerEmail: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  status: "pending" | "shipped" | "delivered" | "returned";
  shippedItem?: string;
  expectedItem?: string;
  trackingNumber?: string;
  orderDate: Date;
}

export interface InventoryItem {
  sku: string;
  name: string;
  quantity: number;
  warehouse: string;
}

export interface ShipmentInfo {
  shipmentId: string;
  orderId: string;
  trackingNumber: string;
  status: "created" | "in_transit" | "delivered";
  carrier: string;
  estimatedDelivery: Date;
}

export interface RefundRequest {
  amount: number;
  reason: string;
  orderId: string;
  customerId: string;
}

export interface TicketClassification {
  category: "billing" | "shipping" | "product" | "account" | "other";
  severity: "low" | "medium" | "high" | "critical";
  requiresEscalation: boolean;
}

export interface SkillInvocation {
  skillId: string;
  agentId: string;
  timestamp: Date;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "executed";
  denialReason?: string;
  policyEvaluations?: PolicyEvaluation[];
}

export interface PolicyEvaluation {
  policyId: string;
  policyType: "structured" | "prompt";
  result: "allow" | "deny";
  reasoning?: string;
}

export interface AgentMessage {
  fromAgent: string;
  toAgent: string;
  messageType: "request" | "response" | "notification";
  content: Record<string, unknown>;
  timestamp: Date;
}

export type AgentRoleType = "triage" | "support" | "fulfillment" | "escalation";

export interface AgentConfig {
  agentId: string;
  role: AgentRoleType;
  port: number;
  agentCard: AgentCard;
}

export const AGENT_PORTS = {
  triage: 4001,
  support: 4002,
  fulfillment: 4003,
  escalation: 4004,
  orchestrator: 4000,
} as const;
