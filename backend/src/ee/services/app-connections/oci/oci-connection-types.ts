import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../../../../services/app-connection/app-connection-enums";
import {
  CreateOCIConnectionSchema,
  OCIConnectionSchema,
  ValidateOCIConnectionCredentialsSchema
} from "./oci-connection-schemas";

export type TOCIConnection = z.infer<typeof OCIConnectionSchema>;

export type TOCIConnectionInput = z.infer<typeof CreateOCIConnectionSchema> & {
  app: AppConnection.OCI;
};

export type TValidateOCIConnectionCredentialsSchema = typeof ValidateOCIConnectionCredentialsSchema;

export type TOCIConnectionConfig = DiscriminativePick<TOCIConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
