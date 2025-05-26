import { z } from "zod";

import { TOnePassConnection } from "@app/services/app-connection/1password";

import { CreateOnePassSyncSchema, OnePassSyncListItemSchema, OnePassSyncSchema } from "./1password-sync-schemas";

export type TOnePassSync = z.infer<typeof OnePassSyncSchema>;

export type TOnePassSyncInput = z.infer<typeof CreateOnePassSyncSchema>;

export type TOnePassSyncListItem = z.infer<typeof OnePassSyncListItemSchema>;

export type TOnePassSyncWithCredentials = TOnePassSync & {
  connection: TOnePassConnection;
};

export type TOnePassVariable = {
  id: string;
  title: string;
  category: string; // API_CREDENTIAL, SECURE_NOTE, LOGIN, etc
};

export type TOnePassVariableDetails = TOnePassVariable & {
  fields: {
    id: string;
    type: string; // CONCEALED, STRING
    label: string;
    value: string;
  }[];
};

export type TOnePassListVariablesResponse = TOnePassVariable[];

export type TOnePassListVariables = {
  apiToken: string;
  instanceUrl: string;
  vaultId: string;
};

export type TPostOnePassVariable = TOnePassListVariables & {
  itemTitle: string;
  itemValue: string;
};

export type TPutOnePassVariable = TOnePassListVariables & {
  itemId: string;
  fieldId: string;
  itemTitle: string;
  itemValue: string;
};

export type TDeleteOnePassVariable = TOnePassListVariables & {
  itemId: string;
};
