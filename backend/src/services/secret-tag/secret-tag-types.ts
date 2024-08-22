import { TProjectPermission } from "@app/lib/types";

export type TCreateTagDTO = {
  color: string;
  slug: string;
} & TProjectPermission;

export type TUpdateTagDTO = {
  id: string;
  slug?: string;
  color?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetTagByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetTagBySlugDTO = {
  slug: string;
} & TProjectPermission;

export type TDeleteTagDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectTagsDTO = TProjectPermission;
