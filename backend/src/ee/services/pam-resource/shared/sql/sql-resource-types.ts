import { TMySQLAccountCredentials, TMySQLResourceConnectionDetails } from "../../mysql/mysql-resource-types";
import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "../../postgres/postgres-resource-types";

export type TSqlResourceConnectionDetails = TPostgresResourceConnectionDetails | TMySQLResourceConnectionDetails;
// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
export type TSqlAccountCredentials = TPostgresAccountCredentials | TMySQLAccountCredentials;
