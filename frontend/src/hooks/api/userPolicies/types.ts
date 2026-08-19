import { TPolicyRule, TPolicyRuleInput } from "../agentPolicies/types";

export type TUserPolicyUser = {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type TUserPolicy = {
  id: string;
  projectId: string;
  name: string;
  target: string;
  createdAt: string;
  updatedAt: string;
  users: TUserPolicyUser[];
  rules: TPolicyRule[];
};

export type TCreateUserPolicyDTO = {
  projectId: string;
  name: string;
  target: string;
  userIds: string[];
  rules: TPolicyRuleInput[];
};

export type TUpdateUserPolicyDTO = {
  policyId: string;
  projectId: string;
  name?: string;
  userIds?: string[];
  rules?: TPolicyRuleInput[];
};
