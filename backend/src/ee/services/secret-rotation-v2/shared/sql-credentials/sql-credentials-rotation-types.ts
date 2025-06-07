import { z } from "zod";

import { TMsSqlCredentialsRotationWithConnection } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { TMySqlCredentialsRotationWithConnection } from "@app/ee/services/secret-rotation-v2/mysql-credentials";
import { TPostgresCredentialsRotationWithConnection } from "@app/ee/services/secret-rotation-v2/postgres-credentials";

import { TOracleDBCredentialsRotationWithConnection } from "../../oracledb-credentials";
import { SqlCredentialsRotationGeneratedCredentialsSchema } from "./sql-credentials-rotation-schemas";

export type TSqlCredentialsRotationWithConnection =
  | TPostgresCredentialsRotationWithConnection
  | TMsSqlCredentialsRotationWithConnection
  | TMySqlCredentialsRotationWithConnection
  | TOracleDBCredentialsRotationWithConnection;

export type TSqlCredentialsRotationGeneratedCredentials = z.infer<
  typeof SqlCredentialsRotationGeneratedCredentialsSchema
>;
