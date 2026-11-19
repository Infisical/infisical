import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateKeeperConnectionSchema,
  KeeperConnectionSchema,
  ValidateKeeperConnectionCredentialsSchema
} from "./keeper-connection-schemas";

export type TKeeperConnection = z.infer<typeof KeeperConnectionSchema>;

export type TKeeperConnectionInput = z.infer<typeof CreateKeeperConnectionSchema> & {
  app: AppConnection.Keeper;
};

export type TValidateKeeperConnectionCredentialsSchema = typeof ValidateKeeperConnectionCredentialsSchema;

export type TKeeperConnectionConfig = DiscriminativePick<TKeeperConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TKeeperCredentials = {
  apiKey: string;
  instanceUrl: string;
};

export type TKeeperCommandResponse<T = unknown> = {
  status?: string;
  command?: string;
  data?: T;
  error?: string;
  message?: string;
};

export type TKeeperListSharedFoldersRow = {
  shared_folder_uid: string;
  name: string;
  folder_type?: string;
};

export type TKeeperSharedFolder = {
  uid: string;
  name: string;
};
