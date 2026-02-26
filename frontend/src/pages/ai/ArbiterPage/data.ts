export type Agent = {
  id: string;
  name: string;
  icon: string;
  description: string;
  activity: string;
};

export type DemoEvent = {
  id: string;
  agentId: string;
  targetAgentId?: string;
  action: string;
  details: string;
  status: "approved" | "denied";
  reasoning: string;
  agentReasoning?: string;
  timestamp: string;
};

export const AGENTS: Agent[] = [
  {
    id: "triage_agent",
    name: "Triage Agent",
    icon: "BriefcaseMedical",
    description: "Classifies and routes incoming tickets to the appropriate agent.",
    activity: "classify_ticket, assess_severity, route_ticket"
  },
  {
    id: "support_agent",
    name: "Support Agent",
    icon: "Headset",
    description: "Handles customer inquiries, issues credits, and processes refunds.",
    activity:
      "lookup_order_history, check_inventory, issue_refund, access_payment_info, compose_response, send_customer_email, request_escalation"
  },
  {
    id: "escalation_agent",
    name: "Escalation Agent",
    icon: "AlertTriangle",
    description: "Reviews escalated cases and provides override authority.",
    activity: "review_case, approve_refund, override_policy, flag_for_human_review"
  },
  {
    id: "fulfillment_agent",
    name: "Fulfillment Agent",
    icon: "PackageCheck",
    description: "Manages inventory checks and order fulfillment.",
    activity:
      "create_shipment, process_return, check_warehouse_inventory, generate_shipping_label, update_tracking"
  }
];

export const DEMO_EVENTS: DemoEvent[] = [
  {
    id: "evt-1",
    agentId: "triage_agent",
    action: "classify_ticket",
    details: "Ticket #4021 — Billing Inquiry",
    status: "approved",
    reasoning: "Classification matches allowed categories.",
    timestamp: new Date(Date.now() - 30000).toISOString()
  },
  {
    id: "evt-2",
    agentId: "triage_agent",
    targetAgentId: "support_agent",
    action: "route_to_support",
    details: "Route Ticket #4021 to Support",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: new Date(Date.now() - 25000).toISOString()
  },
  {
    id: "evt-3",
    agentId: "support_agent",
    action: "request_reship",
    details: "Reship Item SKU-992",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: new Date(Date.now() - 20000).toISOString()
  },
  {
    id: "evt-4",
    agentId: "support_agent",
    action: "issue_credit",
    details: "$15 Courtesy Credit",
    status: "approved",
    reasoning: "Amount $15 is under $50 threshold.",
    timestamp: new Date(Date.now() - 15000).toISOString()
  },
  {
    id: "evt-5",
    agentId: "support_agent",
    action: "issue_refund",
    details: "$200 Full Refund",
    status: "denied",
    reasoning: "Refund denied: customer waited 0 days, does not meet 7-day threshold.",
    timestamp: new Date(Date.now() - 12000).toISOString()
  },
  {
    id: "evt-6",
    agentId: "support_agent",
    targetAgentId: "escalation_agent",
    action: "escalate_case",
    details: "Request Refund Approval",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: new Date(Date.now() - 9000).toISOString()
  },
  {
    id: "evt-7",
    agentId: "fulfillment_agent",
    action: "check_inventory",
    details: "SKU-992 Stock Check",
    status: "approved",
    reasoning: "Read-only inventory access permitted.",
    timestamp: new Date(Date.now() - 6000).toISOString()
  },
  {
    id: "evt-8",
    agentId: "escalation_agent",
    action: "approve_refund",
    details: "$200 Refund Override",
    status: "approved",
    reasoning: "Escalation agent has override authority for amounts under $500.",
    timestamp: new Date(Date.now() - 3000).toISOString()
  }
];
