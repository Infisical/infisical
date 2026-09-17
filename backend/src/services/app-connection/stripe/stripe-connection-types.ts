import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateStripeConnectionSchema,
  StripeConnectionSchema,
  ValidateStripeConnectionCredentialsSchema
} from "./stripe-connection-schemas";

export type TStripeConnection = z.infer<typeof StripeConnectionSchema>;

export type TStripeConnectionInput = z.infer<typeof CreateStripeConnectionSchema> & {
  app: AppConnection.Stripe;
};

export type TValidateStripeConnectionCredentialsSchema = typeof ValidateStripeConnectionCredentialsSchema;

export type TStripeConnectionConfig = DiscriminativePick<TStripeConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
