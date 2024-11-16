export type TRegisterUserTotpDTO = {
  userId: string;
};

export type TVerifyUserTotpConfigDTO = {
  userId: string;
  totp: string;
};

export type TGetUserTotpConfigDTO = {
  userId: string;
};

export type TVerifyUserTotpDTO = {
  userId: string;
  totp: string;
};

export type TVerifyWithUserRecoveryCodeDTO = {
  userId: string;
  recoveryCode: string;
};

export type TDeleteUserTotpConfigDTO = {
  userId: string;
};

export type TCreateUserTotpRecoveryCodesDTO = {
  userId: string;
};
