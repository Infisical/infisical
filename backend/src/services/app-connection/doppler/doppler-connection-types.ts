import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDopplerConnectionSchema,
  DopplerConnectionSchema,
  ValidateDopplerConnectionCredentialsSchema
} from "./doppler-connection-schema";

export type TDopplerConnection = z.infer<typeof DopplerConnectionSchema>;

export type TDopplerConnectionInput = z.infer<typeof CreateDopplerConnectionSchema> & {
  app: AppConnection.Doppler;
};

export type TValidateDopplerConnectionCredentialsSchema = typeof ValidateDopplerConnectionCredentialsSchema;

export type TDopplerConnectionConfig = DiscriminativePick<TDopplerConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TDopplerProject = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

export type TDopplerEnvironment = {
  id: string;
  slug: string;
  name: string;
  project: string;
  initialFetchAt: string | null;
  createdAt: string;
};

export type TDopplerSecret = {
  raw: string | null;
  computed: string | null;
};
