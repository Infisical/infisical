import { z } from "zod";

import { TSnowflakeConnection } from "@app/services/app-connection/snowflake";

import {
  CreateSnowflakeUserKeyPairRotationSchema,
  SnowflakeUserKeyPairRotationGeneratedCredentialsSchema,
  SnowflakeUserKeyPairRotationListItemSchema,
  SnowflakeUserKeyPairRotationSchema
} from "./snowflake-user-key-pair-rotation-schemas";

export type TSnowflakeUserKeyPairRotation = z.infer<typeof SnowflakeUserKeyPairRotationSchema>;

export type TSnowflakeUserKeyPairRotationInput = z.infer<typeof CreateSnowflakeUserKeyPairRotationSchema>;

export type TSnowflakeUserKeyPairRotationListItem = z.infer<typeof SnowflakeUserKeyPairRotationListItemSchema>;

export type TSnowflakeUserKeyPairRotationWithConnection = TSnowflakeUserKeyPairRotation & {
  connection: TSnowflakeConnection;
};

export type TSnowflakeUserKeyPairRotationGeneratedCredentials = z.infer<
  typeof SnowflakeUserKeyPairRotationGeneratedCredentialsSchema
>;
