export type WizardState = {
  name: string;
  description: string;
  reachedFrom: string;
  slotLabel: string;
  pin: string;
  keyNamePrefix: string;
};

export const INITIAL_WIZARD_STATE: WizardState = {
  name: "",
  description: "",
  reachedFrom: "",
  slotLabel: "",
  pin: "",
  keyNamePrefix: "infisical-"
};

export type WizardStep = {
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
};

export const STEPS: WizardStep[] = [
  {
    name: "Basics",
    shortDescription: "Name and description",
    title: "Basics",
    subtitle: "A descriptive name and what this HSM is for.",
    rightLabel: "BASICS",
    rightDescription:
      "Give the connector a descriptive name so your team can identify it later (for example, fortanix-prod for production code-signing keys). The description is optional but useful when you manage more than one HSM."
  },
  {
    name: "Reached from",
    shortDescription: "Which Gateway reaches the HSM",
    title: "Reached from",
    subtitle: "Pick the Infisical Gateway that will reach the HSM over PKCS#11.",
    rightLabel: "REACHED FROM",
    rightDescription:
      "Infisical never talks to the HSM directly. A Gateway you run inside your network does, using your HSM vendor's PKCS#11 library. Only Gateways started with --pkcs11-module appear here. If the list is empty, start a Gateway pointed at your HSM's PKCS#11 library first."
  },
  {
    name: "Access",
    shortDescription: "Slot and PIN",
    title: "Access",
    subtitle: "How Infisical signs in to your HSM.",
    rightLabel: "ACCESS",
    rightDescription:
      "The slot label is the PKCS#11 token label of the slot on the HSM where signing keys will live. The PIN authenticates Infisical to that slot. The key label prefix is prepended to every key Infisical creates so you can identify them in your HSM tooling."
  }
];
