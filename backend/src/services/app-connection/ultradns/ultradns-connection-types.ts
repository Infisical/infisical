import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateUltraDNSConnectionSchema,
  UltraDNSConnectionSchema,
  ValidateUltraDNSConnectionCredentialsSchema
} from "./ultradns-connection-schema";

export type TUltraDNSConnection = z.infer<typeof UltraDNSConnectionSchema>;

export type TUltraDNSConnectionInput = z.infer<typeof CreateUltraDNSConnectionSchema> & {
  app: AppConnection.UltraDNS;
};

export type TValidateUltraDNSConnectionCredentialsSchema = typeof ValidateUltraDNSConnectionCredentialsSchema;

export type TUltraDNSConnectionConfig = DiscriminativePick<
  TUltraDNSConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TUltraDNSZone = {
  id: string;
  name: string;
};
