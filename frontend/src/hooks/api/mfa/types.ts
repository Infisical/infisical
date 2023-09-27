import { User } from "../users/types";

export type EnableMfaEmailResponse = boolean;

export type DisableMfaEmailResponse = boolean;

export type EnableAuthAppMfaStep1Response = string;

export type EnableAuthAppMfaStep2Params = {
  userTotp: string;
};
export type EnableAuthAppMfaStep2Response = boolean;

export type DisableMfaAuthAppResponse = boolean;

export type CreateNewMfaRecoveryCodesResponse = string[];

export type GetMyMfaRecoveryCodesResponse = string[];

export type UpdateMfaPreferenceParams = {
  mfaPreference: User["mfaPreference"];
};

export type UpdateMfaPreferenceResponse = boolean;
