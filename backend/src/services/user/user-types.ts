import { MfaMethod } from "@app/lib/auth/actor-types";
import { TActorInput } from "@app/lib/types";

export type TListUserGroupsDTO = {
  username: string;
} & TActorInput;

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

export type TUpdateUserEmailDTO = {
  userId: string;
  newEmail: string;
};

export type TVerifyCurrentEmailOTPDTO = {
  userId: string;
  otpCode: string;
};
