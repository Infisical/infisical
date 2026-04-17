import { PamResourceType } from "@app/hooks/api/pam/enums";
import { PamAccountPolicyRuleType } from "@app/hooks/api/pam/types";

export const PAM_ACCOUNT_POLICY_RULE_SUPPORTED_RESOURCES: Record<
  PamAccountPolicyRuleType,
  PamResourceType[] | "all"
> = {
  [PamAccountPolicyRuleType.CommandBlocking]: [PamResourceType.SSH],
  [PamAccountPolicyRuleType.SessionLogMasking]: "all"
};

export const PAM_ACCOUNT_POLICY_RULE_METADATA: Record<
  PamAccountPolicyRuleType,
  { name: string; description: string }
> = {
  [PamAccountPolicyRuleType.CommandBlocking]: {
    name: "Command Blocking",
    description: "Block commands matching specified patterns"
  },
  [PamAccountPolicyRuleType.SessionLogMasking]: {
    name: "Session Log Masking",
    description: "Mask sensitive data in session logs matching specified patterns"
  }
};
