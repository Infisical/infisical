import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ServiceStep } from "./serviceSchema";

export const SERVICE_DOCS_URL = AgentVaultDocsUrls.accessBundles;

type StepMeta = {
  step: ServiceStep;
  name: string;
  shortDescription?: string;
  title?: string;
  subtitle?: string;
  rightLabel?: string;
  rightDescription?: string;
};

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
      "The credentials are only used for the hosts you list here. Every path is allowed unless you name the ones you want."
  },
  {
    step: ServiceStep.Credential,
    name: "Credential",
    shortDescription: "How to authenticate",
    title: "Credential",
    subtitle: "How requests to this service are authenticated.",
    rightLabel: "CREDENTIAL",
    rightDescription: "Agents reach this service without ever holding the credentials themselves."
  },
  {
    step: ServiceStep.Transformations,
    name: "Transformations",
    shortDescription: "Custom headers and substitutions",
    title: "Transformations",
    subtitle: "Custom headers and placeholder swaps. Skip this if you don't need them.",
    rightLabel: "TRANSFORMATIONS",
    rightDescription:
      "Custom headers are added to every request to this service. A substitution swaps a placeholder your agent already sends for the real value."
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
