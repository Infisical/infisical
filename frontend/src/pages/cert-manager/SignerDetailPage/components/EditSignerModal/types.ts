export type CaGroup = "internal" | "external";
export type CaOption = { id: string; name: string; groupType: CaGroup };

export type StepConfig = {
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
};

export const STEPS: StepConfig[] = [
  {
    name: "Basics",
    shortDescription: "Name and description",
    title: "Basics",
    subtitle: "A short name and what this signer is for.",
    rightLabel: "BASICS",
    rightDescription:
      "Update the signer's name and description so your team can recognize it. Changing these does not affect the certificate."
  },
  {
    name: "Certificate",
    shortDescription: "Validity and CA",
    title: "Certificate",
    subtitle: "The certificate behind this signer.",
    rightLabel: "CERTIFICATE",
    rightDescription:
      "Adjust how early to auto-renew, and which CA issues the certificate. Swapping the CA reissues the certificate right away."
  }
];
