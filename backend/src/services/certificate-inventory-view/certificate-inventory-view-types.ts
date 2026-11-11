import { TActorInput } from "@app/lib/types";

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
  applicationIds?: string[];
  source?: string | string[];
  includeDeleted?: boolean;
};

export type TListInventoryViewsDTO = {
  projectId: string;
  applicationId?: string;
} & TActorInput;

export type TCreateInventoryViewDTO = {
  projectId: string;
  applicationId?: string;
  name: string;
  filters: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
} & TActorInput;

export type TUpdateInventoryViewDTO = {
  viewId: string;
  projectId: string;
  name?: string;
  filters?: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
} & TActorInput;

export type TDeleteInventoryViewDTO = {
  viewId: string;
  projectId: string;
} & TActorInput;
