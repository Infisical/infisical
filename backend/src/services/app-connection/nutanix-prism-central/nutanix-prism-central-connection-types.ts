import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateNutanixPrismCentralConnectionSchema,
  NutanixPrismCentralConnectionSchema,
  ValidateNutanixPrismCentralConnectionCredentialsSchema
} from "./nutanix-prism-central-connection-schemas";

export type TNutanixPrismCentralConnection = z.infer<typeof NutanixPrismCentralConnectionSchema>;

export type TNutanixPrismCentralConnectionInput = z.infer<typeof CreateNutanixPrismCentralConnectionSchema> & {
  app: AppConnection.NutanixPrismCentral;
};

export type TValidateNutanixPrismCentralConnectionCredentialsSchema =
  typeof ValidateNutanixPrismCentralConnectionCredentialsSchema;

export type TNutanixPrismCentralConnectionConfig = DiscriminativePick<
  TNutanixPrismCentralConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
