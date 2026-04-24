import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOnaConnectionSchema,
  OnaConnectionSchema,
  ValidateOnaConnectionCredentialsSchema
} from "./ona-connection-schemas";

export type TOnaConnection = z.infer<typeof OnaConnectionSchema>;

export type TOnaConnectionInput = z.infer<typeof CreateOnaConnectionSchema> & {
  app: AppConnection.Ona;
};

export type TValidateOnaConnectionCredentialsSchema = typeof ValidateOnaConnectionCredentialsSchema;

export type TOnaConnectionConfig = DiscriminativePick<TOnaConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TOnaProject = {
  id: string;
  name: string;
};

export type TOnaRawProject = {
  id: string;
  metadata?: {
    name?: string;
  };
};

export type TOnaProjectListResponse = {
  projects: TOnaRawProject[];
  pagination?: {
    nextToken?: string;
  };
};
