import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateMicrosoftIntuneConnectionSchema,
  MicrosoftIntuneConnectionClientSecretOutputCredentialsSchema,
  MicrosoftIntuneConnectionSchema,
  ValidateMicrosoftIntuneConnectionCredentialsSchema
} from "./microsoft-intune-connection-schemas";

export type TMicrosoftIntuneConnection = z.infer<typeof MicrosoftIntuneConnectionSchema>;

export type TMicrosoftIntuneConnectionInput = z.infer<typeof CreateMicrosoftIntuneConnectionSchema> & {
  app: AppConnection.MicrosoftIntune;
};

export type TValidateMicrosoftIntuneConnectionCredentialsSchema =
  typeof ValidateMicrosoftIntuneConnectionCredentialsSchema;

export type TMicrosoftIntuneConnectionConfig = DiscriminativePick<
  TMicrosoftIntuneConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TMicrosoftIntuneConnectionCredentials = z.infer<
  typeof MicrosoftIntuneConnectionClientSecretOutputCredentialsSchema
>;

export type TMicrosoftEntraTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
};

export type TMicrosoftGraphServicePrincipalEndpoint = {
  id: string;
  providerName?: string;
  providerResourceId?: string;
  uri: string;
};

export type TMicrosoftGraphServicePrincipalEndpointsResponse = {
  value: TMicrosoftGraphServicePrincipalEndpoint[];
};

export type TIntuneScepValidationResponse = {
  code?: string;
  errorDescription?: string;
};
