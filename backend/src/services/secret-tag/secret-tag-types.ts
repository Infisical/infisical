import { TActorInput } from "@app/lib/types";

export type TCreateTagDTO = {
  color: string;
  slug: string;
  projectId: string;
} & TActorInput;

export type TUpdateTagDTO = {
  id: string;
  slug?: string;
  color?: string;
} & TActorInput;

export type TGetTagByIdDTO = {
  id: string;
} & TActorInput;

export type TGetTagBySlugDTO = {
  slug: string;
  projectId: string;
} & TActorInput;

export type TDeleteTagDTO = {
  id: string;
} & TActorInput;

export type TListProjectTagsDTO = { projectId: string } & TActorInput;
