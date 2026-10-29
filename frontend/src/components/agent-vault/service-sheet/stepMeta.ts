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
  "To use a global variable, type {{ in any value and pick it from the list. The proxy puts the variable's value in its place. For a member-provided field, each member sets their own value, and can use their personal variables there.";
const MCP_VARIABLE_TIP =
  "To use a global variable in the token or a custom header value, type {{ and pick it from the list. The proxy puts the variable's value in its place. For OAuth, paste the client ID and client secret themselves.";

const TEMPLATE_STEP: StepMeta = { step: ServiceStep.Template, name: "Template" };

const REVIEW_STEP: StepMeta = {
  step: ServiceStep.Review,
  name: "Review",
  shortDescription: "Confirm and add",
  title: "Review",
  subtitle: "Check everything before you save. You can change it later.",
  rightLabel: "REVIEW",
  rightDescription: "Review your settings before saving."
};

export const SERVICE_STEPS: StepMeta[] = [
  TEMPLATE_STEP,
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
  REVIEW_STEP
];

export const MCP_SERVICE_STEPS: StepMeta[] = [
  TEMPLATE_STEP,
  {
    step: ServiceStep.Details,
    name: "Details",
    shortDescription: "Name, transport and server",
    title: "Details",
    subtitle: "What this service is called and the MCP server it connects to.",
    rightLabel: "DETAILS",
    rightDescription:
      "The agent connects to this server through the proxy, which adds the credential."
  },
  {
    step: ServiceStep.Credential,
    name: "Credential",
    shortDescription: "How to authenticate",
    title: "Credential",
    subtitle: "How the proxy authenticates to this MCP server.",
    rightLabel: "CREDENTIAL",
    rightDescription:
      "The proxy authenticates to the MCP server for the agent. You choose which of its tools the agent can call on the next step.",
    rightTip: MCP_VARIABLE_TIP
  },
  {
    step: ServiceStep.Tools,
    name: "Tools",
    shortDescription: "Tools agents can call",
    title: "Tools",
    subtitle: "Which of the server's tools agents can call through this service.",
    rightLabel: "TOOLS",
    rightDescription:
      "The proxy refuses a call to any tool that isn't selected and hides it from the agent's tool list. The rule applies to every member and session using this service.",
    rightTip:
      "Choosing Selected tools asks the server for its list with the credential from the previous step; Reload Tools asks again. A tool the server doesn't list, such as one the credential lacks the scope for, can be added by typing its exact name in the search field."
  },
  REVIEW_STEP
];
