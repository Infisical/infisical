import { TProjectPermission } from "@app/lib/types";

export type TCreateTagDTO = {
  name: string;
  color: string;
  slug: string;
} & TProjectPermission;

export type TDeleteTagDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectTagsDTO = TProjectPermission;
