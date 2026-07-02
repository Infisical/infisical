import { FingerprintIcon, LucideIcon, MailIcon, SmartphoneIcon } from "lucide-react";

import { MfaMethod } from "@app/hooks/api/auth/types";

export type MfaMethodOption = {
  value: MfaMethod;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const MFA_METHOD_OPTIONS: MfaMethodOption[] = [
  {
    value: MfaMethod.TOTP,
    label: "Authenticator app",
    description: "Use a TOTP app like 1Password or Authy.",
    icon: SmartphoneIcon
  },
  {
    value: MfaMethod.EMAIL,
    label: "Email",
    description: "Receive one-time codes by email.",
    icon: MailIcon
  },
  {
    value: MfaMethod.WEBAUTHN,
    label: "Passkey",
    description: "Use Face ID, Touch ID, a security key, or your device.",
    icon: FingerprintIcon
  }
];

export const MFA_METHOD_LABELS: Record<MfaMethod, string> = {
  [MfaMethod.TOTP]: "Authenticator app",
  [MfaMethod.EMAIL]: "Email",
  [MfaMethod.WEBAUTHN]: "Passkey"
};

export type WizardStep = {
  key: "method" | "verify" | "recovery";
  title: string;
  description: string;
};

export const WIZARD_STEPS: WizardStep[] = [
  { key: "method", title: "Method", description: "Choose method" },
  { key: "verify", title: "Verify", description: "Confirm it works" },
  { key: "recovery", title: "Recovery", description: "Save backup codes" }
];
