import { type ClickHouseClient, createClient } from "@clickhouse/client";

export type TClickHouseConfigKeys = Partial<{
  CLICKHOUSE_URL: string;
}>;

export const buildClickHouseFromConfig = (cfg: TClickHouseConfigKeys): ClickHouseClient | null => {
  if (!cfg?.CLICKHOUSE_URL) return null;

  return createClient({
    url: cfg.CLICKHOUSE_URL
  });
};
