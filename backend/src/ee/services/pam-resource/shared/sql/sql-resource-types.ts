/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
import { TMsSQLAccountCredentials, TMsSQLResourceConnectionDetails } from "../../mssql/mssql-resource-types";
import { TMySQLAccountCredentials, TMySQLResourceConnectionDetails } from "../../mysql/mysql-resource-types";
import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "../../postgres/postgres-resource-types";

export type TSqlResourceConnectionDetails =
  | TPostgresResourceConnectionDetails
  | TMySQLResourceConnectionDetails
  | TMsSQLResourceConnectionDetails;

export type TSqlAccountCredentials = TPostgresAccountCredentials | TMySQLAccountCredentials | TMsSQLAccountCredentials;
