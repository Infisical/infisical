import { describe, expect, test } from "vitest";

import { PamAccountType, PamSshAuthMethod } from "../pam/pam-enums";
import {
  buildGatewayConnectionTest,
  ORACLE_MAX_PASSWORD_LENGTH,
  TestConnectionMode
} from "./pam-account-connection-test";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

describe("buildGatewayConnectionTest: MSSQL Windows authentication", () => {
  const connectionDetails = {
    host: "sql.corp.example.com",
    port: 1433,
    database: "master",
    sslEnabled: false,
    sslRejectUnauthorized: true
  };

  test("ntlm logins authenticate instead of degrading to a reachability check", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.MsSQL,
      connectionDetails,
      { authMethod: "ntlm", username: "svc_app", password: "pw", domain: "CORP" },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request.mode).toBe(TestConnectionMode.SQL);
    expect(result?.request).toMatchObject({ authMethod: "ntlm", domain: "CORP", username: "svc_app" });
  });

  test("kerberos logins carry the realm, kdc, and spn the gateway needs", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.MsSQL,
      connectionDetails,
      {
        authMethod: "kerberos",
        username: "svc_app",
        password: "pw",
        realm: "CORP.EXAMPLE.COM",
        kdcAddress: "dc1.corp.example.com",
        spn: "MSSQLSvc/sql.corp.example.com:1433"
      },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request.mode).toBe(TestConnectionMode.SQL);
    expect(result?.request).toMatchObject({
      authMethod: "kerberos",
      realm: "CORP.EXAMPLE.COM",
      kdcAddress: "dc1.corp.example.com",
      spn: "MSSQLSvc/sql.corp.example.com:1433"
    });
  });

  test("sql-login is unchanged and sends no Windows auth fields", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.MsSQL,
      connectionDetails,
      { authMethod: "sql-login", username: "sa", password: "pw" },
      ORG_ID
    );

    expect(result?.request).toMatchObject({ mode: TestConnectionMode.SQL, authMethod: "sql-login" });
    expect(result?.request).toMatchObject({ domain: undefined, realm: undefined });
  });

  test("callers that omit the opt keep the old reachability check", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.MsSQL,
      connectionDetails,
      { authMethod: "ntlm", username: "svc_app", password: "pw", domain: "CORP" },
      ORG_ID
    );

    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });

  test("an account with no credential still falls back to a reachability check", async () => {
    const result = await buildGatewayConnectionTest(PamAccountType.MsSQL, connectionDetails, null, ORG_ID);
    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });
});

describe("buildGatewayConnectionTest: SSH certificate authentication", () => {
  const connectionDetails = { host: "10.0.0.5", port: 22 };

  test("a minted certificate is sent as a real login attempt", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.SSH,
      connectionDetails,
      {
        authMethod: PamSshAuthMethod.Certificate,
        username: "ubuntu",
        privateKey: "PRIVATE_KEY",
        certificate: "SIGNED_CERT"
      },
      ORG_ID
    );

    expect(result?.request).toMatchObject({
      mode: TestConnectionMode.SSH,
      authMethod: PamSshAuthMethod.Certificate,
      username: "ubuntu",
      certificate: "SIGNED_CERT",
      privateKey: "PRIVATE_KEY"
    });
  });

  test("without a certificate there is nothing to log in with, so it stays a reachability check", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.SSH,
      connectionDetails,
      { authMethod: PamSshAuthMethod.Certificate, username: "ubuntu" },
      ORG_ID
    );

    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });

  test("password auth is unaffected", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.SSH,
      connectionDetails,
      { authMethod: PamSshAuthMethod.Password, username: "ubuntu", password: "pw" },
      ORG_ID
    );

    expect(result?.request).toMatchObject({ mode: TestConnectionMode.SSH, password: "pw" });
  });
});

describe("buildGatewayConnectionTest: Oracle", () => {
  const connectionDetails = {
    host: "oracle.corp.example.com",
    port: 1521,
    database: "FREEPDB1",
    sslEnabled: false,
    sslRejectUnauthorized: true
  };

  test("authenticates against the service name using the oracle dialect", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      connectionDetails,
      { username: "system", password: "pw" },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result).toMatchObject({ host: "oracle.corp.example.com", port: 1521 });
    expect(result?.request).toMatchObject({
      mode: TestConnectionMode.SQL,
      dialect: "oracle",
      username: "system",
      password: "pw",
      database: "FREEPDB1"
    });
  });

  test("carries the SSL settings the gateway needs to pin the CA", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      { ...connectionDetails, port: 2484, sslEnabled: true, sslCertificate: "-----BEGIN CERTIFICATE-----" },
      { username: "system", password: "pw" },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request).toMatchObject({
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: "-----BEGIN CERTIFICATE-----"
    });
  });

  test("sends no Windows auth fields, which belong to MSSQL only", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      connectionDetails,
      { username: "system", password: "pw" },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request).not.toHaveProperty("authMethod");
    expect(result?.request).not.toHaveProperty("domain");
    expect(result?.request).not.toHaveProperty("spn");
  });

  test("an account with no credential falls back to a reachability check", async () => {
    const result = await buildGatewayConnectionTest(PamAccountType.OracleDB, connectionDetails, null, ORG_ID);
    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });

  test("callers that omit the opt keep a reachability check", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      connectionDetails,
      { username: "system", password: "pw" },
      ORG_ID
    );

    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });

  test("a password over the probe limit degrades to a reachability check", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      connectionDetails,
      { username: "system", password: "a".repeat(ORACLE_MAX_PASSWORD_LENGTH + 1) },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request.mode).toBe(TestConnectionMode.Tcp);
  });

  test("a password exactly at the probe limit still authenticates", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.OracleDB,
      connectionDetails,
      { username: "system", password: "a".repeat(ORACLE_MAX_PASSWORD_LENGTH) },
      ORG_ID,
      { allowNewerGatewayTests: true }
    );

    expect(result?.request).toMatchObject({ mode: TestConnectionMode.SQL, dialect: "oracle" });
  });

  test("the limit is Oracle-only and does not touch the other dialects", async () => {
    const result = await buildGatewayConnectionTest(
      PamAccountType.Postgres,
      { ...connectionDetails, port: 5432 },
      { authMethod: "password", username: "postgres", password: "a".repeat(64) },
      ORG_ID
    );

    expect(result?.request).toMatchObject({ mode: TestConnectionMode.SQL, dialect: "postgres" });
  });
});
