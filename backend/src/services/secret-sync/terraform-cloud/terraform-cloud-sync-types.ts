import z from "zod";

import { TTerraformCloudConnection } from "@app/services/app-connection/terraform-cloud";

import {
  CreateTerraformCloudSyncSchema,
  TerraformCloudSyncListItemSchema,
  TerraformCloudSyncSchema
} from "./terraform-cloud-sync-schemas";

export type TTerraformCloudSyncListItem = z.infer<typeof TerraformCloudSyncListItemSchema>;

export type TTerraformCloudSync = z.infer<typeof TerraformCloudSyncSchema>;

export type TTerraformCloudSyncInput = z.infer<typeof CreateTerraformCloudSyncSchema>;

export type TTerraformCloudSyncWithCredentials = TTerraformCloudSync & {
  connection: TTerraformCloudConnection;
};

export type TerraformCloudApiVariable = {
  id: string;
  type: string;
  attributes: {
    key: string;
    value: string | null;
    sensitive: boolean;
    category: "terraform" | "env";
    hcl: boolean;
    description: string | null;
  };
  relationships: {
    workspace?: {
      data: {
        id: string;
        type: string;
      };
    };
    project?: {
      data: {
        id: string;
        type: string;
      };
    };
  };
};

export type TerraformCloudVariable = {
  id: string;
  key: string;
  value: string;
  sensitive: boolean;
  description: string;
  category: "terraform" | "env";
  source: "varset" | "workspace";
};

export type TerraformCloudApiResponse<T> = {
  data: T;
  included?: unknown[];
  links?: {
    self?: string;
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
  meta?: {
    pagination?: {
      current_page: number;
      prev_page: number | null;
      next_page: number | null;
      total_pages: number;
      total_count: number;
    };
  };
};
