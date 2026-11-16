import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateIncidentIoConnectionSchema,
  IncidentIoConnectionSchema,
  ValidateIncidentIoConnectionCredentialsSchema
} from "./incident-io-connection-schemas";

export type TIncidentIoConnection = z.infer<typeof IncidentIoConnectionSchema>;

export type TIncidentIoConnectionInput = z.infer<typeof CreateIncidentIoConnectionSchema> & {
  app: AppConnection.IncidentIo;
};

export type TValidateIncidentIoConnectionCredentialsSchema = typeof ValidateIncidentIoConnectionCredentialsSchema;

export type TIncidentIoConnectionConfig = DiscriminativePick<
  TIncidentIoConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TIncidentIoSchedule = { id: string; name: string };

export type TIncidentIoScheduleEntry = {
  start_at: string;
  end_at: string;
  user?: { id: string; name?: string; email?: string } | null;
};
