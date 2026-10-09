import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreatePaloAltoNetworksConnectionSchema,
  PaloAltoNetworksConnectionSchema,
  ValidatePaloAltoNetworksConnectionCredentialsSchema
} from "./palo-alto-networks-connection-schemas";

export type TPaloAltoNetworksConnection = z.infer<typeof PaloAltoNetworksConnectionSchema>;

export type TPaloAltoNetworksConnectionInput = z.infer<typeof CreatePaloAltoNetworksConnectionSchema> & {
  app: AppConnection.PaloAltoNetworks;
};

export type TValidatePaloAltoNetworksConnectionCredentialsSchema =
  typeof ValidatePaloAltoNetworksConnectionCredentialsSchema;

export type TPaloAltoNetworksConnectionConfig = DiscriminativePick<
  TPaloAltoNetworksConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
