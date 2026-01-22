import { UserEncryptionVersion } from "../auth/types";

export type TSendAccountRecoveryEmailDTO = {
  email: string;
};

export type TVerifyAccountRecoveryEmailDTO = {
  email: string;
  code: string;
};

export type TVerifyAccountRecoveryEmailResponse = {
  token: string;
  userEncryptionVersion: UserEncryptionVersion;
};
