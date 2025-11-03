import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateNorthflankConnectionSchema,
  NorthflankConnectionSchema,
  ValidateNorthflankConnectionCredentialsSchema
} from "./northflank-connection-schemas";

export type TNorthflankConnection = z.infer<typeof NorthflankConnectionSchema>;

export type TNorthflankConnectionInput = z.infer<typeof CreateNorthflankConnectionSchema> & {
  app: AppConnection.Northflank;
};

export type TValidateNorthflankConnectionCredentialsSchema = typeof ValidateNorthflankConnectionCredentialsSchema;

export type TNorthflankConnectionConfig = DiscriminativePick<
  TNorthflankConnection,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TNorthflankProject = {
  id: string;
  name: string;
};

export type TNorthflankSecretGroup = {
  id: string;
  name: string;
};
