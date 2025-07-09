import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRailwayConnectionSchema,
  RailwayConnectionSchema,
  ValidateRailwayConnectionCredentialsSchema
} from "./railway-connection-schemas";

export type TRailwayConnection = z.infer<typeof RailwayConnectionSchema>;

export type TRailwayConnectionInput = z.infer<typeof CreateRailwayConnectionSchema> & {
  app: AppConnection.Railway;
};

export type TValidateRailwayConnectionCredentialsSchema = typeof ValidateRailwayConnectionCredentialsSchema;

export type TRailwayConnectionConfig = DiscriminativePick<TRailwayConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TRailwayService = {
  id: string;
  name: string;
};

export type TRailwayEnvironment = {
  id: string;
  name: string;
};

export type RailwayProject = {
  id: string;
  name: string;
  services: TRailwayService[];
  environments: TRailwayEnvironment[];
};

export type TRailwayResponse<T = unknown> = {
  data?: T;
  errors?: {
    message: string;
  }[];
};

export type TAccountProjectListResponse = TRailwayResponse<{
  projects: {
    edges: TProjectEdge[];
  };
}>;

export interface TProjectEdge {
  node: {
    id: string;
    name: string;
    services: {
      edges: TServiceEdge[];
    };
    environments: {
      edges: TEnvironmentEdge[];
    };
  };
}

type TServiceEdge = {
  node: {
    id: string;
    name: string;
  };
};

type TEnvironmentEdge = {
  node: {
    id: string;
    name: string;
  };
};
