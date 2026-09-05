import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ConnectionStep } from "./connectionSchema";

export const CONNECTION_DOCS_URL = AgentVaultDocsUrls.accessBundles;

type StepMeta = {
  step: ConnectionStep;
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
};

// Ordered as the form advances. Editing an existing connection drops the template step, since
// there is nothing left to pick.
export const CONNECTION_STEPS: StepMeta[] = [
  {
    step: ConnectionStep.Template,
    name: "Template",
    shortDescription: "Pick a service",
    title: "Choose a Service",
    subtitle: "Start from a known service, or configure the connection by hand.",
    rightLabel: "TEMPLATE",
    rightDescription:
      "A template fills in the hosts and the credential type for a service we already know, so you only supply the secret. Custom leaves every field blank."
  },
  {
    step: ConnectionStep.Details,
    name: "Details",
    shortDescription: "Name and hosts",
    title: "Details",
    subtitle: "What this connection is called, and the hosts it covers.",
    rightLabel: "DETAILS",
    rightDescription:
      "Every request an agent makes to these hosts gets the credential. Requests to anything else leave the proxy without it, so keep the list to the hosts the service actually answers on."
  },
  {
    step: ConnectionStep.Credential,
    name: "Credential",
    shortDescription: "What the proxy sends",
    title: "Credential",
    subtitle: "The secret the proxy attaches, and how it goes on the wire.",
    rightLabel: "CREDENTIAL",
    rightDescription:
      "The agent never holds this secret. The proxy attaches it as the request leaves, replacing whatever the agent sent under that header name."
  },
  {
    step: ConnectionStep.Review,
    name: "Review",
    shortDescription: "Confirm and add",
    title: "Review",
    subtitle: "Check what the proxy will send, and where.",
    rightLabel: "REVIEW",
    rightDescription:
      "Nothing here is final. Every field can be changed later from the bundle page, and the secret can be replaced without touching the rest."
  }
];
