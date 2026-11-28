import { TActorContext } from "@app/domains/lib/actor-context";
import { OrderByDirection } from "@app/lib/types";

export enum SubOrgOrderBy {
  Name = "name"
}

export type TCreateSubOrgDTO = {
  name: string;
  slug?: string;
  actor: TActorContext;
};

export type TListSubOrgDTO = {
  actor: TActorContext;
  data: Partial<{
    limit?: number;
    offset?: number;
    search?: string;
    orderBy?: SubOrgOrderBy;
    orderDirection?: OrderByDirection;
    isAccessible?: boolean;
  }>;
};

export type TUpdateSubOrgDTO = {
  subOrgId: string;
  name?: string;
  slug?: string;
  actor: TActorContext;
};

export type TDeleteSubOrgDTO = {
  subOrgId: string;
  actor: TActorContext;
};

export type TJoinSubOrgDTO = {
  subOrgId: string;
  actor: TActorContext;
};
