import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ADCSConnectionMethod } from "./adcs-connection-enums";

export const ADCSUsernamePasswordCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "CA host required")
    .max(255)
    .describe("The AD CS server's DNS name (FQDN), for example ca01.corp.example.com."),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe("Windows login: DOMAIN\\user or user@domain."),
  password: z.string().trim().min(1, "Password required").max(255).describe("The account password.")
});

const BaseADCSConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.ADCS) });

export const ADCSConnectionSchema = BaseADCSConnectionSchema.extend({
  method: z.literal(ADCSConnectionMethod.UsernamePassword),
  credentials: ADCSUsernamePasswordCredentialsSchema
});

export const SanitizedADCSConnectionSchema = z.discriminatedUnion("method", [
  BaseADCSConnectionSchema.extend({
    method: z.literal(ADCSConnectionMethod.UsernamePassword),
    // Never return the password.
    credentials: ADCSUsernamePasswordCredentialsSchema.pick({ host: true, username: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.ADCS]} (Username and Password)` }))
]);

export const ValidateADCSConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(ADCSConnectionMethod.UsernamePassword),
    credentials: ADCSUsernamePasswordCredentialsSchema
  })
]);

export const CreateADCSConnectionSchema = ValidateADCSConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.ADCS, { supportsGateways: true })
);

export const UpdateADCSConnectionSchema = z
  .object({
    credentials: ADCSUsernamePasswordCredentialsSchema.optional()
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.ADCS, { supportsGateways: true }));

export const ADCSConnectionListItemSchema = z
  .object({
    name: z.literal("ADCS"),
    app: z.literal(AppConnection.ADCS),
    methods: z.nativeEnum(ADCSConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.ADCS] }));
