import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOktaConnectionSchema,
  OktaConnectionSchema,
  ValidateOktaConnectionCredentialsSchema
} from "./okta-connection-schemas";

export type TOktaConnection = z.infer<typeof OktaConnectionSchema>;

export type TOktaConnectionInput = z.infer<typeof CreateOktaConnectionSchema> & {
  app: AppConnection.Okta;
};

export type TValidateOktaConnectionCredentialsSchema = typeof ValidateOktaConnectionCredentialsSchema;

export type TOktaConnectionConfig = DiscriminativePick<TOktaConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TOktaApp = {
  id: string;
  label: string;
  status: "ACTIVE" | "INACTIVE";
  name: "oidc_client"; // "oidc_client" or other types
};
