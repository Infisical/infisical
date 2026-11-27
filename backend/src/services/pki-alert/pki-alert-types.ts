import { TActorInput } from "@app/lib/types";

export type TCreateAlertDTO = {
  name: string;
  pkiCollectionId: string;
  alertBeforeDays: number;
  emails: string[];
  projectId: string;
} & TActorInput;

export type TGetAlertByIdDTO = {
  alertId: string;
} & TActorInput;

export type TUpdateAlertDTO = {
  alertId: string;
  name?: string;
  pkiCollectionId?: string;
  alertBeforeDays?: number;
  emails?: string[];
} & TActorInput;

export type TDeleteAlertDTO = {
  alertId: string;
} & TActorInput;
