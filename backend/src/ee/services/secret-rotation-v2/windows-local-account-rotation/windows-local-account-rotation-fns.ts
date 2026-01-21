import { Client } from "ssh2";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  executeWithPotentialGateway,
  getSshConnectionClient,
  SshConnectionMethod,
  TSshConnectionConfig
} from "@app/services/app-connection/ssh";

import { generatePassword } from "../shared/utils";
import { WindowsLocalAccountRotationMethod } from "./windows-local-account-rotation-schemas";
import {
  TWindowsLocalAccountRotationGeneratedCredentials,
  TWindowsLocalAccountRotationInput,
  TWindowsLocalAccountRotationWithConnection
} from "./windows-local-account-rotation-types";

// Execute command over SSH and return stdout
const executeCommand = (client: Client, command: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(new Error(`SSH exec error: ${err.message}`));
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("close", (code: number) => {
        if (code !== 0) {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || "Unknown error"}`));
        } else {
          resolve(stdout);
        }
      });

      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
    });
  });
};

// Change password for managed rotation (admin changing another user's password)
const changeManagedPassword = async (client: Client, username: string, newPassword: string): Promise<void> => {
  // Using base64 encoding to avoid any shell escaping issues
  const encodedPassword = Buffer.from(newPassword).toString("base64");
  const encodedUsername = Buffer.from(username).toString("base64");
  const command = `powershell -Command "$u = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedUsername}')); $p = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPassword}')); net user $u $p"`;

  try {
    await executeCommand(client, command);
  } catch (error) {
    logger.error(error, "Windows Local Account Rotation: Failed to change password (managed)");
    throw new Error(`Failed to change password: ${(error as Error).message}`);
  }
};

// Change password for self rotation (user changing their own password)
// Windows net user command works the same for self-rotation on local accounts
const changeSelfPassword = async (client: Client, username: string, newPassword: string): Promise<void> => {
  // Using base64 encoding to avoid any shell escaping issues
  const encodedPassword = Buffer.from(newPassword).toString("base64");
  const encodedUsername = Buffer.from(username).toString("base64");
  const command = `powershell -Command "$u = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedUsername}')); $p = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPassword}')); net user $u $p"`;

  try {
    await executeCommand(client, command);
  } catch (error) {
    logger.error(error, "Windows Local Account Rotation: Failed to change password (self)");
    throw new Error(`Failed to change password: ${(error as Error).message}`);
  }
};

export const windowsLocalAccountRotationFactory: TRotationFactory<
  TWindowsLocalAccountRotationWithConnection,
  TWindowsLocalAccountRotationGeneratedCredentials,
  TWindowsLocalAccountRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, _gatewayService, gatewayV2Service) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = WindowsLocalAccountRotationMethod.LoginAsRoot } = parameters;

  // Helper to verify SSH credentials work
  const $verifyCredentials = async (targetUsername: string, targetPassword: string): Promise<void> => {
    const verifyConfig: TSshConnectionConfig = {
      method: SshConnectionMethod.Password,
      app: connection.app,
      orgId: connection.orgId,
      gatewayId: connection.gatewayId,
      credentials: {
        host: connection.credentials.host,
        port: connection.credentials.port,
        username: targetUsername,
        password: targetPassword
      }
    };

    try {
      await executeWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
        const client = await getSshConnectionClient(verifyConfig, targetHost, targetPort);
        client.destroy();
      });
    } catch (error) {
      throw new Error(`Failed to verify credentials - ${(error as Error).message}`);
    }
  };

  // Main password rotation logic
  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const { credentials } = connection;
    const newPassword = generatePassword(passwordRequirements);

    const isSelfRotation = rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget;
    if (username === credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const privilegedAccounts = ["administrator", "admin"];
    if (privilegedAccounts.includes(username.toLowerCase()))
      throw new BadRequestError({ message: "Cannot rotate passwords for privileged system accounts." });

    // Determine which credentials to use for the SSH connection
    let connectConfig: TSshConnectionConfig;

    if (isSelfRotation && currentPassword) {
      // For self-rotation with current password, connect as the target user
      connectConfig = {
        method: SshConnectionMethod.Password,
        app: connection.app,
        orgId: connection.orgId,
        gatewayId: connection.gatewayId,
        credentials: {
          host: credentials.host,
          port: credentials.port,
          username,
          password: currentPassword
        }
      };
    } else {
      // For managed rotation, connect with the app connection credentials (admin)
      connectConfig = {
        method: connection.method,
        app: connection.app,
        orgId: connection.orgId,
        gatewayId: connection.gatewayId,
        credentials: connection.credentials
      } as TSshConnectionConfig;
    }

    await executeWithPotentialGateway(connectConfig, gatewayV2Service, async (targetHost, targetPort) => {
      const client = await getSshConnectionClient(connectConfig, targetHost, targetPort);

      try {
        if (isSelfRotation && currentPassword) {
          // Self rotation: user changes their own password using net user command
          await changeSelfPassword(client, username, newPassword);
        } else {
          // Managed rotation: admin changes user's password using net user command
          await changeManagedPassword(client, username, newPassword);
        }
      } finally {
        client.destroy();
      }
    });

    // Verify the new credentials work
    await $verifyCredentials(username, newPassword);

    return { username, password: newPassword };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TWindowsLocalAccountRotationGeneratedCredentials,
    TWindowsLocalAccountRotationInput["temporaryParameters"]
  > = async (callback, temporaryParameters) => {
    const credentials = await $rotatePassword(temporaryParameters?.password);
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TWindowsLocalAccountRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const currentPassword = credentialsToRevoke[activeIndex].password;
    // We just rotate to a new password, essentially revoking old credentials
    // For self rotation: we need current password to authenticate
    // For managed rotation: admin uses their own credentials
    await $rotatePassword(currentPassword);
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TWindowsLocalAccountRotationGeneratedCredentials> = async (
    _,
    callback,
    activeCredentials
  ) => {
    // For both methods, pass the current password
    // Self rotation: needed to authenticate as the user
    // Managed rotation: admin doesn't need it but it's harmless to pass
    const credentials = await $rotatePassword(activeCredentials.password);
    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TWindowsLocalAccountRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    return [
      { key: secretsMapping.username, value: generatedCredentials.username },
      { key: secretsMapping.password, value: generatedCredentials.password }
    ];
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
