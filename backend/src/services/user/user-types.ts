import { TOrgPermission } from "@app/lib/types";

export type TListUserGroupsDTO = {
  username: string;
} & Omit<TOrgPermission, "orgId">;

export enum UserEncryption {
  V1 = 1,
  V2 = 2
}
