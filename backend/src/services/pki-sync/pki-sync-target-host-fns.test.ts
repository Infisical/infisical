import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PkiSync } from "./pki-sync-enums";
import { assertTargetHostMatchesConnection } from "./pki-sync-target-host-fns";

const sshConnection = { app: AppConnection.SSH, name: "prod-web-01" };
const winrmConnection = { app: AppConnection.WinRM, name: "prod-dc-01" };
const ldapConnection = { app: AppConnection.LDAP, name: "corp-directory", gatewayId: "gateway-id" };
const ldapConnectionWithoutGateway = { app: AppConnection.LDAP, name: "corp-directory" };

describe("assertTargetHostMatchesConnection", () => {
  test("accepts an SSH connection with no target host", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: sshConnection,
        destinationConfig: { destinationPath: "/etc/ssl/certs" }
      })
    ).not.toThrow();
  });

  test("rejects a target host on an SSH connection rather than ignoring it", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: sshConnection,
        destinationConfig: { destinationPath: "/etc/ssl/certs", host: "server01.corp.example.com" }
      })
    ).toThrow(/cannot be set when using the 'prod-web-01' connection/);
  });

  test("rejects a target host on a WinRM connection", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.WindowsServer,
        connection: winrmConnection,
        destinationConfig: { destinationPath: "C:\\certs", host: "server01.corp.example.com" }
      })
    ).toThrow(/cannot be set when using the 'prod-dc-01' connection/);
  });

  test("rejects an LDAP connection with no target host", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: ldapConnection,
        destinationConfig: { destinationPath: "/etc/ssl/certs" }
      })
    ).toThrow(/A target host is required when using the LDAP connection 'corp-directory'/);
  });

  test("rejects an empty-string host on an LDAP connection", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: ldapConnection,
        destinationConfig: { destinationPath: "/etc/ssl/certs", host: "" }
      })
    ).toThrow(/A target host is required/);
  });

  test("accepts an LDAP connection with a target host", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: ldapConnection,
        destinationConfig: { destinationPath: "/etc/ssl/certs", host: "server01.corp.example.com" }
      })
    ).not.toThrow();
  });

  test("accepts an LDAP-backed Linux sync with no Gateway, because SSH can be reached directly", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: ldapConnectionWithoutGateway,
        destinationConfig: { destinationPath: "/etc/ssl/certs", host: "server01.corp.example.com" }
      })
    ).not.toThrow();
  });

  test("rejects an LDAP-backed Windows sync when the connection has no Gateway", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.WindowsServer,
        connection: ldapConnectionWithoutGateway,
        destinationConfig: { destinationPath: "C:\\certs", host: "server01.corp.example.com" }
      })
    ).toThrow(/requires a Gateway/);
  });

  test("accepts an LDAP-backed Windows sync reached through a Gateway pool", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.WindowsServer,
        connection: { ...ldapConnectionWithoutGateway, gatewayPoolId: "pool-id" },
        destinationConfig: { destinationPath: "C:\\certs", host: "server01.corp.example.com" }
      })
    ).not.toThrow();
  });

  test("treats a missing destinationConfig as no target host", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.LinuxServer,
        connection: sshConnection,
        destinationConfig: undefined
      })
    ).not.toThrow();
  });

  test("rejects the transport fields on a non-LDAP connection, not only the host", () => {
    for (const field of ["port", "sslEnabled", "sslRejectUnauthorized"] as const) {
      expect(() =>
        assertTargetHostMatchesConnection({
          destination: PkiSync.WindowsServer,
          connection: { app: AppConnection.WinRM, name: "prod-web-01" },
          destinationConfig: { [field]: field === "port" ? 5986 : false }
        })
      ).toThrow(new RegExp(`${field} cannot be set when using the 'prod-web-01' connection`));
    }
  });

  test("accepts a non-LDAP connection that sets none of them", () => {
    expect(() =>
      assertTargetHostMatchesConnection({
        destination: PkiSync.WindowsServer,
        connection: { app: AppConnection.WinRM, name: "prod-web-01" },
        destinationConfig: { destinationPath: "C:\\certs" }
      })
    ).not.toThrow();
  });
});
