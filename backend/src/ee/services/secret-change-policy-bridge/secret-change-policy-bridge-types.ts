import { Knex } from "knex";

import { TProjectEnvironments, TSecretApprovalPolicies } from "@app/db/schemas";

import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetBoardSapDTO,
  TGetSapByIdDTO,
  TListSapDTO,
  TUpdateSapDTO
} from "../secret-approval-policy/secret-approval-policy-types";

export type TSecretChangePolicyEnvironment = Pick<TProjectEnvironments, "id" | "name" | "slug">;

export type TSecretChangePolicy = TSecretApprovalPolicies & {
  projectId: string;
  environments: TSecretChangePolicyEnvironment[];
  environment: TSecretChangePolicyEnvironment;
};

export type TSecretChangePolicyBridgeMethods = {
  createSecretChangePolicy: (dto: TCreateSapDTO) => Promise<TSecretChangePolicy>;
  updateSecretChangePolicy: (dto: TUpdateSapDTO) => Promise<TSecretChangePolicy>;
  deleteSecretChangePolicy: (dto: TDeleteSapDTO) => Promise<TSecretChangePolicy>;
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
