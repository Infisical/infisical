import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateSshConnectionSchema,
  SshConnectionSchema,
  ValidateSshConnectionCredentialsSchema
} from "./ssh-connection-schemas";

export type TSshConnection = z.infer<typeof SshConnectionSchema>;

export type TSshConnectionInput = z.infer<typeof CreateSshConnectionSchema> & {
  app: AppConnection.SSH;
};

export type TValidateSshConnectionCredentialsSchema = typeof ValidateSshConnectionCredentialsSchema;

export type TSshConnectionConfig = DiscriminativePick<
  TSshConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
