import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "../../postgres/postgres-resource-types";
import {
  TMySQLAccountCredentials,
  TMySQLResourceConnectionDetails
} from "../../mysql/mysql-resource-types";

export type TSqlResourceConnectionDetails = TPostgresResourceConnectionDetails | TMySQLResourceConnectionDetails;
export type TSqlAccountCredentials = TPostgresAccountCredentials | TMySQLAccountCredentials;
