import { describe, expect, test } from "vitest";

import { PamAccountType, PamSshAuthMethod } from "../pam/pam-enums";
import { buildGatewayConnectionTest, TestConnectionMode } from "./pam-account-connection-test";

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
      ORG_ID
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
      ORG_ID
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
