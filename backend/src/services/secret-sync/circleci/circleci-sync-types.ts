import { z } from "zod";

import { TCircleCIConnection } from "@app/services/app-connection/circleci";

import {
  CircleCISyncListItemSchema,
  CircleCISyncSchema,
  CreateCircleCISyncSchema,
  UpdateCircleCISyncSchema
} from "./circleci-sync-schemas";

export type TCircleCISync = z.infer<typeof CircleCISyncSchema>;

export type TCircleCISyncInput = z.infer<typeof CreateCircleCISyncSchema>;

export type TCircleCISyncUpdateInput = z.infer<typeof UpdateCircleCISyncSchema>;

export type TCircleCISyncListItem = z.infer<typeof CircleCISyncListItemSchema>;

export type TCircleCISyncWithCredentials = TCircleCISync & {
  connection: TCircleCIConnection;
};

export type TCircleCIEnvVar = {
  name: string;
  value: string;
};

export type TCircleCIEnvVarListItem = {
  name: string;
  value: string; // This is masked (e.g., "****xxxx")
};

export type TCircleCIEnvVarListResponse = {
  items: TCircleCIEnvVarListItem[];
  next_page_token?: string;
};
