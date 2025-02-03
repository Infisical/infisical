import { TProjectPermission } from "@app/lib/types";

import { KmipPermission } from "./kmip-enum";

export type TCreateKmipClientDTO = {
  name: string;
  description?: string;
  permissions: KmipPermission[];
} & TProjectPermission;

export type TUpdateKmipClientDTO = {
  id: string;
  name?: string;
  description?: string;
  permissions?: KmipPermission[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteKmipClientDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetKmipClientDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
