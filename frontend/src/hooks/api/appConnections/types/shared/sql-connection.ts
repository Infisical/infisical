export type TBaseSqlConnectionCredentials = {
  gatewayId?: string | null;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
};
