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
      "Give the connector a descriptive name so your team can identify it later (for example, fortanix-prod). The description is optional but useful when you manage more than one HSM."
  },
  {
    name: "Connection",
    shortDescription: "Gateway that reaches the HSM",
    title: "Connection",
    subtitle: "Choose the Gateway that connects Infisical to your HSM.",
    rightLabel: "CONNECTION",
    rightDescription:
      "Select which Gateway will route key operations to your HSM. Only Gateways with PKCS#11 support enabled appear in the list."
  },
  {
    name: "Credentials",
    shortDescription: "Slot and PIN",
    title: "Credentials",
    subtitle: "How Infisical signs in to your HSM.",
    rightLabel: "CREDENTIALS",
    rightDescription:
      "The slot label is the PKCS#11 token label of the slot Infisical will use on the HSM. The PIN authenticates Infisical to that slot. The key label prefix is prepended to every key Infisical creates so you can identify them in your HSM tooling."
  }
];
