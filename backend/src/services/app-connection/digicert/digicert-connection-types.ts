import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDigiCertConnectionSchema,
  DigiCertConnectionSchema,
  ValidateDigiCertConnectionCredentialsSchema
} from "./digicert-connection-schemas";

export type TDigiCertConnection = z.infer<typeof DigiCertConnectionSchema>;

export type TDigiCertConnectionInput = z.infer<typeof CreateDigiCertConnectionSchema> & {
  app: AppConnection.DigiCert;
};

export type TValidateDigiCertConnectionCredentialsSchema = typeof ValidateDigiCertConnectionCredentialsSchema;

export type TDigiCertConnectionConfig = DiscriminativePick<
  TDigiCertConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TDigiCertOrganization = {
  id: number;
  name: string;
  displayName?: string;
  status?: string;
};

export type TDigiCertProduct = {
  nameId: string;
  name: string;
  type?: string;
  validationType?: string;
};
