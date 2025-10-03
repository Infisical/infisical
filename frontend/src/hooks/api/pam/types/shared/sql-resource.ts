export type TBaseSqlConnectionDetails = {
  host: string;
  port: number;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
};

export type TBaseSqlCredentials = {
  username: string;
  password: string;
};
