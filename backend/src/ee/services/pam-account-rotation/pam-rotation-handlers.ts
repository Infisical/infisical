import { BadRequestError } from "@app/lib/errors";
import { WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import {
  getRoleUsernameForHost,
  getSqlConnectionVerifyQuery,
  SQL_CONNECTION_ALTER_LOGIN_STATEMENT
} from "@app/services/app-connection/shared/sql";

import { PamAccountType } from "../pam/pam-enums";
import { ldapBindCheckViaGateway, winrmRpcWithGateway } from "../pam-discovery/pam-discovery-fns";
import { PAM_ROTATION_APP_MAP, redactRotationError, TRotatableType, TSqlRotatableType } from "./pam-rotation-fns";
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
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export type TPamRotationHandler = {
  validateTarget: (input: { accountType: TRotatableType; authMethod?: string }) => void;
  applyPasswordChange: (input: TApplyPasswordChangeInput, deps: TPamRotationGatewayDeps) => Promise<void>;
  // Returns whether the credential authenticates; never throws, so the recovery probe can rely on it.
  testCredential: (input: TTestCredentialInput, deps: TPamRotationGatewayDeps) => Promise<boolean>;
};

const sqlRotationHandler: TPamRotationHandler = {
  validateTarget: ({ accountType, authMethod }) => {
    // MSSQL Windows-auth (ntlm/kerberos) logins have no SQL-managed password to change, so only sql-login rotates.
    if (accountType === PamAccountType.MsSQL && authMethod !== "sql-login") {
      throw new BadRequestError({ message: "MSSQL rotation supports SQL Server authentication only" });
    }
  },

  applyPasswordChange: async (input, deps) => {
    const { accountType, auth, targetUsername, newPassword, gatewayId, gatewayPoolId } = input;
    const connectionDetails = input.connectionDetails as TPamSqlConnectionDetails;
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

// Windows accounts have no per-account WinRM port in their connection details, so use the WinRM HTTP default.
const WINRM_ROTATION_PORT = 5985;

type TWindowsConnDetails = { host?: string };
type TWindowsAdConnDetails = {
  domain?: string;
  dcAddress?: string;
  port?: number;
  useLdaps?: boolean;
  ldapRejectUnauthorized?: boolean;
  ldapCaCert?: string;
  ldapTlsServerName?: string;
};

// Local accounts rotate on their own host; domain accounts rotate on the DC (which has the AD tooling).
const winrmRotationTargetHost = (accountType: TRotatableType, connectionDetails: Record<string, unknown>): string => {
  if (accountType === PamAccountType.WindowsAd) {
    const conn = connectionDetails as TWindowsAdConnDetails;
    if (!conn.dcAddress) {
      throw new BadRequestError({ message: "Windows AD account is missing a domain controller address" });
    }
    return conn.dcAddress;
  }
  const conn = connectionDetails as TWindowsConnDetails;
  if (!conn.host) throw new BadRequestError({ message: "Windows account is missing a host" });
  return conn.host;
};

const resolveRotationGatewayId = async (
  deps: TPamRotationGatewayDeps,
  gatewayId?: string | null,
  gatewayPoolId?: string | null
): Promise<string> => {
  const resolved = gatewayPoolId
    ? await deps.gatewayPoolService.resolveEffectiveGatewayId({ gatewayId, gatewayPoolId })
    : gatewayId;
  if (!resolved) throw new BadRequestError({ message: "No healthy gateway available for Windows rotation" });
  return resolved;
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
        targetPort: WINRM_ROTATION_PORT,
        gatewayId: resolvedGatewayId,
        gatewayV2Service: deps.gatewayV2Service,
        endpoint: WinRmRpcEndpoint.RotateCredential,
        credentials: { username: auth.username, password: auth.password },
        params: {
          kind: accountType === PamAccountType.WindowsAd ? "domain" : "local",
          targetUsername,
          newPassword
        }
      });
    } catch (err) {
      throw new Error(redactRotationError(err, [newPassword, auth.password]));
    }
  },

  testCredential: async (input, deps) => {
    const { accountType, connectionDetails, auth, gatewayId, gatewayPoolId } = input;
    try {
      const resolvedGatewayId = await resolveRotationGatewayId(deps, gatewayId, gatewayPoolId);

      if (accountType === PamAccountType.WindowsAd) {
        // A domain service account usually can't WinRM to the DC, but an LDAP bind needs only the credential.
        const conn = connectionDetails as TWindowsAdConnDetails;
        if (!conn.dcAddress || !conn.domain) return false;
        const bindDn =
          auth.username.includes("\\") || auth.username.includes("@")
            ? auth.username
            : `${auth.username}@${conn.domain}`;
        return await ldapBindCheckViaGateway(
          {
            dcAddress: conn.dcAddress,
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
        );
      }

      // Local account: prove the credential over WinRM against its own host.
      await winrmRpcWithGateway<{ ok: boolean }>({
        targetHost: winrmRotationTargetHost(accountType, connectionDetails),
        targetPort: WINRM_ROTATION_PORT,
        gatewayId: resolvedGatewayId,
        gatewayV2Service: deps.gatewayV2Service,
        endpoint: WinRmRpcEndpoint.Test,
        credentials: { username: auth.username, password: auth.password }
      });
      return true;
    } catch {
      return false;
    }
  }
};

// Full Record over the rotatable types so a missing handler entry is a compile error.
export const PAM_ROTATION_FACTORY_MAP: Record<TRotatableType, TPamRotationHandler> = {
  [PamAccountType.Postgres]: sqlRotationHandler,
  [PamAccountType.MySQL]: sqlRotationHandler,
  [PamAccountType.MsSQL]: sqlRotationHandler,
  [PamAccountType.Windows]: windowsRotationHandler,
  [PamAccountType.WindowsAd]: windowsRotationHandler
};
