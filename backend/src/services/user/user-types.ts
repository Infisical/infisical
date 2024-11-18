import { TOrgPermission } from "@app/lib/types";

import { MfaMethod } from "../auth/auth-type";

export type TListUserGroupsDTO = {
  username: string;
} & Omit<TOrgPermission, "orgId">;

export enum UserEncryption {
  V1 = 1,
  V2 = 2
}

export type TUpdateUserMfaDTO = {
  userId: string;
  isMfaEnabled?: boolean;
  selectedMfaMethod?: MfaMethod;
};
