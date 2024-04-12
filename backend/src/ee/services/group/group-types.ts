import { TGenericPermission } from "@app/lib/types";

export type TCreateGroupDTO = {
  name: string;
  slug?: string;
  role: string;
} & TGenericPermission;

export type TUpdateGroupDTO = {
  currentSlug: string;
} & Partial<{
  name: string;
  slug: string;
  role: string;
}> &
  TGenericPermission;

export type TDeleteGroupDTO = {
  groupSlug: string;
} & TGenericPermission;

export type TListGroupUsersDTO = {
  groupSlug: string;
  offset: number;
  limit: number;
  username?: string;
} & TGenericPermission;

export type TAddUserToGroupDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;

export type TRemoveUserFromGroupDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;
