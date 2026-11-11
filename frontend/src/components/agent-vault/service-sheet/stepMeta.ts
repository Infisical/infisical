import { AgentVaultServiceType, TAgentVaultNativeServiceType } from "@app/hooks/api/agentVault";
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
      "Turning off All Tools asks the server for its list with the credential from the previous step. If members provide their own credential, enter a token or sign in with your own account to load the list. Infisical doesn't save it. To allow a tool the server doesn't list, type its exact name in Allowed Tools."
  },
  REVIEW_STEP
];

const NATIVE_STEP_COPY: Record<
  TAgentVaultNativeServiceType,
  { details: string; detailsRight: string; credential: string; credentialRight: string }
> = {
  [AgentVaultServiceType.Postgres]: {
    details: "What this service is called and the PostgreSQL database it connects to.",
    detailsRight:
      "The agent connects to this service by its name, and the proxy opens the connection to the database. The agent only ever reaches the database named here.",
    credential: "The database user the proxy logs in as.",
    credentialRight:
      "The proxy logs in to the database for the agent, so the agent never holds the password. What the agent can read or change is up to that user's privileges."
  },
  [AgentVaultServiceType.Mysql]: {
    details: "What this service is called and the MySQL server it connects to.",
    detailsRight:
      "The agent connects to this service by its name, and the proxy opens the connection to the server. The account's grants decide which databases the agent can use.",
    credential: "The MySQL account the proxy logs in as.",
    credentialRight:
      "The proxy logs in to the server for the agent, so the agent never holds the password. What the agent can read or change is up to that account's grants."
  },
  [AgentVaultServiceType.Ssh]: {
    details: "What this service is called and the server it connects to.",
    detailsRight:
      "The agent connects to this service by its name, and the proxy opens the SSH connection to the server.",
    credential: "The user the proxy logs in as, with a password or an SSH key.",
    credentialRight:
      "The proxy logs in to the server for the agent, so the agent never holds the password or the key. What the agent can run is up to that user's permissions on the server."
  }
};

export const nativeServiceSteps = (serviceType: TAgentVaultNativeServiceType): StepMeta[] => {
  const copy = NATIVE_STEP_COPY[serviceType];
  return [
    TEMPLATE_STEP,
    {
      step: ServiceStep.Details,
      name: "Details",
      shortDescription: "Name and server",
      title: "Details",
      subtitle: copy.details,
      rightLabel: "DETAILS",
      rightDescription: copy.detailsRight
    },
    {
      step: ServiceStep.Credential,
      name: "Credential",
      shortDescription: "How to log in",
      title: "Credential",
      subtitle: copy.credential,
      rightLabel: "CREDENTIAL",
      rightDescription: copy.credentialRight
    },
    REVIEW_STEP
  ];
};
