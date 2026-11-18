import { TActorInput } from "@app/lib/types";

export type TCreateEnvDTO = {
  name: string;
  slug: string;
  position?: number;
  projectId: string;
} & TActorInput;

export type TUpdateEnvDTO = {
  id: string;
  name?: string;
  slug?: string;
  position?: number;
  projectId: string;
} & TActorInput;

export type TDeleteEnvDTO = {
  id: string;
  hardDelete?: boolean;
  projectId: string;
} & TActorInput;

export type TRestoreEnvDTO = {
  id: string;
  projectId: string;
} & TActorInput;

export type TReorderEnvDTO = {
  id: string;
  pos: number;
  projectId: string;
} & TActorInput;

export type TGetEnvDTO = {
  id: string;
} & TActorInput;

export type TGetEnvBySlugDTO = {
  slug: string;
  projectId: string;
} & TActorInput;
