import { z } from "zod";

import { TDenoDeployConnection } from "@app/services/app-connection/deno-deploy";

import { DenoDeploySyncContext } from "./deno-deploy-sync-enums";
import {
  CreateDenoDeploySyncSchema,
  DenoDeploySyncListItemSchema,
  DenoDeploySyncSchema
} from "./deno-deploy-sync-schemas";

export type TDenoDeploySync = z.infer<typeof DenoDeploySyncSchema>;

export type TDenoDeploySyncInput = z.infer<typeof CreateDenoDeploySyncSchema>;

export type TDenoDeploySyncListItem = z.infer<typeof DenoDeploySyncListItemSchema>;

export type TDenoDeploySyncWithCredentials = TDenoDeploySync & {
  connection: TDenoDeployConnection;
};

export type TDenoDeployEnvVarContexts = DenoDeploySyncContext.All | string[];

export type TDenoDeployEnvVar = {
  id: string;
  key: string;
  value?: string;
  secret: boolean;
  contexts: TDenoDeployEnvVarContexts;
};

export type TDenoDeployApp = {
  id: string;
  slug: string;
  env_vars?: TDenoDeployEnvVar[];
};

export type TDenoDeployEnvVarUpdate =
  | {
      key: string;
      value: string;
      secret: true;
      contexts: TDenoDeployEnvVarContexts;
    }
  | {
      id: string;
      delete: true;
    };
