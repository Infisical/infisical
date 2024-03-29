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

export type TGetGroupUserMembershipsDTO = {
  groupSlug: string;
} & TGenericPermission;

export type TCreateGroupUserMembershipDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;

export type TDeleteGroupUserMembershipDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;
