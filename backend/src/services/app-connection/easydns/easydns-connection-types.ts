import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { CreateEasyDNSConnectionSchema, EasyDNSConnectionSchema } from "./easydns-connection-schema";

export type TEasyDNSConnection = z.infer<typeof EasyDNSConnectionSchema>;

export type TEasyDNSConnectionInput = z.infer<typeof CreateEasyDNSConnectionSchema> & {
  app: AppConnection.EasyDNS;
};

export type TEasyDNSConnectionConfig = DiscriminativePick<TEasyDNSConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
