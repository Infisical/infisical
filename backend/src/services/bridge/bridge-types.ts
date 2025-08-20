import { OrgServiceActor } from "@app/lib/types";

export type TBridgeRule = {
  field: string;
  operator: string;
  value: string;
};

export type TCreateBridgeDTO = {
  projectPermission: OrgServiceActor;
  projectId: string;
  baseUrl: string;
  openApiUrl: string;
  ruleSet?: TBridgeRule[][];
  slug: string;
  headers: { key: string; value: string }[];
};

export type TUpdateBridgeDTO = {
  projectPermission: OrgServiceActor;
  baseUrl?: string;
  slug?: string;
  openApiUrl?: string;
  ruleSet?: TBridgeRule[][];
  headers?: { key: string; value: string }[];
  id: string;
};

export type TDeleteBridgeDTO = {
  projectPermission: OrgServiceActor;
  id: string;
};

export type TListBridgeDTO = {
  projectPermission: OrgServiceActor;
  projectId: string;
};

export type TGetBridgeDTO = {
  id: string;
};

export type TGetBridgeBySlugDTO = {
  projectId: string;
  slug: string;
};
