import ConnectionString from "mongodb-connection-string-url";

import { PamAccountType, PamSshAuthMethod } from "../pam/pam-enums";
import {
  AWS_STS_MIN_DURATION_SECONDS,
  generateAwsIamSessionCredentials
} from "../pam-session/aws-iam/aws-iam-federation";
import { AZURE_SCOPES, getAzureAccessToken } from "../pam-session/azure/azure-federation";
import { mintGcpAccessToken } from "../pam-session/gcp/gcp-federation";
import { extractGatewayTarget, isCredentialConfigured } from "./pam-account-schemas";

export enum TestConnectionMode {
  SQL = "sql",
  MongoDB = "mongodb",
  LDAP = "ldap",
  Kubernetes = "kubernetes",
  SSH = "ssh",
  Tcp = "tcp"
}

// the request the gateway's /v1/test-connection handler expects, discriminated by `mode`
export type TestConnectionRequest =
  | {
      mode: TestConnectionMode.SQL;
      dialect: "postgres" | "mysql" | "mssql";
      username: string;
      password?: string;
      database: string;
      sslEnabled?: boolean;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    }
  | {
      mode: TestConnectionMode.MongoDB;
      username: string;
      password?: string;
      authSource: string;
      sslEnabled?: boolean;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    }
  | {
      mode: TestConnectionMode.LDAP;
      username: string;
      password?: string;
      useLdaps?: boolean;
      ldapRejectUnauthorized?: boolean;
      ldapCaCert?: string;
      ldapTlsServerName?: string;
    }
  | { mode: TestConnectionMode.Kubernetes; token: string; sslRejectUnauthorized?: boolean; sslCertificate?: string }
  | { mode: TestConnectionMode.SSH; authMethod: string; username: string; password?: string; privateKey?: string }
  | { mode: TestConnectionMode.Tcp };

const SQL_DIALECTS = {
  [PamAccountType.Postgres]: "postgres",
  [PamAccountType.MySQL]: "mysql",
  [PamAccountType.MsSQL]: "mssql"
} as const;

const tcp = (host: string, port: number) => ({ host, port, request: { mode: TestConnectionMode.Tcp } as const });

