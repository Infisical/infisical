export type TBaseSqlConnectionCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
};
