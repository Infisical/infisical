import { Knex } from "knex";

import { TProjectEnvironments, TSecretApprovalPolicies } from "@app/db/schemas";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetSapByIdDTO,
  TUpdateSapDTO
} from "../secret-approval-policy/secret-approval-policy-types";

export type TSecretChangePolicyEnvironment = Pick<TProjectEnvironments, "id" | "name" | "slug">;

export type TSecretChangePolicyApprover = { type: ApproverType; id: string; username?: string | null };
export type TSecretChangePolicyBypasser = { type: BypasserType; id: string; username?: string | null };

export type TSecretChangePolicy = TSecretApprovalPolicies & {
  projectId: string;
  environments: TSecretChangePolicyEnvironment[];
  environment: TSecretChangePolicyEnvironment;
  approvers: TSecretChangePolicyApprover[];
  bypassers: TSecretChangePolicyBypasser[];
  userApprovers: { userId: string }[];
};

export type TSecretChangePolicyBridgeMethods = {
  createSecretChangePolicy: (dto: TCreateSapDTO) => Promise<TSecretChangePolicy>;
  updateSecretChangePolicy: (dto: TUpdateSapDTO) => Promise<TSecretChangePolicy>;
  deleteSecretChangePolicy: (dto: TDeleteSapDTO) => Promise<TSecretChangePolicy>;
  findSecretChangePolicyById: (policyId: string, tx?: Knex) => Promise<TSecretChangePolicy | undefined>;
  findSecretChangePoliciesByEnvId: (envId: string, tx?: Knex) => Promise<TSecretChangePolicy[]>;
  findSecretChangePoliciesByProjectId: (projectId: string) => Promise<TSecretChangePolicy[]>;
  getSecretChangePolicyById: (dto: TGetSapByIdDTO) => Promise<TSecretChangePolicy>;
};
