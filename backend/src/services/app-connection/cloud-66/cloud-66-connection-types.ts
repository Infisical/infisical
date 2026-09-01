import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  Cloud66ConnectionSchema,
  CreateCloud66ConnectionSchema,
  ValidateCloud66ConnectionCredentialsSchema
} from "./cloud-66-connection-schemas";

export type TCloud66Connection = z.infer<typeof Cloud66ConnectionSchema>;

export type TCloud66ConnectionInput = z.infer<typeof CreateCloud66ConnectionSchema> & {
  app: AppConnection.Cloud66;
};

export type TValidateCloud66ConnectionCredentialsSchema = typeof ValidateCloud66ConnectionCredentialsSchema;

export type TCloud66ConnectionConfig = DiscriminativePick<TCloud66ConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TCloud66Stack = {
  id: string;
  name: string;
};
