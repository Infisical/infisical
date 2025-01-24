import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGcpConnectionSchema,
  GcpConnectionSchema,
  ValidateGcpConnectionCredentialsSchema
} from "./gcp-connection-schemas";

export type TGcpConnection = z.infer<typeof GcpConnectionSchema>;

export type TGcpConnectionInput = z.infer<typeof CreateGcpConnectionSchema> & {
  app: AppConnection.GCP;
};

export type TValidateGcpConnectionCredentials = typeof ValidateGcpConnectionCredentialsSchema;

export type TGcpConnectionConfig = DiscriminativePick<TGcpConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type GCPApp = {
  projectNumber: string;
  projectId: string;
  lifecycleState: "ACTIVE" | "LIFECYCLE_STATE_UNSPECIFIED" | "DELETE_REQUESTED" | "DELETE_IN_PROGRESS";
  name: string;
  createTime: string;
  parent: {
    type: "organization" | "folder" | "project";
    id: string;
  };
};

export type GCPGetProjectsRes = {
  projects: GCPApp[];
  nextPageToken?: string;
};

export type GCPGetServiceRes = {
  name: string;
  parent: string;
  state: "ENABLED" | "DISABLED" | "STATE_UNSPECIFIED";
};
