import { AgentCard } from "@a2a-js/sdk";
import { AGENT_PORTS } from "./types.js";
import {
  TRIAGE_SKILLS,
  SUPPORT_SKILLS,
  FULFILLMENT_SKILLS,
  ESCALATION_SKILLS,
} from "./skills.js";

export const TRIAGE_AGENT_CARD: AgentCard = {
  name: "Triage Agent",
  description:
    "Receives all inbound customer tickets. Classifies issues, assigns severity, and routes to appropriate agents. Never handles issues directly.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${AGENT_PORTS.triage}/a2a/jsonrpc`,
  skills: TRIAGE_SKILLS,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text", "application/json"],
  defaultOutputModes: ["text", "application/json"],
};

export const SUPPORT_AGENT_CARD: AgentCard = {
  name: "Support Agent",
  description:
    "Frontline customer support worker. Handles order lookups, inventory checks, small refunds (up to $50), and customer communication. Escalates complex cases.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${AGENT_PORTS.support}/a2a/jsonrpc`,
  skills: SUPPORT_SKILLS,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text", "application/json"],
  defaultOutputModes: ["text", "application/json"],
};

export const FULFILLMENT_AGENT_CARD: AgentCard = {
  name: "Fulfillment Agent",
  description:
    "Manages physical warehouse operations. Creates shipments, processes returns, checks warehouse inventory. Never contacts customers directly.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${AGENT_PORTS.fulfillment}/a2a/jsonrpc`,
  skills: FULFILLMENT_SKILLS,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text", "application/json"],
  defaultOutputModes: ["text", "application/json"],
};

export const ESCALATION_AGENT_CARD: AgentCard = {
  name: "Escalation Agent",
  description:
    "Senior authority for complex cases. Reviews escalations, approves high-value refunds (up to $500), and overrides standard policy when justified.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${AGENT_PORTS.escalation}/a2a/jsonrpc`,
  skills: ESCALATION_SKILLS,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text", "application/json"],
  defaultOutputModes: ["text", "application/json"],
};

export const ALL_AGENT_CARDS = {
  triage: TRIAGE_AGENT_CARD,
  support: SUPPORT_AGENT_CARD,
  fulfillment: FULFILLMENT_AGENT_CARD,
  escalation: ESCALATION_AGENT_CARD,
};
