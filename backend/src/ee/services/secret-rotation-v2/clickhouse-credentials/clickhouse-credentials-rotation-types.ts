import { z } from "zod";

import { TClickHouseConnection } from "@app/services/app-connection/clickhouse";

import {
  ClickHouseCredentialsRotationGeneratedCredentialsSchema,
  ClickHouseCredentialsRotationListItemSchema,
  ClickHouseCredentialsRotationSchema,
  CreateClickHouseCredentialsRotationSchema
} from "./clickhouse-credentials-rotation-schemas";

export type TClickHouseCredentialsRotation = z.infer<typeof ClickHouseCredentialsRotationSchema>;

export type TClickHouseCredentialsRotationInput = z.infer<typeof CreateClickHouseCredentialsRotationSchema>;

export type TClickHouseCredentialsRotationListItem = z.infer<typeof ClickHouseCredentialsRotationListItemSchema>;

export type TClickHouseCredentialsRotationWithConnection = TClickHouseCredentialsRotation & {
  connection: TClickHouseConnection;
};

export type TClickHouseCredentialsRotationGeneratedCredentials = z.infer<
  typeof ClickHouseCredentialsRotationGeneratedCredentialsSchema
>;
