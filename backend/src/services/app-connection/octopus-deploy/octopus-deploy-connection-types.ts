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

export type TOctopusDeploySpaceResponse = {
  Id: string;
  Name: string;
  Slug: string;
  IsDefault: boolean;
};

export type TOctopusDeploySpace = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

export type TOctopusDeployProjectResponse = {
  Id: string;
  Name: string;
  Slug: string;
};

export type TOctopusDeployProject = {
  id: string;
  name: string;
  slug: string;
};

export type TOctopusDeployScopeValuesResponse = {
  ScopeValues: {
    Environments: { Id: string; Name: string }[];
    Roles: { Id: string; Name: string }[];
    Machines: { Id: string; Name: string }[];
    Processes: { Id: string; Name: string }[];
    Actions: { Id: string; Name: string }[];
    Channels: { Id: string; Name: string }[];
  };
};

export type TOctopusDeployScopeValues = {
  environments: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  machines: { id: string; name: string }[];
  processes: { id: string; name: string }[];
  actions: { id: string; name: string }[];
  channels: { id: string; name: string }[];
};
