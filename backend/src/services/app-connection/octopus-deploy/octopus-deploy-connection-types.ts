import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOctopusDeployConnectionSchema,
  OctopusDeployConnectionSchema,
  ValidateOctopusDeployConnectionCredentialsSchema
} from "./octopus-deploy-connection-schemas";

export type TOctopusDeployConnection = z.infer<typeof OctopusDeployConnectionSchema>;

export type TOctopusDeployConnectionInput = z.infer<typeof CreateOctopusDeployConnectionSchema> & {
  app: AppConnection.OctopusDeploy;
};

export type TValidateOctopusDeployConnectionCredentialsSchema = typeof ValidateOctopusDeployConnectionCredentialsSchema;

export type TOctopusDeployConnectionConfig = DiscriminativePick<
  TOctopusDeployConnectionInput,
  "method" | "app" | "credentials"
>;
