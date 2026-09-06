import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ConnectionStep } from "./connectionSchema";

export const CONNECTION_DOCS_URL = AgentVaultDocsUrls.accessBundles;

// The template step draws its own full-width layout, so it reads nothing past the rail's step name.
type StepMeta = {
  step: ConnectionStep;
  name: string;
  shortDescription?: string;
  title?: string;
  subtitle?: string;
  rightLabel?: string;
  rightDescription?: string;
};

// Ordered as the form advances. Editing an existing connection drops the template step, since
// there is nothing left to pick.
export const CONNECTION_STEPS: StepMeta[] = [
  {
    step: ConnectionStep.Template,
    name: "Template"
  },
  {
    step: ConnectionStep.Details,
    name: "Details",
    shortDescription: "Name and hosts",
    title: "Details",
    subtitle: "What this connection is called, and the hosts it covers.",
    rightLabel: "DETAILS",
    rightDescription: "The credentials are only used for the hosts you list here."
  },
  {
    step: ConnectionStep.Credential,
    name: "Credential",
    shortDescription: "How to authenticate",
    title: "Credential",
    subtitle: "How requests to this service are authenticated.",
    rightLabel: "CREDENTIAL",
    rightDescription: "Agents reach this service without ever holding the credentials themselves."
  },
  {
    step: ConnectionStep.Review,
    name: "Review",
    shortDescription: "Confirm and add",
    title: "Review",
    subtitle: "Check everything before you save. You can change it later.",
    rightLabel: "REVIEW",
    rightDescription: "Nothing is locked in. Edit this connection any time from the bundle page."
  }
];
