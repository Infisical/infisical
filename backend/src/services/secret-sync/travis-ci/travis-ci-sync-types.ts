import { z } from "zod";

import { TTravisCIConnection } from "@app/services/app-connection/travis-ci";

import { CreateTravisCISyncSchema, TravisCISyncListItemSchema, TravisCISyncSchema } from "./travis-ci-sync-schemas";

export type TTravisCISyncListItem = z.infer<typeof TravisCISyncListItemSchema>;

export type TTravisCISync = z.infer<typeof TravisCISyncSchema>;

export type TTravisCISyncInput = z.infer<typeof CreateTravisCISyncSchema>;

export type TTravisCISyncWithCredentials = TTravisCISync & {
  connection: TTravisCIConnection;
};

export type TTravisCIEnvVar = {
  id: string;
  name: string;
  value: string | null;
  public: boolean;
  branch: string | null;
};
