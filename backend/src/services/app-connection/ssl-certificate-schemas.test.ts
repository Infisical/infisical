import { describe, expect, test } from "vitest";
import { z } from "zod";

import { ClickHouseConnectionUsernameAndPasswordCredentialsSchema } from "./clickhouse/clickhouse-connection-schemas";
import { HpeIloConnectionBasicAuthCredentialsSchema } from "./hpe-ilo/hpe-ilo-connection-schemas";
import { JiraConnectionPersonalAccessTokenCredentialsSchema } from "./jira/jira-connection-schemas";
import { PaloAltoNetworksConnectionBasicAuthCredentialsSchema } from "./palo-alto-networks/palo-alto-networks-connection-schemas";
import { BaseSqlUsernameAndPasswordConnectionSchema } from "./shared/sql/sql-connection-schemas";

// bidirectionalTransform checks the transform's result against the same schema, so the inner schema must
// accept the undefined an empty certificate becomes.
describe.each([
  ["ClickHouse", ClickHouseConnectionUsernameAndPasswordCredentialsSchema],
  ["HPE iLO", HpeIloConnectionBasicAuthCredentialsSchema],
  ["Jira", JiraConnectionPersonalAccessTokenCredentialsSchema],
  ["Palo Alto Networks", PaloAltoNetworksConnectionBasicAuthCredentialsSchema],
  ["SQL", BaseSqlUsernameAndPasswordConnectionSchema]
])("%s sslCertificate", (_name, credentials) => {
  const field = credentials.shape.sslCertificate;

  test("treats an empty certificate as none", () => {
    expect(field.parse("")).toBeUndefined();
    expect(field.parse("   ")).toBeUndefined();
    expect(field.parse(undefined)).toBeUndefined();
  });

  test("trims a certificate", () => {
    expect(field.parse(" -----BEGIN CERTIFICATE----- ")).toBe("-----BEGIN CERTIFICATE-----");
  });

  test("serializes a stored certificate or its absence", () => {
    const response = z.object({ sslCertificate: field });
    expect(z.encode(response, { sslCertificate: "pem" })).toEqual({ sslCertificate: "pem" });
    expect(z.encode(response, {})).toEqual({});
  });
});
