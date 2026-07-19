import { ProxiedServiceStep } from "./schema";

export const PROXIED_SERVICE_QUICKSTART_URL =
  "https://infisical.com/docs/documentation/platform/agent-proxy/quickstart";

type StepMeta = {
  step: ProxiedServiceStep;
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
};

// Ordered as the form advances. The Header Rewrites step is skipped in linear navigation
// when it is empty (see the form orchestrators), but always stays in this list.
export const PROXIED_SERVICE_STEPS: StepMeta[] = [
  {
    step: ProxiedServiceStep.Details,
    name: "Details",
    shortDescription: "Name and host",
    title: "Service Details",
    subtitle: "Name the service and choose which hosts it brokers.",
    rightLabel: "DETAILS",
    rightDescription:
      "The name identifies this service within the folder. The host pattern decides which outbound requests the agent proxy applies these credentials to."
  },
  {
    step: ProxiedServiceStep.Headers,
    name: "Header Rewrites",
    shortDescription: "Request headers",
    title: "Header Rewrites",
    subtitle: "Set or overwrite request headers with a secret.",
    rightLabel: "HEADER REWRITES",
    rightDescription:
      "The proxy sets these headers on every outbound request, overwriting whatever the agent sent. Use this for Bearer tokens, API-key headers, or basic auth. Skip it if the credential is carried elsewhere."
  },
  {
    step: ProxiedServiceStep.Substitution,
    name: "Substitution",
    shortDescription: "Placeholder swaps",
    title: "Secret Substitution",
    subtitle: "Swap a placeholder the agent sends for the real secret.",
    rightLabel: "SUBSTITUTION",
    rightDescription:
      "Infisical hands the agent a placeholder as an environment variable; the proxy swaps it for the real secret wherever it appears in the surfaces you pick (path, query, header, body). Ideal when the credential sits in the URL or the agent's client validates its format."
  },
  {
    step: ProxiedServiceStep.Review,
    name: "Review",
    shortDescription: "Confirm",
    title: "Review",
    subtitle: "Confirm the configuration before saving.",
    rightLabel: "REVIEW",
    rightDescription:
      "Double-check the host pattern and each credential. You can edit any of this later from the folder view."
  }
];
