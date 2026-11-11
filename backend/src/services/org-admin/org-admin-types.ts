import { TActorInput } from "@app/lib/types";

export type TListOrgProjectsDTO = {
  limit?: number;
  offset?: number;
  search?: string;
} & TActorInput;

export type TAccessProjectDTO = {
  projectId: string;
} & TActorInput;
