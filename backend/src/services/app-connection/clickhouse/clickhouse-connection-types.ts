import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  ClickHouseConnectionSchema,
  CreateClickHouseConnectionSchema,
  ValidateClickHouseConnectionCredentialsSchema
} from "./clickhouse-connection-schemas";

export type TClickHouseConnection = z.infer<typeof ClickHouseConnectionSchema>;

export type TClickHouseConnectionInput = z.infer<typeof CreateClickHouseConnectionSchema> & {
  app: AppConnection.ClickHouse;
};

export type TValidateClickHouseConnectionCredentialsSchema = typeof ValidateClickHouseConnectionCredentialsSchema;

export type TClickHouseConnectionConfig = DiscriminativePick<
  TClickHouseConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
