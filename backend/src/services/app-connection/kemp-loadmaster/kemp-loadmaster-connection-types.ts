import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateKempLoadMasterConnectionSchema,
  KempLoadMasterConnectionSchema,
  ValidateKempLoadMasterConnectionCredentialsSchema
} from "./kemp-loadmaster-connection-schemas";

export type TKempLoadMasterConnection = z.infer<typeof KempLoadMasterConnectionSchema>;

export type TKempLoadMasterConnectionInput = z.infer<typeof CreateKempLoadMasterConnectionSchema> & {
  app: AppConnection.KempLoadMaster;
};

export type TValidateKempLoadMasterConnectionCredentialsSchema =
  typeof ValidateKempLoadMasterConnectionCredentialsSchema;

export type TKempLoadMasterConnectionConfig = DiscriminativePick<
  TKempLoadMasterConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
