import { TProjectPermission } from "@app/lib/types";

export type TCreateAlertDTO = {
  name: string;
  pkiCollectionId: string;
  alertBeforeDays: number;
  emails: string[];
} & TProjectPermission;

export type TGetAlertByIdDTO = {
  alertId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAlertDTO = {
  alertId: string;
  name?: string;
  pkiCollectionId?: string;
  alertBeforeDays?: number;
  emails?: string[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteAlertDTO = {
  alertId: string;
} & Omit<TProjectPermission, "projectId">;
