import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreatePowerDnsConnectionSchema,
  PowerDnsConnectionSchema,
  ValidatePowerDnsConnectionCredentialsSchema
} from "./powerdns-connection-schemas";

export type TPowerDnsConnection = z.infer<typeof PowerDnsConnectionSchema>;

export type TPowerDnsConnectionInput = z.infer<typeof CreatePowerDnsConnectionSchema> & {
  app: AppConnection.PowerDns;
};

export type TValidatePowerDnsConnectionCredentialsSchema = typeof ValidatePowerDnsConnectionCredentialsSchema;

export type TPowerDnsConnectionConfig = DiscriminativePick<
  TPowerDnsConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};

export type TPowerDnsZone = {
  id: string;
  name: string;
};

export type TPowerDnsRecord = {
  content: string;
  disabled?: boolean;
};

export type TPowerDnsRrset = {
  name: string;
  type: string;
  ttl?: number;
  records?: TPowerDnsRecord[];
};
