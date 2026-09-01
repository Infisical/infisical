import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateWinRMConnectionSchema,
  ValidateWinRMConnectionCredentialsSchema,
  WinRMConnectionSchema
} from "./winrm-connection-schemas";

export type TWinRMConnection = z.infer<typeof WinRMConnectionSchema>;

export type TWinRMConnectionInput = z.infer<typeof CreateWinRMConnectionSchema> & {
  app: AppConnection.WinRM;
};

export type TValidateWinRMConnectionCredentialsSchema = typeof ValidateWinRMConnectionCredentialsSchema;

export type TWinRMConnectionConfig = DiscriminativePick<
  TWinRMConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
>;
