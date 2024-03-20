import { TOrgPermission } from "@app/lib/types";

export type TCreateGroupDTO = {
  name: string;
  slug: string;
  role: string;
} & TOrgPermission;

export type TUpdateGroupDTO = {
  currentSlug: string;
} & Partial<{
  name: string;
  slug: string;
  role: string;
}> &
  TOrgPermission;

export type TDeleteGroupDTO = {
  groupSlug: string;
} & TOrgPermission;

export type TGetGroupUserMembershipsDTO = {
  slug: string;
} & TOrgPermission;

export type TCreateGroupUserMembershipDTO = {
  groupSlug: string;
  username: string;
} & TOrgPermission;

export type TDeleteGroupUserMembershipDTO = {
  groupSlug: string;
  username: string;
} & TOrgPermission;
