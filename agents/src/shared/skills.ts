import { AgentSkill } from '@a2a-js/sdk';

export const TRIAGE_SKILLS: AgentSkill[] = [
  {
    id: 'classify_ticket',
    name: 'Classify Ticket',
    description: 'Analyzes customer ticket content and classifies the issue type (billing, shipping, product, account)',
    tags: ['triage', 'classification'],
  },
  {
    id: 'assess_severity',
    name: 'Assess Severity',
    description: 'Evaluates ticket urgency and assigns severity level (low, medium, high, critical)',
    tags: ['triage', 'severity'],
  },
];

export const SUPPORT_SKILLS: AgentSkill[] = [
  {
    id: 'lookup_order_history',
    name: 'Lookup Order History',
    description: 'Retrieves customer order history and order details from the database',
    tags: ['support', 'orders', 'lookup'],
  },
  {
    id: 'check_inventory',
    name: 'Check Inventory',
    description: 'Checks current inventory levels for a specific product',
    tags: ['support', 'inventory'],
  },
  {
    id: 'issue_refund',
    name: 'Issue Refund',
    description: 'Processes a refund for a customer order. Subject to amount limits and policy checks.',
    tags: ['support', 'refund', 'financial'],
  },
  {
    id: 'access_payment_info',
    name: 'Access Payment Info',
    description: 'Retrieves customer payment information. Restricted to billing dispute investigations.',
    tags: ['support', 'payment', 'sensitive'],
  },
  {
    id: 'compose_response',
    name: 'Compose Response',
    description: 'Drafts a response message for the customer',
    tags: ['support', 'communication'],
  },
  {
    id: 'send_customer_email',
    name: 'Send Customer Email',
    description: 'Sends an email to the customer. Subject to quality checks.',
    tags: ['support', 'communication', 'email'],
  },
  {
    id: 'request_escalation',
    name: 'Request Escalation',
    description: 'Escalates the case to a senior agent for approval or review',
    tags: ['support', 'escalation'],
  },
];

export const FULFILLMENT_SKILLS: AgentSkill[] = [
  {
    id: 'create_shipment',
    name: 'Create Shipment',
    description: 'Creates a new shipment for an order',
    tags: ['fulfillment', 'shipping'],
  },
  {
    id: 'process_return',
    name: 'Process Return',
    description: 'Processes a return request for an order',
    tags: ['fulfillment', 'returns'],
  },
  {
    id: 'check_warehouse_inventory',
    name: 'Check Warehouse Inventory',
    description: 'Checks inventory levels at the warehouse',
    tags: ['fulfillment', 'inventory'],
  },
  {
    id: 'generate_shipping_label',
    name: 'Generate Shipping Label',
    description: 'Generates a shipping label with tracking number',
    tags: ['fulfillment', 'shipping', 'label'],
  },
  {
    id: 'update_tracking',
    name: 'Update Tracking',
    description: 'Updates shipment tracking information',
    tags: ['fulfillment', 'tracking'],
  },
];

export const ESCALATION_SKILLS: AgentSkill[] = [
  {
    id: 'review_case',
    name: 'Review Case',
    description: 'Reviews escalated case details and history',
    tags: ['escalation', 'review'],
  },
  {
    id: 'approve_refund',
    name: 'Approve Refund',
    description: 'Approves refunds up to $500 that exceed standard agent limits',
    tags: ['escalation', 'refund', 'approval'],
  },
  {
    id: 'override_policy',
    name: 'Override Policy',
    description: 'Overrides standard policy for exceptional circumstances',
    tags: ['escalation', 'override'],
  },
  {
    id: 'flag_for_human_review',
    name: 'Flag for Human Review',
    description: 'Flags case for human review when outside agent authority',
    tags: ['escalation', 'human-review'],
  },
];

export const ALL_SKILLS = {
  triage: TRIAGE_SKILLS,
  support: SUPPORT_SKILLS,
  fulfillment: FULFILLMENT_SKILLS,
  escalation: ESCALATION_SKILLS,
};
