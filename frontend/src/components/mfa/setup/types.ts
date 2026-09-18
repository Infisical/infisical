import { FingerprintIcon, LucideIcon, MailIcon, SmartphoneIcon } from "lucide-react";

import { MfaMethod } from "@app/hooks/api/auth/types";

const MFA_METHOD_OPTIONS: { value: MfaMethod; label: string; icon: LucideIcon }[] = [
  {
    value: MfaMethod.TOTP,
    label: "Authenticator app",
    icon: SmartphoneIcon
  },
  {
    value: MfaMethod.EMAIL,
    label: "Email",
    icon: MailIcon
  },
  {
    value: MfaMethod.WEBAUTHN,
    label: "Passkey",
    icon: FingerprintIcon
  }
];

export const MFA_METHOD_LABELS = MFA_METHOD_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<MfaMethod, string>
);

export const MFA_METHOD_ICONS = MFA_METHOD_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.icon }),
  {} as Record<MfaMethod, LucideIcon>
);
