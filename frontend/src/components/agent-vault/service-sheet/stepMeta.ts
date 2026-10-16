import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ServiceStep } from "./serviceSchema";

export const SERVICE_DOCS_URL = AgentVaultDocsUrls.services;

type StepMeta = {
  step: ServiceStep;
  name: string;
  shortDescription?: string;
  title?: string;
  subtitle?: string;
  rightLabel?: string;
  rightDescription?: string;
  rightTip?: string;
};

const VARIABLE_TIP =
  "To use one of this bundle's variables, type {{ in any value and pick it from the list. The proxy puts the variable's value in its place.";

export const SERVICE_STEPS: StepMeta[] = [
  {
    step: ServiceStep.Template,
    name: "Template"
  },
  {
    step: ServiceStep.Details,
    name: "Details",
    shortDescription: "Name, hosts and rules",
    title: "Details",
    subtitle: "What this service is called, the hosts it covers, and the requests it allows.",
    rightLabel: "DETAILS",
    rightDescription:
      "The proxy only attaches the credential to requests that reach the hosts you list here. Every path is allowed unless you name the ones you want."
  },
  {
    step: ServiceStep.Credential,
    name: "Credential",
    shortDescription: "How to authenticate",
    title: "Credential",
    subtitle: "How requests to this service are authenticated, and anything else to add to them.",
    rightLabel: "CREDENTIAL",
    rightDescription:
      "Agents reach this service without ever holding the credential themselves. Custom headers go out on top of it, and a substitution swaps a placeholder your agent already sends for the real value.",
    rightTip: VARIABLE_TIP
  },
  {
    step: ServiceStep.Review,
    name: "Review",
    shortDescription: "Confirm and add",
    title: "Review",
    subtitle: "Check everything before you save. You can change it later.",
    rightLabel: "REVIEW",
    rightDescription: "Review your settings before saving."
  }
];

export const MCP_SERVICE_STEPS: StepMeta[] = [
  {
    step: ServiceStep.Template,
    name: "Template"
  },
  {
    step: ServiceStep.Details,
    name: "Details",
    shortDescription: "Name, transport and server",
    title: "Details",
    subtitle: "What this service is called and the MCP server it connects to.",
    rightLabel: "DETAILS",
    rightDescription:
      "The agent connects to this server through the proxy, which adds the credential. Tools come later: most servers only list them to an authenticated session."
  },
  {
    step: ServiceStep.Credential,
    name: "Credential",
    shortDescription: "How to authenticate",
    title: "Credential",
    subtitle: "How the proxy authenticates to this MCP server.",
    rightLabel: "CREDENTIAL",
    rightDescription:
      "The proxy authenticates to the MCP server for the agent. Infisical refreshes OAuth tokens automatically, and the agent never sees them. The agent can call any tool the server exposes to this credential.",
    rightTip: VARIABLE_TIP
  },
  {
    step: ServiceStep.Review,
    name: "Review",
    shortDescription: "Confirm and add",
    title: "Review",
    subtitle: "Check everything before you save. You can change it later.",
    rightLabel: "REVIEW",
    rightDescription: "Review your settings before saving."
  }
];
