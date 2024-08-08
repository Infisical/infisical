import { TProjectPermission } from "@app/lib/types";

export type TCreatePkiCollectionDTO = {
  name: string;
} & TProjectPermission;

export type TGetPkiCollectionByIdDTO = {
  collectionId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdatePkiCollectionDTO = {
  collectionId: string;
  name?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeletePkiCollectionDTO = {
  collectionId: string;
} & Omit<TProjectPermission, "projectId">;
