import { Knex } from "knex";

export type TGetRecoveryCodesDTO = {
  userId: string;
};

export type TVerifyAndConsumeRecoveryCodeDTO = {
  userId: string;
  recoveryCode: string;
};

export type TRotateRecoveryCodesDTO = {
  userId: string;
  tx?: Knex;
};

export type TDeleteRecoveryCodesDTO = {
  userId: string;
  tx?: Knex;
};
