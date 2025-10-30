import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  ChefConnectionSchema,
  CreateChefConnectionSchema,
  ValidateChefConnectionCredentialsSchema
} from "./chef-connection-schemas";

export type TChefConnection = z.infer<typeof ChefConnectionSchema>;

export type TChefConnectionInput = z.infer<typeof CreateChefConnectionSchema> & {
  app: AppConnection.Chef;
};

export type TValidateChefConnectionCredentialsSchema = typeof ValidateChefConnectionCredentialsSchema;

export type TChefConnectionConfig = DiscriminativePick<TChefConnectionInput, "method" | "app" | "credentials"> & {
  orgName: string;
};

export type TChefDataBag = {
  name: string;
};

export type TChefDataBagItem = {
  name: string;
};
