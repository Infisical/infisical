import { RiskStatus } from "../../../ee/models";
import { IGitSecretBlindIndexData } from "../../../models";

interface BaseSecretScanningTypes {
  organizationId: string;
  gitSecret: string;
  gitSecrets: string[] | Set<string>;
  gitSecretBlindIndex: string;
  gitSecretBlindIndexData: IGitSecretBlindIndexData;
  gitSecretBlindIndexes?: Set<string> | string[];
  saltBytes: number;
  salt: string;
  status?: RiskStatus;
}

export type CreateGitSecretBlindIndexDataParams = Pick<BaseSecretScanningTypes, "organizationId">

export type CreateGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "saltBytes">

export type CreateGitSecretBlindIndexParams = Pick<BaseSecretScanningTypes, "gitSecret" | "salt">

export type CreateGitSecretBlindIndexWithSaltParams = Pick<BaseSecretScanningTypes, "gitSecret" | "salt">

export type CreateGitSecretBlindIndexesWithSaltParams = Pick<BaseSecretScanningTypes, "gitSecrets" | "salt">

export type CreateGitSecretsParams = Pick<BaseSecretScanningTypes, "gitSecrets" | "gitSecretBlindIndexes" | "organizationId" | "salt" | "status">

export type DecryptGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "gitSecretBlindIndexData">

export type EncryptGitSecretsParams = Pick<BaseSecretScanningTypes, "gitSecrets">

export type GetGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "organizationId">

export type GetGitSecretsParams = Pick<BaseSecretScanningTypes, "organizationId" | "status">

export type UpdateGitSecretParams = Pick<BaseSecretScanningTypes, "gitSecretBlindIndex" | "organizationId" | "status">

export type UpdateGitSecretsParams = Pick<BaseSecretScanningTypes, "gitSecretBlindIndexes" | "organizationId" | "status">
