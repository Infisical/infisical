import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";

import { PamAccountPolicyRuleType } from "./pam-account-policy-enums";

export const PAM_ACCOUNT_POLICY_RULE_SUPPORTED_RESOURCES: Record<PamAccountPolicyRuleType, PamResource[] | "all"> = {
  [PamAccountPolicyRuleType.CommandBlocking]: [PamResource.SSH],
  [PamAccountPolicyRuleType.SessionLogMasking]: "all"
};

export const PAM_ACCOUNT_POLICY_RULE_METADATA: Record<PamAccountPolicyRuleType, { name: string; description: string }> =
  {
    [PamAccountPolicyRuleType.CommandBlocking]: {
      name: "Command Blocking",
      description: "Block commands matching specified patterns"
    },
    [PamAccountPolicyRuleType.SessionLogMasking]: {
      name: "Session Log Masking",
      description: "Mask sensitive data in session logs matching specified patterns"
    }
  };
