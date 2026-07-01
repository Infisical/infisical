export type TEnsureRecoveryCodesDTO = {
  userId: string;
};

export type TGetRecoveryCodesDTO = {
  userId: string;
};

export type TVerifyAndConsumeRecoveryCodeDTO = {
  userId: string;
  recoveryCode: string;
};

export type TRotateRecoveryCodesDTO = {
  userId: string;
};

export type TDeleteRecoveryCodesDTO = {
  userId: string;
};
