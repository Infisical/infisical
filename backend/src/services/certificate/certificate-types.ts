import { TProjectPermission } from "@app/lib/types";

export type TGetCertDTO = {
  certId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertDTO = {
  certId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertCertDTO = {
  certId: string;
} & Omit<TProjectPermission, "projectId">;
