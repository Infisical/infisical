import { IGitSecretBlindIndexData } from "../../../ee/models";

interface BaseSecretScanningTypes {
  organizationId: string;
  gitSecret: string;
  gitSecretBlindIndexData: IGitSecretBlindIndexData;
  saltBytes: number;
  salt: string;
}

export type CreateGitSecretBlindIndexDataParams = Pick<BaseSecretScanningTypes, "organizationId">

export type CreateGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "saltBytes">

export type CreateGitSecretBlindIndexParams = Pick<BaseSecretScanningTypes, "gitSecret" | "salt">

export type CreateGitSecretBlindIndexWithSaltParams = Pick<BaseSecretScanningTypes, "gitSecret" | "salt">

export type DecryptGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "gitSecretBlindIndexData">

export type EncryptGitSecretParams = Pick<BaseSecretScanningTypes, "gitSecret">

export type GetGitSecretBlindIndexSaltParams = Pick<BaseSecretScanningTypes, "organizationId">
