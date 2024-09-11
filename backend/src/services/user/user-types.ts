import { TOrgPermission } from "@app/lib/types";

export type TListUserGroupsDTO = {
  username: string;
} & Omit<TOrgPermission, "orgId">;
