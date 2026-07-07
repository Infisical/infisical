import { TOrgPermission } from "@app/lib/types";

import { MfaMethod } from "../auth/auth-type";

export type TListUserGroupsDTO = {
  username: string;
} & Omit<TOrgPermission, "orgId">;

export enum UserEncryption {
  V1 = 1,
  V2 = 2
}

export type TActivateUserMfaDTO = {
  userId: string;
  selectedMfaMethod?: MfaMethod;
};

export type TDeactivateUserMfaDTO = {
  userId: string;
};

export type TSetSelectedMfaMethodDTO = {
  userId: string;
  selectedMfaMethod: MfaMethod;
};

export type TSendMfaEnrollmentEmailCodeDTO = {
  userId: string;
};

export type TVerifyMfaEnrollmentEmailCodeDTO = {
  userId: string;
  code: string;
};

export type TUpdateUserEmailDTO = {
  userId: string;
  newEmail: string;
};

export type TVerifyCurrentEmailOTPDTO = {
  userId: string;
  otpCode: string;
};
