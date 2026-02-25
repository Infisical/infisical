export type Agent = {
  id: string;
  name: string;
  icon: string;
};

export type DemoEvent = {
  id: string;
  agentId: string;
  targetAgentId?: string;
  action: string;
  details: string;
  status: "approved" | "denied";
  reasoning: string;
  timestamp: number;
};

export const AGENTS: Agent[] = [
  { id: "triage", name: "Triage", icon: "Stethoscope" },
  { id: "support", name: "Support", icon: "Headset" },
  { id: "escalation", name: "Escalation", icon: "AlertTriangle" },
  { id: "fulfillment", name: "Fulfillment", icon: "PackageCheck" }
];

export const DEMO_EVENTS: DemoEvent[] = [
  {
    id: "evt-1",
    agentId: "triage",
    action: "classify_ticket",
    details: "Ticket #4021 — Billing Inquiry",
    status: "approved",
    reasoning: "Classification matches allowed categories.",
    timestamp: 3
  },
  {
    id: "evt-2",
    agentId: "triage",
    targetAgentId: "support",
    action: "route_to_support",
    details: "Route Ticket #4021 to Support",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: 8
  },
  {
    id: "evt-3",
    agentId: "support",
    action: "request_reship",
    details: "Reship Item SKU-992",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: 14
  },
  {
    id: "evt-4",
    agentId: "support",
    action: "issue_credit",
    details: "$15 Courtesy Credit",
    status: "approved",
    reasoning: "Amount $15 is under $50 threshold.",
    timestamp: 19
  },
  {
    id: "evt-5",
    agentId: "support",
    action: "issue_refund",
    details: "$200 Full Refund",
    status: "denied",
    reasoning: "Refund denied: customer waited 0 days, does not meet 7-day threshold.",
    timestamp: 22
  },
  {
    id: "evt-6",
    agentId: "support",
    targetAgentId: "escalation",
    action: "escalate_case",
    details: "Request Refund Approval",
    status: "approved",
    reasoning: "Communication path allowed.",
    timestamp: 25
  },
  {
    id: "evt-7",
    agentId: "fulfillment",
    action: "check_inventory",
    details: "SKU-992 Stock Check",
    status: "approved",
    reasoning: "Read-only inventory access permitted.",
    timestamp: 28
  },
  {
    id: "evt-8",
    agentId: "escalation",
    action: "approve_refund",
    details: "$200 Refund Override",
    status: "approved",
    reasoning: "Escalation agent has override authority for amounts under $500.",
    timestamp: 32
  }
];
