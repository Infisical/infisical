import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { TProjectPermission } from "@app/lib/types";

import { SignerStatus, SigningOperationStatus } from "./signer-enums";

type TActorPermission = Omit<TProjectPermission, "projectId">;

export type TCreateSignerDTO = {
  name: string;
  description?: string;
  certificateId: string;
  approvalPolicyId?: string;
} & TProjectPermission;

export type TUpdateSignerDTO = {
  signerId: string;
  name?: string;
  description?: string | null;
  status?: SignerStatus;
  certificateId?: string;
  approvalPolicyId?: string | null;
} & TActorPermission;

export type TDeleteSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TGetSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TListSignersDTO = {
  offset?: number;
  limit?: number;
  search?: string;
} & TProjectPermission;

export type TSignDataDTO = {
  signerId: string;
  data: string;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
  actorName?: string;
  clientMetadata?: {
    tool?: string;
    hostname?: string;
    reportedIp?: string;
  };
} & TActorPermission;

export type TGetPublicKeyDTO = {
  signerId: string;
} & TActorPermission;

export type TListSigningOperationsDTO = {
  signerId: string;
  offset?: number;
  limit?: number;
  status?: SigningOperationStatus;
} & TActorPermission;
