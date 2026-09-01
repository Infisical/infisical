import { z } from "zod";

import { TQoveryConnection } from "@app/services/app-connection/qovery";

import { CreateQoverySyncSchema, QoverySyncListItemSchema, QoverySyncSchema } from "./qovery-sync-schemas";

export type TQoverySyncListItem = z.infer<typeof QoverySyncListItemSchema>;

export type TQoverySync = z.infer<typeof QoverySyncSchema>;

export type TQoverySyncInput = z.infer<typeof CreateQoverySyncSchema>;

export type TQoverySyncWithCredentials = TQoverySync & {
  connection: TQoveryConnection;
};

// Qovery secret/environment-variable list item. Secrets omit `value` in list responses; variables include it.
export type TQoveryApiVariable = {
  id: string;
  key: string;
  value?: string | null;
  scope: string;
  variable_type?: string;
};
