import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateKoyebConnectionSchema,
  KoyebConnectionSchema,
  ValidateKoyebConnectionCredentialsSchema
} from "./koyeb-connection-schema";

export type TKoyebConnection = z.infer<typeof KoyebConnectionSchema>;

export type TKoyebConnectionInput = z.infer<typeof CreateKoyebConnectionSchema> & {
  app: AppConnection.Koyeb;
};

export type TValidateKoyebConnectionCredentialsSchema = typeof ValidateKoyebConnectionCredentialsSchema;

export type TKoyebConnectionConfig = DiscriminativePick<TKoyebConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
