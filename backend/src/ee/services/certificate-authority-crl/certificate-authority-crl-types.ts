import { TProjectPermission } from "@app/lib/types";

export type TGetCrlById = string;

export type TGetCaCrlsDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;
