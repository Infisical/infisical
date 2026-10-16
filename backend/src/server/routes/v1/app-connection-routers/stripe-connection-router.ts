import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateStripeConnectionSchema,
  SanitizedStripeConnectionSchema,
  UpdateStripeConnectionSchema
} from "@app/services/app-connection/stripe";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerStripeConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Stripe,
    server,
    sanitizedResponseSchema: SanitizedStripeConnectionSchema,
    createSchema: CreateStripeConnectionSchema,
    updateSchema: UpdateStripeConnectionSchema
  });
};
