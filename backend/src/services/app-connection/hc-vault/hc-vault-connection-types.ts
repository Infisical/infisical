import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHCVaultConnectionSchema,
  HCVaultConnectionSchema,
  ValidateHCVaultConnectionCredentialsSchema
} from "./hc-vault-connection-schemas";

export type THCVaultConnection = z.infer<typeof HCVaultConnectionSchema>;

export type THCVaultConnectionInput = z.infer<typeof CreateHCVaultConnectionSchema> & {
  app: AppConnection.HCVault;
};

export type TValidateHCVaultConnectionCredentialsSchema = typeof ValidateHCVaultConnectionCredentialsSchema;

export type TValidateHCVaultConnectionCredentials = z.infer<typeof ValidateHCVaultConnectionCredentialsSchema>;

export type THCVaultConnectionConfig = DiscriminativePick<THCVaultConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type THCVaultMountResponse = {
  data: {
    [key: string]: {
      options: {
        version?: string | null;
      } | null;
      type: string; // We're only interested in "kv" types
    };
  };
};
