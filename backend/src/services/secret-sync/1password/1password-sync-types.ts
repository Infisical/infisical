import { z } from "zod";

import { TOnePassConnection } from "@app/services/app-connection/1password";

import { CreateOnePassSyncSchema, OnePassSyncListItemSchema, OnePassSyncSchema } from "./1password-sync-schemas";

export type TOnePassSync = z.infer<typeof OnePassSyncSchema>;

export type TOnePassSyncInput = z.infer<typeof CreateOnePassSyncSchema>;

export type TOnePassSyncListItem = z.infer<typeof OnePassSyncListItemSchema>;

export type TOnePassSyncWithCredentials = TOnePassSync & {
  connection: TOnePassConnection;
};

type Field = {
  id: string;
  type: string; // CONCEALED, STRING
  label: string;
  value: string;
};

export type TOnePassVariable = {
  id: string;
  title: string;
  category: string; // API_CREDENTIAL, SECURE_NOTE, LOGIN, etc
  fields: Field[];
};

export type TOnePassListVariablesResponse = TOnePassVariable[];

type TOnePassBase = {
  apiToken: string;
  instanceUrl: string;
  vaultId: string;
};

export type TOnePassListVariables = TOnePassBase & {
  valueLabel: string;
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
  otherFields: Field[];
};

export type TDeleteOnePassVariable = TOnePassBase & {
  itemId: string;
};
