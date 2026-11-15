import { describe, expect, it } from "vitest";

import { ClickHouseConnectionUsernameAndPasswordCredentialsSchema } from "./clickhouse-connection-schemas";

const CREDENTIALS = {
  host: "clickhouse.example.com",
  port: 8443,
  database: "default",
  username: "manager",
  password: "manager-password",
  sslEnabled: true,
  sslRejectUnauthorized: true
};

const isValidHost = (host: string) =>
  ClickHouseConnectionUsernameAndPasswordCredentialsSchema.safeParse({ ...CREDENTIALS, host }).success;

describe("ClickHouse connection host", () => {
  it.each(["clickhouse.example.com", "infisical-dev-clickhouse", "203.0.113.10", "2001:db8::10"])(
    "accepts %s",
    (host) => {
      expect(isValidHost(host)).toBe(true);
    }
  );

  it.each([
    "db.example.com:8123/?log_level=ERROR#",
    "db.example.com\\?log_level=ERROR",
    "user:password@db.example.com",
    "https://db.example.com",
    "db.example.com:8123"
  ])("rejects %s", (host) => {
    expect(isValidHost(host)).toBe(false);
  });
});
