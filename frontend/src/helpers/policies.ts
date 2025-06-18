import { PolicyType } from "@app/hooks/api/policies/enums";

export const policyDetails: Record<PolicyType, { name: string; className: string }> = {
  [PolicyType.AccessPolicy]: {
    className: "bg-yellow-500/40 text-mineshaft-100",
    name: "Access Policy"
  },
  [PolicyType.ChangePolicy]: {
    className: "bg-blue-500/40 text-mineshaft-100",
    name: "Change Policy"
  }
};
