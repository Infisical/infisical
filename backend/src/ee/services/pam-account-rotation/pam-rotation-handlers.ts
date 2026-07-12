import { BadRequestError } from "@app/lib/errors";
import {
  getRoleUsernameForHost,
  getSqlConnectionVerifyQuery,
  SQL_CONNECTION_ALTER_LOGIN_STATEMENT
} from "@app/services/app-connection/shared/sql";

import { PamAccountType } from "../pam/pam-enums";
import { PAM_ROTATION_APP_MAP, redactRotationError, ROTATABLE_ACCOUNT_TYPES } from "./pam-rotation-fns";
import {
  SQL_QUERY_TIMEOUT,
  TPamRotationGatewayDeps,
  TPamSqlConnectionDetails,
  withPamSqlClient
} from "./shared/pam-rotation-sql-connection";

type TRotatableType = (typeof ROTATABLE_ACCOUNT_TYPES)[number];

type TApplyPasswordChangeInput = {
  accountType: TRotatableType;
  connectionDetails: TPamSqlConnectionDetails;
  // Authenticates the connection: the account's own credential (self) or the rotator's (delegated).
  auth: { username: string; password: string };
  targetUsername: string;
  newPassword: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

type TTestCredentialInput = {
  accountType: TRotatableType;
  connectionDetails: TPamSqlConnectionDetails;
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
    const { accountType, connectionDetails, auth, targetUsername, newPassword, gatewayId, gatewayPoolId } = input;
    // Strip the PlanetScale `<user>.<branch>` suffix so the ALTER targets the real role.
    const roleUsername = getRoleUsernameForHost(targetUsername, connectionDetails.host);
    const [statement, bindings] = SQL_CONNECTION_ALTER_LOGIN_STATEMENT[PAM_ROTATION_APP_MAP[accountType]]({
      username: roleUsername,
      password: newPassword
    });

    try {
      await withPamSqlClient(
        { accountType, connectionDetails, auth, gatewayId, gatewayPoolId },
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
    const { accountType, connectionDetails, auth, gatewayId, gatewayPoolId } = input;
    try {
      await withPamSqlClient(
        { accountType, connectionDetails, auth, gatewayId, gatewayPoolId },
        deps,
        async (client) => {
          await client.raw(getSqlConnectionVerifyQuery(PAM_ROTATION_APP_MAP[accountType])).timeout(SQL_QUERY_TIMEOUT);
        }
      );
      return true;
    } catch {
      return false;
    }
  }
};

// Full Record over the rotatable types so a missing dialect entry is a compile error.
export const PAM_ROTATION_FACTORY_MAP: Record<TRotatableType, TPamRotationHandler> = {
  [PamAccountType.Postgres]: sqlRotationHandler,
  [PamAccountType.MySQL]: sqlRotationHandler,
  [PamAccountType.MsSQL]: sqlRotationHandler
};
