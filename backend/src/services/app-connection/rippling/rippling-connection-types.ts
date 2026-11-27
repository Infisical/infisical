import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRipplingConnectionSchema,
  RipplingConnectionSchema,
  ValidateRipplingConnectionCredentialsSchema
} from "./rippling-connection-schemas";

export type TRipplingConnection = z.infer<typeof RipplingConnectionSchema>;

export type TRipplingConnectionInput = z.infer<typeof CreateRipplingConnectionSchema> & {
  app: AppConnection.Rippling;
};

export type TValidateRipplingConnectionCredentialsSchema = typeof ValidateRipplingConnectionCredentialsSchema;

export type TRipplingConnectionConfig = DiscriminativePick<
  TRipplingConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TRipplingDevice = {
  id: string;
  serial_number: string;
  worker_id: string | null;
  platform: string | null;
  model: string | null;
  os_name: string | null;
  os_version: string | null;
  lifecycle_state: string | null;
  enrollment_status: string | null;
  is_managed: boolean | null;
  is_encrypted: boolean | null;
  last_checkin_at: string | null;
  pending_actions?: { action_type: string; state: string | null }[];
};

export type TRipplingWorker = { id: string; status: string | null; work_email: string | null };
