import { Knex } from "knex";

import { TProjectEnvironments, TSecretApprovalPolicies } from "@app/db/schemas";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetBoardSapDTO,
  TGetSapByIdDTO,
  TListSapDTO,
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
  getSecretChangePolicy: (
    projectId: string,
    environment: string,
    path: string,
    tx?: Knex
  ) => Promise<TSecretChangePolicy | undefined>;
  getSecretChangePolicyByPaths: (
    projectId: string,
    environment: string,
    secretPaths: string[],
    tx?: Knex
  ) => Promise<Map<string, TSecretChangePolicy>>;
  getSecretChangePolicyByProjectId: (dto: TListSapDTO) => Promise<TSecretChangePolicy[]>;
  getSecretChangePolicyOfFolder: (dto: TGetBoardSapDTO) => Promise<TSecretChangePolicy | undefined>;
  getSecretChangePolicyById: (dto: TGetSapByIdDTO) => Promise<TSecretChangePolicy>;
};
