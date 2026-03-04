import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateSmbConnectionSchema,
  SmbConnectionSchema,
  ValidateSmbConnectionCredentialsSchema
} from "./smb-connection-schemas";

export type TSmbConnection = z.infer<typeof SmbConnectionSchema>;

export type TSmbConnectionInput = z.infer<typeof CreateSmbConnectionSchema> & {
  app: AppConnection.SMB;
};

export type TValidateSmbConnectionCredentialsSchema = typeof ValidateSmbConnectionCredentialsSchema;

export type TSmbConnectionConfig = DiscriminativePick<
  TSmbConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
