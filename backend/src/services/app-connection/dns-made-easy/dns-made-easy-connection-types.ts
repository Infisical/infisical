import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { DNSMadeEasyConnectionSchema, CreateDNSMadeEasyConnectionSchema } from "./dns-made-easy-connection-schema";

export type TDNSMadeEasyConnection = z.infer<typeof DNSMadeEasyConnectionSchema>;

export type TDNSMadeEasyConnectionInput = z.infer<typeof CreateDNSMadeEasyConnectionSchema> & {
  app: AppConnection.DNSMadeEasy;
};

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
