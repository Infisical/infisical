import { PolicyType } from "@app/hooks/api/policies/enums";

export const policyDetails: Record<PolicyType, { name: string; className: string }> = {
  [PolicyType.AccessPolicy]: {
    className: "bg-green/20 text-green",
    name: "Access Policy"
  },
  [PolicyType.ChangePolicy]: {
    className: "bg-yellow/20 text-yellow",
    name: "Change Policy"
  }
};
