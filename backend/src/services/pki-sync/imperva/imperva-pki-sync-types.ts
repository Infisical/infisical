import { z } from "zod";

import { TImpervaConnection } from "@app/services/app-connection/imperva/imperva-connection-types";

import {
  CreateImpervaPkiSyncSchema,
  ImpervaPkiSyncConfigSchema,
  ImpervaPkiSyncSchema,
  UpdateImpervaPkiSyncSchema
} from "./imperva-pki-sync-schemas";

export type TImpervaPkiSyncConfig = z.infer<typeof ImpervaPkiSyncConfigSchema>;

export type TImpervaPkiSync = z.infer<typeof ImpervaPkiSyncSchema>;

export type TImpervaPkiSyncInput = z.infer<typeof CreateImpervaPkiSyncSchema>;

export type TImpervaPkiSyncUpdate = z.infer<typeof UpdateImpervaPkiSyncSchema>;

export type TImpervaPkiSyncWithCredentials = TImpervaPkiSync & {
  connection: TImpervaConnection;
};
