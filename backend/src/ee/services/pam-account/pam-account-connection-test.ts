import { PamAccountType, PamSshAuthMethod } from "../pam/pam-enums";

export enum TestConnectionMode {
  Postgres = "postgres",
  SSH = "ssh",
  Tcp = "tcp"
}

// the request the gateway's /v1/test-connection handler expects, discriminated by `mode`
export type TestConnectionRequest =
  | {
      mode: TestConnectionMode.Postgres;
      username: string;
      password?: string;
      database: string;
      sslEnabled?: boolean;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    }
  | {
      mode: TestConnectionMode.SSH;
      authMethod: string;
      username: string;
      password?: string;
      privateKey?: string;
      certificate?: string;
    }
  | { mode: TestConnectionMode.Tcp };

type ConnectionTestBuilder = (
  connectionDetails: Record<string, unknown>,
  credentials: Record<string, unknown>
) => TestConnectionRequest;

// single source of truth for which account types support a connection test and how each is tested
export const PAM_CONNECTION_TEST_BUILDERS: Partial<Record<PamAccountType, ConnectionTestBuilder>> = {
  [PamAccountType.Postgres]: (connectionDetails, credentials) => {
    const cd = connectionDetails as {
      database: string;
      sslEnabled?: boolean;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    };
    const creds = credentials as { username: string; password?: string };
    return {
      mode: TestConnectionMode.Postgres,
      username: creds.username,
      password: creds.password,
      database: cd.database,
      sslEnabled: cd.sslEnabled,
      sslRejectUnauthorized: cd.sslRejectUnauthorized,
      sslCertificate: cd.sslCertificate
    };
  },
  [PamAccountType.SSH]: (_connectionDetails, credentials) => {
    const creds = credentials as { authMethod: string; username: string; password?: string; privateKey?: string };
    if (creds.authMethod === PamSshAuthMethod.Certificate) return { mode: TestConnectionMode.Tcp };
    return {
      mode: TestConnectionMode.SSH,
      authMethod: creds.authMethod,
      username: creds.username,
      password: creds.password,
      privateKey: creds.privateKey
    };
  },
  [PamAccountType.Windows]: () => ({ mode: TestConnectionMode.Tcp })
};
