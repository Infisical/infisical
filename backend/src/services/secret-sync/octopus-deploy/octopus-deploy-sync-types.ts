import z from "zod";

import { TOctopusDeployConnection } from "@app/services/app-connection/octopus-deploy";

import {
  CreateOctopusDeploySyncSchema,
  OctopusDeploySyncListItemSchema,
  OctopusDeploySyncSchema
} from "./octopus-deploy-sync-schemas";

export type TOctopusDeploySyncListItem = z.infer<typeof OctopusDeploySyncListItemSchema>;
export type TOctopusDeploySync = z.infer<typeof OctopusDeploySyncSchema>;
export type TOctopusDeploySyncInput = z.infer<typeof CreateOctopusDeploySyncSchema>;

export type TOctopusDeploySyncWithCredentials = Omit<TOctopusDeploySync, "connection"> & {
  connection: TOctopusDeployConnection;
};

export type TOctopusDeployVariable = {
  Id?: string;
  Name: string;
  Value: string;
  Description: string;
  Scope: {
    Environment?: string[];
    Machine?: string[];
    Role?: string[];
    Action?: string[];
    Channel?: string[];
    ProcessOwner?: string[];
    Tenant?: string[];
    TenantTag?: string[];
  };
  IsEditable: boolean;
  Prompt: {
    Description: string;
    DisplaySettings: Record<string, string>;
    Label: string;
    Required: boolean;
  } | null;
  Type: "String" | "Sensitive";
  IsSensitive: boolean;
};

export type TOctopusDeployVariableSet = {
  Id: string;
  OwnerId: string;
  Version: number;
  Variables: TOctopusDeployVariable[];
  ScopeValues: {
    Environments: { Id: string; Name: string }[];
    Machines: { Id: string; Name: string }[];
    Actions: { Id: string; Name: string }[];
    Roles: { Id: string; Name: string }[];
    Channels: { Id: string; Name: string }[];
    TenantTags: { Id: string; Name: string }[];
    Processes: {
      ProcessType: string;
      Id: string;
      Name: string;
    }[];
  };
  SpaceId: string;
  Links: {
    Self: string;
  };
};
