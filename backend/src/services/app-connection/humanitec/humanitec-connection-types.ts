import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHumanitecConnectionSchema,
  HumanitecConnectionSchema,
  ValidateHumanitecConnectionCredentialsSchema
} from "./humanitec-connection-schemas";

export type THumanitecConnection = z.infer<typeof HumanitecConnectionSchema>;

export type THumanitecConnectionInput = z.infer<typeof CreateHumanitecConnectionSchema> & {
  app: AppConnection.Humanitec;
};

export type TValidateHumanitecConnectionCredentials = typeof ValidateHumanitecConnectionCredentialsSchema;

export type THumanitecConnectionConfig = DiscriminativePick<
  THumanitecConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type HumanitecOrg = {
  id: string;
  name: string;
};

export type HumanitecApp = {
  name: string;
  id: string;
  envs: { name: string; id: string }[];
};

export type HumanitecOrgWithApps = HumanitecOrg & {
  apps: HumanitecApp[];
};
