import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDenoDeployConnectionSchema,
  DenoDeployConnectionSchema,
  ValidateDenoDeployConnectionCredentialsSchema
} from "./deno-deploy-connection-schemas";

export type TDenoDeployConnection = z.infer<typeof DenoDeployConnectionSchema>;

export type TDenoDeployConnectionInput = z.infer<typeof CreateDenoDeployConnectionSchema> & {
  app: AppConnection.DenoDeploy;
};

export type TValidateDenoDeployConnectionCredentialsSchema = typeof ValidateDenoDeployConnectionCredentialsSchema;

export type TDenoDeployConnectionConfig = DiscriminativePick<
  TDenoDeployConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TDenoDeployApp = {
  id: string;
  slug: string;
};
