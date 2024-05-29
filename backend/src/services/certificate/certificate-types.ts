import { TProjectPermission } from "@app/lib/types";

export enum TCertStatus {
  ACTIVE = "active",
  REVOKED = "revoked"
}

export type TGetCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;
