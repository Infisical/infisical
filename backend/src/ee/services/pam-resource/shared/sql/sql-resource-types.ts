/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
import { TMongoDBAccountCredentials, TMongoDBResourceConnectionDetails } from "../../mongodb/mongodb-resource-types";
import { TMsSQLAccountCredentials, TMsSQLResourceConnectionDetails } from "../../mssql/mssql-resource-types";
import { TMySQLAccountCredentials, TMySQLResourceConnectionDetails } from "../../mysql/mysql-resource-types";
import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "../../postgres/postgres-resource-types";

export type TSqlResourceConnectionDetails =
  | TPostgresResourceConnectionDetails
  | TMySQLResourceConnectionDetails
  | TMsSQLResourceConnectionDetails
  | TMongoDBResourceConnectionDetails;

export type TSqlAccountCredentials =
  | TPostgresAccountCredentials
  | TMySQLAccountCredentials
  | TMsSQLAccountCredentials
  | TMongoDBAccountCredentials;
