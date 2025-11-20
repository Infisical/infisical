import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDNSMadeEasyConnectionSchema,
  DNSMadeEasyConnectionSchema,
  ValidateDNSMadeEasyConnectionCredentialsSchema
} from "./dns-made-easy-connection-schema";

export type TDNSMadeEasyConnection = z.infer<typeof DNSMadeEasyConnectionSchema>;

export type TDNSMadeEasyConnectionInput = z.infer<typeof CreateDNSMadeEasyConnectionSchema> & {
  app: AppConnection.DNSMadeEasy;
};

export type TValidateDNSMadeEasyConnectionCredentialsSchema = typeof ValidateDNSMadeEasyConnectionCredentialsSchema;

export type TDNSMadeEasyConnectionConfig = DiscriminativePick<
  TDNSMadeEasyConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TDNSMadeEasyZone = {
  id: string;
  name: string;
};
