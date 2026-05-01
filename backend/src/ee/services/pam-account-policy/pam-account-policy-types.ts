import { z } from "zod";

import { PolicyRulesBaseSchema } from "./pam-account-policy-schemas";

export type TPolicyRules = z.infer<typeof PolicyRulesBaseSchema>;

export type TCreatePamAccountPolicyDTO = {
  projectId: string;
  name: string;
  description?: string;
  rules: TPolicyRules;
};

export type TUpdatePamAccountPolicyDTO = {
  policyId: string;
  name?: string;
  description?: string | null;
  rules?: TPolicyRules;
  isActive?: boolean;
};

export type TDeletePamAccountPolicyDTO = {
  policyId: string;
};

export type TListPamAccountPoliciesDTO = {
  projectId: string;
  search?: string;
};

export type TGetPamAccountPolicyByIdDTO = {
  policyId: string;
};
