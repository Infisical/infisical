import { TProjectPermission } from "@app/lib/types";

export type TInventoryViewFilters = {
  status?: string;
  notAfterTo?: Date;
  notAfterFrom?: Date;
  notBeforeTo?: Date;
  notBeforeFrom?: Date;
  enrollmentTypes?: string[];
  keyAlgorithm?: string | string[];
  keySizes?: number[];
  caIds?: string[];
  profileIds?: string[];
  source?: string | string[];
};

export type TListInventoryViewsDTO = {
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateInventoryViewDTO = {
  projectId: string;
  name: string;
  filters: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateInventoryViewDTO = {
  viewId: string;
  projectId: string;
  name?: string;
  filters?: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteInventoryViewDTO = {
  viewId: string;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;
