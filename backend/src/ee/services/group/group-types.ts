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
  slug: string;
} & TOrgPermission;
