import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreatePowerDNSConnectionSchema,
  PowerDNSConnectionSchema,
  ValidatePowerDNSConnectionCredentialsSchema
} from "./powerdns-connection-schema";

export type TPowerDNSConnection = z.infer<typeof PowerDNSConnectionSchema>;

export type TPowerDNSConnectionInput = z.infer<typeof CreatePowerDNSConnectionSchema> & {
  app: AppConnection.PowerDNS;
};

export type TValidatePowerDNSConnectionCredentialsSchema = typeof ValidatePowerDNSConnectionCredentialsSchema;

export type TPowerDNSConnectionConfig = DiscriminativePick<
  TPowerDNSConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
