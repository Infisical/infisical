import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ConnectionStep } from "./connectionSchema";

export const CONNECTION_DOCS_URL = AgentVaultDocsUrls.accessBundles;

type StepMeta = {
  step: ConnectionStep;
  name: string;
  shortDescription?: string;
  title?: string;
  subtitle?: string;
  rightLabel?: string;
  rightDescription?: string;
};

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
    rightDescription: "Review your settings before saving."
  }
];
