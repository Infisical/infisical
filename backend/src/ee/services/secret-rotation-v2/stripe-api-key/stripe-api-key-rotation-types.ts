import { z } from "zod";

import { TStripeConnection } from "@app/services/app-connection/stripe";

import { TStripeSecretKeyField } from "./stripe-api-key-jwe";
import {
  CreateStripeApiKeyRotationSchema,
  StripeApiKeyRotationGeneratedCredentialsSchema,
  StripeApiKeyRotationListItemSchema,
  StripeApiKeyRotationSchema
} from "./stripe-api-key-rotation-schemas";

export type TStripeApiKeyRotation = z.infer<typeof StripeApiKeyRotationSchema>;

export type TStripeApiKeyRotationInput = z.infer<typeof CreateStripeApiKeyRotationSchema>;

export type TStripeApiKeyRotationListItem = z.infer<typeof StripeApiKeyRotationListItemSchema>;

export type TStripeApiKeyRotationWithConnection = TStripeApiKeyRotation & {
  connection: TStripeConnection;
};

export type TStripeApiKeyRotationGeneratedCredentials = z.infer<typeof StripeApiKeyRotationGeneratedCredentialsSchema>;

export type TStripeApiKeyCreateResponse = {
  id?: string;
  secret_key?: TStripeSecretKeyField;
};
