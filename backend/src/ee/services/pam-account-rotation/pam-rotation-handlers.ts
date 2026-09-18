import { rotateSqlCredentialWithGateway, testConnectionWithGateway } from "@app/ee/services/gateway-v2/gateway-v2-fns";
import { BadRequestError } from "@app/lib/errors";
import { WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import {
  getRoleUsernameForHost,
  getSqlConnectionVerifyQuery,
  SQL_CONNECTION_ALTER_LOGIN_STATEMENT
} from "@app/services/app-connection/shared/sql";

import { PamAccountType, PamPostgresAuthMethod } from "../pam/pam-enums";
import { ORACLE_MAX_PASSWORD_LENGTH, ORACLE_MIN_GATEWAY_VERSION } from "../pam-account/pam-account-connection-test";
import { TWindowsAdConnectionDetails, TWindowsConnectionDetails } from "../pam-account/pam-account-schemas";
import { DEFAULT_WINRM_PORT, ldapBindCheckViaGateway, winrmRpcWithGateway } from "../pam-discovery/pam-discovery-fns";
import {
  PAM_ROTATION_APP_MAP,
  redactRotationError,
  toBareAccountName,
  TRotatableType,
  TSqlRotatableType,
  withGatewayRetry
} from "./pam-rotation-fns";
import {
  SQL_QUERY_TIMEOUT,
  TPamRotationGatewayDeps,
  TPamSqlConnectionDetails,
  withPamSqlClient
} from "./shared/pam-rotation-sql-connection";

type TApplyPasswordChangeInput = {
  accountType: TRotatableType;
  // Type-specific connection details; each handler narrows to the shape for its account type.
  connectionDetails: Record<string, unknown>;
  // Authenticates the connection: the account's own credential (self) or the rotator's (delegated).
  auth: { username: string; password: string };
  targetUsername: string;
  newPassword: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

type TTestCredentialInput = {
  accountType: TRotatableType;
  connectionDetails: Record<string, unknown>;
  auth: { username: string; password: string };
  // When set, the credential in `auth` can't be authenticated as directly (a delegated local Windows account
  // that can't log in over WinRM), so connect as this identity (the admin rotator) and validate on the box.
  verifyVia?: { username: string; password: string };
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export type TPamRotationHandler = {
  validateTarget: (input: { accountType: TRotatableType; authMethod?: string }) => void;
  validateRotatorCredential?: (input: { accountType: TRotatableType; password?: string }) => void;
  applyPasswordChange: (input: TApplyPasswordChangeInput, deps: TPamRotationGatewayDeps) => Promise<void>;
  // Returns whether the credential authenticates. THROWS only when verification can't complete (transient
  // transport error); callers treat a throw as inconclusive and defer, never as a wrong password.
  testCredential: (input: TTestCredentialInput, deps: TPamRotationGatewayDeps) => Promise<boolean>;
};

const ORACLE_ROTATE_TIMEOUT_MS = 30_000;

const resolveRotationGatewayId = async (
  deps: TPamRotationGatewayDeps,
  gatewayId?: string | null,
  gatewayPoolId?: string | null
): Promise<string> => {
  const resolved = gatewayPoolId
    ? await deps.gatewayPoolService.resolveEffectiveGatewayId({ gatewayId, gatewayPoolId })
    : gatewayId;
  if (!resolved) throw new BadRequestError({ message: "No healthy gateway is available to rotate this account" });
  return resolved;
};

const isGatewayProtocolUnsupported = (err: unknown) =>
  err instanceof Error && /no application protocol|alert number 120/i.test(err.message);

const assertOracleCredentialIsUsable = (password: string) => {
  if (password.length > ORACLE_MAX_PASSWORD_LENGTH) {
    throw new BadRequestError({
      message: `Oracle credentials longer than ${ORACLE_MAX_PASSWORD_LENGTH} characters cannot be used to rotate. Shorten the rotation account's password and try again.`
    });
  }
};

const ORACLE_GATEWAY_TOO_OLD = `This account's gateway does not support Oracle credential rotation. Update the gateway to ${ORACLE_MIN_GATEWAY_VERSION} or later.`;

const oracleGatewayRequest = (
  connectionDetails: TPamSqlConnectionDetails,
  auth: { username: string; password: string }
) => ({
  dialect: "oracle",
  username: auth.username,
  password: auth.password,
  database: connectionDetails.database,
  sslEnabled: connectionDetails.sslEnabled,
  sslRejectUnauthorized: connectionDetails.sslRejectUnauthorized,
  sslCertificate: connectionDetails.sslCertificate
});

const verifyOracleViaGateway = async (
  input: {
    connectionDetails: TPamSqlConnectionDetails;
    auth: { username: string; password: string };
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  },
  deps: TPamRotationGatewayDeps
): Promise<boolean> => {
  const { connectionDetails, auth } = input;
  const gatewayId = await resolveRotationGatewayId(deps, input.gatewayId, input.gatewayPoolId);
  const result = await testConnectionWithGateway(
    connectionDetails.host,
    connectionDetails.port,
    gatewayId,
    deps.gatewayV2Service,
    { mode: "sql", ...oracleGatewayRequest(connectionDetails, auth) },
    ORACLE_ROTATE_TIMEOUT_MS
  );

  if (!result) {
    throw new Error("Could not reach the target through the gateway to verify its credentials");
  }
  if (result.ok) return true;
  if (result.kind === "transport") {
    throw new Error(`Could not reach the target through the gateway to verify its credentials: ${result.errorMessage}`);
  }
  return false;
};

const rotateOracleViaGateway = async (
  input: {
    connectionDetails: TPamSqlConnectionDetails;
    auth: { username: string; password: string };
    targetUsername: string;
    newPassword: string;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  },
  deps: TPamRotationGatewayDeps
) => {
  const { connectionDetails, auth, targetUsername, newPassword } = input;
  const gatewayId = await resolveRotationGatewayId(deps, input.gatewayId, input.gatewayPoolId);

  let result;
  try {
    result = await rotateSqlCredentialWithGateway(
      connectionDetails.host,
      connectionDetails.port,
      gatewayId,
      deps.gatewayV2Service,
      { ...oracleGatewayRequest(connectionDetails, auth), targetUsername, newPassword },
      ORACLE_ROTATE_TIMEOUT_MS
    );
  } catch (err) {
    if (isGatewayProtocolUnsupported(err)) {
      throw new BadRequestError({ message: ORACLE_GATEWAY_TOO_OLD });
    }
    throw new Error(redactRotationError(err, [newPassword, auth.password]));
  }

  if (!result.ok) {
    throw new Error(redactRotationError(new Error(result.errorMessage), [newPassword, auth.password]));
  }
};

const sqlRotationHandler: TPamRotationHandler = {
  validateRotatorCredential: ({ accountType, password }) => {
    if (accountType === PamAccountType.OracleDB && password) assertOracleCredentialIsUsable(password);
  },

  validateTarget: ({ accountType, authMethod }) => {
    // MSSQL Windows-auth (ntlm/kerberos) logins have no SQL-managed password to change, so only sql-login rotates.
    if (accountType === PamAccountType.MsSQL && authMethod !== "sql-login") {
      throw new BadRequestError({ message: "MSSQL rotation supports SQL Server authentication only" });
    }
    // An IAM login has no stored password: the gateway mints a short-lived token for each connection
    if (accountType === PamAccountType.Postgres && authMethod === PamPostgresAuthMethod.AwsIam) {
      throw new BadRequestError({
        message: "PostgreSQL accounts using AWS IAM authentication have no password to rotate"
      });
    }
  },

  applyPasswordChange: async (input, deps) => {
    const { accountType, auth, targetUsername, newPassword, gatewayId, gatewayPoolId } = input;
    const connectionDetails = input.connectionDetails as TPamSqlConnectionDetails;

    if (accountType === PamAccountType.OracleDB) {
      await rotateOracleViaGateway(
        { connectionDetails, auth, targetUsername, newPassword, gatewayId, gatewayPoolId },
        deps
      );
      return;
    }

    // Strip the PlanetScale `<user>.<branch>` suffix so the ALTER targets the real role.
    const roleUsername = getRoleUsernameForHost(targetUsername, connectionDetails.host);
    const [statement, bindings] = SQL_CONNECTION_ALTER_LOGIN_STATEMENT[
      PAM_ROTATION_APP_MAP[accountType as TSqlRotatableType]
    ]({
      username: roleUsername,
      password: newPassword
    });

    try {
      await withPamSqlClient(
        { accountType: accountType as TSqlRotatableType, connectionDetails, auth, gatewayId, gatewayPoolId },
        deps,
        async (client) => {
          // No `cancel: true`: tedious (mssql) throws on cancellation. A plain timeout rejects on all dialects,
          // and withPamSqlClient's finally destroys the connection, aborting any still-running statement.
          await client.raw(statement, bindings).timeout(SQL_QUERY_TIMEOUT);
        }
      );
    } catch (err) {
      // The statement interpolates the password, so a driver error can echo it. Redact both secrets.
      throw new Error(redactRotationError(err, [newPassword, auth.password]));
    }
  },

  testCredential: async (input, deps) => {
    const { accountType, auth, gatewayId, gatewayPoolId } = input;
    const connectionDetails = input.connectionDetails as TPamSqlConnectionDetails;

    if (accountType === PamAccountType.OracleDB) {
      return withGatewayRetry(
        () => verifyOracleViaGateway({ connectionDetails, auth, gatewayId, gatewayPoolId }, deps),
        "verify"
      );
    }

    try {
      await withPamSqlClient(
        { accountType: accountType as TSqlRotatableType, connectionDetails, auth, gatewayId, gatewayPoolId },
        deps,
        async (client) => {
          await client
            .raw(getSqlConnectionVerifyQuery(PAM_ROTATION_APP_MAP[accountType as TSqlRotatableType]))
            .timeout(SQL_QUERY_TIMEOUT);
        }
      );
      return true;
    } catch {
      return false;
    }
  }
};

export const winrmPortFromConn = (conn: Record<string, unknown>): number =>
  typeof conn.winrmPort === "number" ? conn.winrmPort : DEFAULT_WINRM_PORT;

export const winrmTransportFromConn = (
  conn: Record<string, unknown>
): { useHttps: boolean; insecure: boolean; caCertificate?: string } => {
  const useHttps = Boolean(conn.useWinrmHttps);
  return {
    useHttps,
    // insecure skips cert verification (HTTPS only); it maps from the account's reject-unauthorized flag
    insecure: useHttps && conn.winrmRejectUnauthorized === false,
    caCertificate: typeof conn.winrmCaCert === "string" ? conn.winrmCaCert : undefined
  };
};

// Local accounts rotate on their own host; domain accounts rotate on the DC (which has the AD tooling).
const winrmRotationTargetHost = (accountType: TRotatableType, connectionDetails: Record<string, unknown>): string => {
  if (accountType === PamAccountType.WindowsAd) {
    const conn = connectionDetails as TWindowsAdConnectionDetails;
    if (!conn.dcAddress) {
      throw new BadRequestError({ message: "Windows AD account is missing a domain controller address" });
    }
    return conn.dcAddress;
  }
  const conn = connectionDetails as TWindowsConnectionDetails;
  if (!conn.host) throw new BadRequestError({ message: "Windows account is missing a host" });
  return conn.host;
};

// Set-ADAccountPassword -Identity and Set-LocalUser -Name want a bare sAMAccountName, not DOMAIN\user or a
// UPN (both accepted by the account schema), so strip any domain qualifier before building the rotate script.
// The identity WinRM connects AS must be domain-qualified for a domain rotator: NTLM resolves a bare name
// against the target's local SAM (and 401s), so qualify to a UPN. Local accounts stay bare.
export const winrmConnectUsername = (
  accountType: TRotatableType,
  connectionDetails: Record<string, unknown>,
  username: string
): string => {
  if (accountType !== PamAccountType.WindowsAd) return username;
  if (username.includes("\\") || username.includes("@")) return username;
  const { domain } = connectionDetails as TWindowsAdConnectionDetails;
  return domain ? `${username}@${domain}` : username;
};

const windowsRotationHandler: TPamRotationHandler = {
  validateTarget: () => {
    // Domain rotation needs a delegated admin (an account can't -Reset itself); AD enforces this at runtime.
  },

  applyPasswordChange: async (input, deps) => {
    const { accountType, connectionDetails, auth, targetUsername, newPassword, gatewayId, gatewayPoolId } = input;
    const targetHost = winrmRotationTargetHost(accountType, connectionDetails);
    const resolvedGatewayId = await resolveRotationGatewayId(deps, gatewayId, gatewayPoolId);

    try {
      await winrmRpcWithGateway<{ ok: boolean }>({
        targetHost,
        targetPort: winrmPortFromConn(connectionDetails),
        gatewayId: resolvedGatewayId,
        gatewayV2Service: deps.gatewayV2Service,
        endpoint: WinRmRpcEndpoint.RotateCredential,
        credentials: {
          username: winrmConnectUsername(accountType, connectionDetails, auth.username),
          password: auth.password,
          ...winrmTransportFromConn(connectionDetails)
        },
        params: {
          kind: accountType === PamAccountType.WindowsAd ? "domain" : "local",
          targetUsername: toBareAccountName(targetUsername),
          newPassword
        }
      });
    } catch (err) {
      throw new Error(redactRotationError(err, [newPassword, auth.password]));
    }
  },

  testCredential: async (input, deps) => {
    const { accountType, connectionDetails, auth, verifyVia, gatewayId, gatewayPoolId } = input;
    const resolvedGatewayId = await resolveRotationGatewayId(deps, gatewayId, gatewayPoolId);
    const transport = winrmTransportFromConn(connectionDetails);

    if (accountType === PamAccountType.WindowsAd) {
      // A domain service account usually can't WinRM to the DC, but an LDAP bind needs only the credential.
      const conn = connectionDetails as TWindowsAdConnectionDetails;
      const { dcAddress, domain } = conn;
      if (!dcAddress || !domain) return false;
      const bindDn =
        auth.username.includes("\\") || auth.username.includes("@") ? auth.username : `${auth.username}@${domain}`;
      // ldapBindCheckViaGateway returns false only on a real auth rejection and throws on transport errors, so
      // withGatewayRetry retries a transient gateway/TLS blip instead of misreporting a valid credential as wrong.
      return withGatewayRetry(
        () =>
          ldapBindCheckViaGateway(
            {
              dcAddress,
              port: conn.port ?? 389,
              useLdaps: conn.useLdaps ?? false,
              rejectUnauthorized: conn.ldapRejectUnauthorized ?? true,
              caCert: conn.ldapCaCert,
              tlsServerName: conn.ldapTlsServerName,
              bindDn,
              password: auth.password
            },
            resolvedGatewayId,
            deps.gatewayV2Service
          ),
        "verify"
      );
    }

    const targetHost = winrmRotationTargetHost(accountType, connectionDetails);
    const targetPort = winrmPortFromConn(connectionDetails);

    // Delegated local rotation: the target usually can't WinRM in, so the rotator validates the credential on
    // the box. A wrong password comes back valid=false (definitive); a transport error throws and is retried.
    if (verifyVia) {
      return withGatewayRetry(async () => {
        const { valid } = await winrmRpcWithGateway<{ valid: boolean }>({
          targetHost,
          targetPort,
          gatewayId: resolvedGatewayId,
          gatewayV2Service: deps.gatewayV2Service,
          endpoint: WinRmRpcEndpoint.ValidateCredential,
          credentials: { username: verifyVia.username, password: verifyVia.password, ...transport },
          params: { targetUsername: toBareAccountName(auth.username), password: auth.password }
        });
        return valid;
      }, "verify");
    }

    // Self-rotation: the account can log in (that's how it applied the change), so prove the credential directly.
    return withGatewayRetry(async () => {
      await winrmRpcWithGateway<{ ok: boolean }>({
        targetHost,
        targetPort,
        gatewayId: resolvedGatewayId,
        gatewayV2Service: deps.gatewayV2Service,
        endpoint: WinRmRpcEndpoint.Test,
        credentials: { username: auth.username, password: auth.password, ...transport }
      });
      return true;
    }, "verify");
  }
};

// Full Record over the rotatable types so a missing handler entry is a compile error.
export const PAM_ROTATION_FACTORY_MAP: Record<TRotatableType, TPamRotationHandler> = {
  [PamAccountType.Postgres]: sqlRotationHandler,
  [PamAccountType.MySQL]: sqlRotationHandler,
  [PamAccountType.MsSQL]: sqlRotationHandler,
  [PamAccountType.OracleDB]: sqlRotationHandler,
  [PamAccountType.Windows]: windowsRotationHandler,
  [PamAccountType.WindowsAd]: windowsRotationHandler
};
