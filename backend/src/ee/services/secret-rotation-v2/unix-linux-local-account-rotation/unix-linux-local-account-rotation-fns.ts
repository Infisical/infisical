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
import { UnixLinuxLocalAccountRotationMethod } from "./unix-linux-local-account-rotation-schemas";
import {
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput,
  TUnixLinuxLocalAccountRotationWithConnection
} from "./unix-linux-local-account-rotation-types";

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
  const encodedPassword = Buffer.from(`${username}:${newPassword}`).toString("base64");
  const command = `echo '${encodedPassword}' | base64 -d | sudo chpasswd`;

  try {
    await executeCommand(client, command);
  } catch (error) {
    logger.error(error, "Unix/Linux Local Account Rotation: Failed to change password (managed)");
    throw new Error(`Failed to change password: ${(error as Error).message}`);
  }
};

// Change password for self rotation (user changing their own password)
// Uses interactive shell to handle passwd command prompts
const changeSelfPassword = async (client: Client, oldPassword: string, newPassword: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    client.shell((err, stream) => {
      if (err) {
        reject(new Error(`Failed to start shell: ${err.message}`));
        return;
      }

      let output = "";
      let step = 0;
      let completed = false;
      let errorMessage = "";

      const timeout = setTimeout(() => {
        if (!completed) {
          stream.end("exit\n");
          reject(new Error(`Password change timed out. Output: ${output}`));
        }
      }, 15000); // 15 second timeout

      stream.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        const lower = text.toLowerCase();

        // Handle passwd prompts step by step
        if (step === 0 && lower.includes("password")) {
          // Current/old password prompt (could be "Current password:", "Old password:", etc.)
          stream.write(`${oldPassword}\n`);
          step = 1;
        } else if (step === 1 && lower.includes("new password")) {
          // New password prompt
          stream.write(`${newPassword}\n`);
          step = 2;
        } else if (
          step === 2 &&
          (lower.includes("retype") || lower.includes("again") || lower.includes("new password"))
        ) {
          // Confirm new password prompt
          stream.write(`${newPassword}\n`);
          step = 3;
        } else if (
          step === 3 &&
          (lower.includes("success") || lower.includes("updated") || lower.includes("changed"))
        ) {
          // Password changed successfully
          completed = true;
          clearTimeout(timeout);
          stream.end("exit\n");
        } else if (step >= 1 && (lower.includes("error") || lower.includes("fail") || lower.includes("unchanged"))) {
          // Password change failed
          errorMessage = text.trim();
          stream.end("exit\n");
        }
      });

      stream.on("close", () => {
        clearTimeout(timeout);
        if (completed || step >= 3) {
          // If we got to step 3 without explicit error, consider it success
          if (errorMessage && !completed) {
            reject(new Error(`Password change failed: ${errorMessage}`));
          } else {
            resolve();
          }
        } else {
          reject(new Error(`Password change incomplete (step ${step}). Output: ${output}`));
        }
      });

      stream.on("error", (streamErr: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Stream error: ${streamErr.message}`));
      });

      // Initiate passwd command
      stream.write("passwd\n");
    });
  });
};

export const unixLinuxLocalAccountRotationFactory: TRotationFactory<
  TUnixLinuxLocalAccountRotationWithConnection,
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, _gatewayService, gatewayV2Service) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const {
    username,
    passwordRequirements,
    rotationMethod = UnixLinuxLocalAccountRotationMethod.LoginAsRoot
  } = parameters;

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

    const isSelfRotation = rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget;
    if (username === credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const privilegedAccounts = ["root", "admin", "administrator", "sudo"];
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
          // Self rotation: user changes their own password using passwd command
          await changeSelfPassword(client, currentPassword, newPassword);
        } else {
          // Managed rotation: admin changes user's password using sudo chpasswd
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
    TUnixLinuxLocalAccountRotationGeneratedCredentials,
    TUnixLinuxLocalAccountRotationInput["temporaryParameters"]
  > = async (callback, temporaryParameters) => {
    const credentials = await $rotatePassword(temporaryParameters?.password);
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TUnixLinuxLocalAccountRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    const currentPassword = credentialsToRevoke[activeIndex].password;
    // We just rotate to a new password, essentially revoking old credentials
    // For self rotation: we need current password to authenticate
    // For managed rotation: admin uses their own credentials
    await $rotatePassword(currentPassword);
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TUnixLinuxLocalAccountRotationGeneratedCredentials
  > = async (_, callback, activeCredentials) => {
    // For both methods, pass the current password
    // Self rotation: needed to authenticate as the user
    // Managed rotation: admin doesn't need it but it's harmless to pass
    const credentials = await $rotatePassword(activeCredentials.password);
    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TUnixLinuxLocalAccountRotationGeneratedCredentials> = (
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
