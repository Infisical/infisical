import { PolicyType } from "@app/hooks/api/policies/enums";

export const policyDetails: Record<PolicyType, { name: string; className: string }> = {
  [PolicyType.AccessPolicy]: {
    className: "bg-lime-900 text-lime-100",
    name: "Access Policy"
  },
  [PolicyType.ChangePolicy]: {
    className: "bg-indigo-900 text-indigo-100",
    name: "Change Policy"
  }
};