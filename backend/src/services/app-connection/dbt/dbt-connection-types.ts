import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDbtConnectionSchema,
  DbtConnectionSchema,
  ValidateDbtConnectionCredentialsSchema
} from "./dbt-connection-schemas";

export type TDbtConnection = z.infer<typeof DbtConnectionSchema>;

export type TDbtConnectionInput = z.infer<typeof CreateDbtConnectionSchema> & {
  app: AppConnection.Dbt;
};

export type TValidateDbtConnectionCredentialsSchema = typeof ValidateDbtConnectionCredentialsSchema;

export type TDbtConnectionConfig = DiscriminativePick<TDbtConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export interface TDbtStatusResponse {
  status: {
    code: number;
    is_success: boolean;
    user_message: string;
    developer_message: string;
  };
}

export interface TDbtErrorResponse extends TDbtStatusResponse {
  data: {
    reason?: string;
  };
}

export interface TDbtProject {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TDbtListProjectsResponse extends TDbtStatusResponse {
  data: TDbtProject[];
}