// resolves the gateway target and the per-type auth request
export const buildGatewayConnectionTest = async (
  accountType: PamAccountType,
  connectionDetails: Record<string, unknown>,
  credentials: Record<string, unknown> | null
): Promise<{ host: string; port: number; request: TestConnectionRequest } | null> => {
  const creds = credentials && isCredentialConfigured(accountType, credentials) ? credentials : null;

  const target =
    accountType === PamAccountType.WindowsAd
      ? {
          host: (connectionDetails as { dcAddress: string }).dcAddress,
          port: (connectionDetails as { port: number }).port
        }
      : await extractGatewayTarget(accountType, connectionDetails);
  if (target.port === undefined) return null;
  const { host, port } = target as { host: string; port: number };

  switch (accountType) {
    case PamAccountType.Postgres:
    case PamAccountType.MySQL:
    case PamAccountType.MsSQL: {
      const cd = connectionDetails as {
        database: string;
        sslEnabled?: boolean;
        sslRejectUnauthorized?: boolean;
        sslCertificate?: string;
      };
      const c = creds as { authMethod?: string; username: string; password?: string } | null;
      if (!c || (accountType === PamAccountType.MsSQL && c.authMethod !== "sql-login")) return tcp(host, port);
      return {
        host,
        port,
        request: {
          mode: TestConnectionMode.SQL,
          dialect: SQL_DIALECTS[accountType],
          username: c.username,
          password: c.password,
          database: cd.database,
          sslEnabled: cd.sslEnabled,
          sslRejectUnauthorized: cd.sslRejectUnauthorized,
          sslCertificate: cd.sslCertificate
        }
      };
    }
    case PamAccountType.MongoDB: {
      const cd = connectionDetails as {
        connectionString: string;
        database: string;
        sslEnabled?: boolean;
        sslRejectUnauthorized?: boolean;
        sslCertificate?: string;
      };
      const c = creds as { username: string; password?: string } | null;
      if (!c) return tcp(host, port);
      const authSource = new ConnectionString(cd.connectionString).searchParams.get("authSource") || cd.database;
      return {
        host,
        port,
        request: {
          mode: TestConnectionMode.MongoDB,
          username: c.username,
          password: c.password,
          authSource,
          sslEnabled: cd.sslEnabled,
          sslRejectUnauthorized: cd.sslRejectUnauthorized,
          sslCertificate: cd.sslCertificate
        }
      };
    }
    case PamAccountType.Kubernetes: {
      const cd = connectionDetails as { sslRejectUnauthorized?: boolean; sslCertificate?: string };
      const c = creds as { authMethod: string; serviceAccountToken?: string } | null;
      if (!c || c.authMethod !== "service-account-token" || !c.serviceAccountToken) return tcp(host, port);
      return {
        host,
        port,
        request: {
          mode: TestConnectionMode.Kubernetes,
          token: c.serviceAccountToken,
          sslRejectUnauthorized: cd.sslRejectUnauthorized,
          sslCertificate: cd.sslCertificate
        }
      };
    }
    case PamAccountType.WindowsAd: {
      const cd = connectionDetails as {
        useLdaps?: boolean;
        ldapRejectUnauthorized?: boolean;
        ldapCaCert?: string;
        ldapTlsServerName?: string;
      };
      const c = creds as { username: string; password?: string } | null;
      if (!c) return tcp(host, port);
      return {
        host,
        port,
        request: {
          mode: TestConnectionMode.LDAP,
          username: c.username,
          password: c.password,
          useLdaps: cd.useLdaps,
          ldapRejectUnauthorized: cd.ldapRejectUnauthorized,
          ldapCaCert: cd.ldapCaCert,
          ldapTlsServerName: cd.ldapTlsServerName
        }
      };
    }
    case PamAccountType.SSH: {
      const c = creds as { authMethod: string; username: string; password?: string; privateKey?: string } | null;
      if (!c || c.authMethod === PamSshAuthMethod.Certificate) return tcp(host, port);
      return {
        host,
        port,
        request: {
          mode: TestConnectionMode.SSH,
          authMethod: c.authMethod,
          username: c.username,
          password: c.password,
          privateKey: c.privateKey
        }
      };
    }
    case PamAccountType.Windows:
      return tcp(host, port);
    default:
      return null;
  }
};

// cloud accounts have no gateway-reachable host; the test validates the brokering credentials instead
type CloudConnectionValidator = (params: {
  connectionDetails: Record<string, unknown>;
  credentials: Record<string, unknown> | null;
  orgId: string;
}) => Promise<void>;

export const CLOUD_CONNECTION_VALIDATORS: Partial<Record<PamAccountType, CloudConnectionValidator>> = {
  [PamAccountType.AwsIam]: async ({ connectionDetails, orgId }) => {
    await generateAwsIamSessionCredentials({
      roleArn: connectionDetails.roleArn as string,
      externalId: orgId,
      roleSessionName: "infisical-pam-connection-test",
      sessionDuration: AWS_STS_MIN_DURATION_SECONDS
    });
  },
  [PamAccountType.AzureCli]: async ({ connectionDetails, credentials }) => {
    if (!credentials) return;
    await getAzureAccessToken({
      tenantId: connectionDetails.tenantId as string,
      clientId: credentials.clientId as string,
      clientSecret: credentials.clientSecret as string,
      scope: AZURE_SCOPES.arm
    });
  },
  [PamAccountType.GcpServiceAccount]: async ({ connectionDetails, credentials }) => {
    if (!credentials) return;
    await mintGcpAccessToken({
      serviceAccountEmail: connectionDetails.serviceAccountEmail as string,
      authMethod: credentials.authMethod as string,
      serviceAccountKeyJson: credentials.serviceAccountKeyJson as string | undefined
    });
  }
};
