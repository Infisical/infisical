import { TOrgPermission } from "@app/lib/types";

export type TListOrgProjectsDTO = {
  limit?: number;
  offset?: number;
  search?: string;
} & Omit<TOrgPermission, "orgId">;

export type TAccessProjectDTO = {
  projectId: string;
} & Omit<TOrgPermission, "orgId">;
