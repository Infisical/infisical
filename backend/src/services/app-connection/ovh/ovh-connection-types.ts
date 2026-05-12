import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOvhConnectionSchema,
  OvhConnectionSchema,
  ValidateOvhConnectionCredentialsSchema
} from "./ovh-connection-schemas";

export type TOvhConnection = z.infer<typeof OvhConnectionSchema>;

export type TOvhConnectionInput = z.infer<typeof CreateOvhConnectionSchema> & {
  app: AppConnection.OVH;
};

export type TValidateOvhConnectionCredentialsSchema = typeof ValidateOvhConnectionCredentialsSchema;

export type TOvhConnectionConfig = DiscriminativePick<TOvhConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
