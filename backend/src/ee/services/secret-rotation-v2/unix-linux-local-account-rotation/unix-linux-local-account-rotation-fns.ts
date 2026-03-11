import { Client, ClientChannel } from "ssh2";

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

const SHELL_TIMEOUT = 15_000;

// Execute a command via SSH exec with a PTY (no login shell, no MOTD)
// Returns a stream that can be used for interactive I/O
const execCommandWithPty = (client: Client, command: string): Promise<ClientChannel> => {
  return new Promise((resolve, reject) => {
    client.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        reject(new Error(`SSH exec error: ${err.message}`));
        return;
      }
      resolve(stream);
    });
  });
};

// Change password for managed rotation (admin changing another user's password)
// Uses `sudo passwd <username>` (or `passwd <username>`) executed via PTY
const changeManagedPassword = async (
  client: Client,
  targetUsername: string,
  newPassword: string,
  useSudo: boolean = false,
  appConnectionPassword?: string
): Promise<void> => {
  const command = useSudo ? `sudo passwd ${targetUsername}` : `passwd ${targetUsername}`;
  const stream = await execCommandWithPty(client, command);

  return new Promise((resolve, reject) => {
    let output = "";
    let step = 0;
    let completed = false;
    let settled = false;
    let errorMessage = "";

    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        stream.end();
        safeReject(new Error(`Password change timed out. Output: ${output}`));
      }
    }, SHELL_TIMEOUT);

    stream.on("data", (data: Buffer) => {
      if (settled) return;

      const text = data.toString();
      output += text;
      const lower = text.toLowerCase();

      if (step === 0 && lower.includes("[sudo]")) {
        // sudo is asking for the logged-in user's password
        if (!appConnectionPassword) {
          clearTimeout(timeout);
          safeReject(
            new Error(
              "sudo is requesting a password but the app connection uses SSH key authentication. Configure the app connection with password authentication, or configure NOPASSWD in sudoers for this user."
            )
          );
          stream.end();
          return;
        }
        stream.write(`${appConnectionPassword}\n`);
        // stay at step 0 to catch "New password" next
      } else if (step === 0 && lower.includes("new password")) {
        stream.write(`${newPassword}\n`);
        step = 1;
      } else if (
        step === 1 &&
        (lower.includes("retype") || lower.includes("again") || lower.includes("new password"))
      ) {
        stream.write(`${newPassword}\n`);
        step = 2;
      } else if (step >= 2 && (lower.includes("success") || lower.includes("updated") || lower.includes("changed"))) {
        completed = true;
        clearTimeout(timeout);
        stream.end();
      } else if (
        step >= 0 &&
        (lower.includes("authentication failure") ||
          lower.includes("sorry") ||
          lower.includes("unknown user") ||
          lower.includes("user not known") ||
          lower.includes("does not exist"))
      ) {
        errorMessage = text.trim();
        clearTimeout(timeout);
        stream.end();
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (errorMessage && !completed) {
        reject(new Error(`Password change failed: ${errorMessage}`));
      } else if (completed || step >= 2) {
        resolve();
      } else {
        reject(new Error(`Password change incomplete (step ${step}). Output: ${output}`));
      }
    });

    stream.on("error", (streamErr: Error) => {
      clearTimeout(timeout);
      safeReject(new Error(`Stream error: ${streamErr.message}`));
    });
  });
};

// Change password for self rotation (user changing their own password)
// Uses `passwd` executed via PTY to handle interactive prompts
const changeSelfPassword = async (client: Client, oldPassword: string, newPassword: string): Promise<void> => {
  const stream = await execCommandWithPty(client, "passwd");

  return new Promise((resolve, reject) => {
    let output = "";
    let step = 0;
    let completed = false;
    let settled = false;
    let errorMessage = "";

    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        stream.end();
        safeReject(new Error(`Password change timed out. Output: ${output}`));
      }
    }, SHELL_TIMEOUT);

    stream.on("data", (data: Buffer) => {
      if (settled) return;

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
      } else if (step === 3 && (lower.includes("success") || lower.includes("updated") || lower.includes("changed"))) {
        // Password changed successfully
        completed = true;
        clearTimeout(timeout);
        stream.end();
      } else if (step >= 1 && (lower.includes("error") || lower.includes("fail") || lower.includes("unchanged"))) {
        // Password change failed
        errorMessage = text.trim();
        clearTimeout(timeout);
        stream.end();
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (errorMessage && !completed) {
        reject(new Error(`Password change failed: ${errorMessage}`));
      } else if (completed || step >= 3) {
        resolve();
      } else {
        reject(new Error(`Password change incomplete (step ${step}). Output: ${output}`));
      }
    });

    stream.on("error", (streamErr: Error) => {
      clearTimeout(timeout);
      safeReject(new Error(`Stream error: ${streamErr.message}`));
    });
  });
};

// Verify credentials by using `su - <username>` via an existing SSH connection
// Used as fallback when direct SSH login is not allowed for the target account
const verifySuLogin = async (client: Client, targetUsername: string, targetPassword: string): Promise<void> => {
  const stream = await execCommandWithPty(client, `su - ${targetUsername}`);

  return new Promise((resolve, reject) => {
    let output = "";
    let step = 0;
    let completed = false;
    let settled = false;

    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        stream.end();
        safeReject(new Error(`su verification timed out. Output: ${output}`));
      }
    }, SHELL_TIMEOUT);

    stream.on("data", (data: Buffer) => {
      if (settled) return;

      const text = data.toString();
      output += text;
      const lower = text.toLowerCase();

      if (step === 0 && lower.includes("password")) {
        // su is asking for the target user's password
        stream.write(`${targetPassword}\n`);
        step = 1;
      } else if (step === 1) {
        if (lower.includes("authentication failure") || lower.includes("incorrect password") || lower.includes("su:")) {
          clearTimeout(timeout);
          safeReject(new Error(`su authentication failed for user ${targetUsername}. Output: ${text.trim()}`));
          stream.end();
          return;
        }
        // After successful su, run whoami
        stream.write("whoami\n");
        step = 2;
      } else if (step === 2 && lower.includes(targetUsername.toLowerCase())) {
        // whoami confirmed we are the target user
        completed = true;
        clearTimeout(timeout);
        stream.write("exit\n");
        stream.end();
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (completed) {
        resolve();
      } else {
        reject(new Error(`su verification failed for user ${targetUsername}. Output: ${output}`));
      }
    });

    stream.on("error", (streamErr: Error) => {
      clearTimeout(timeout);
      safeReject(new Error(`Stream error: ${streamErr.message}`));
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
    rotationMethod = UnixLinuxLocalAccountRotationMethod.LoginAsRoot,
    useSudo
  } = parameters;
  const shouldUseSudo = Boolean(useSudo);

  // Helper to verify SSH credentials work
  // Tries direct SSH first, then falls back to su via app connection
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

    // Attempt 1: Direct SSH login with target credentials
    let directSshError: string | undefined;
    try {
      await executeWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
        const client = await getSshConnectionClient(verifyConfig, targetHost, targetPort);
        client.destroy();
      });
      return; // Direct SSH worked
    } catch (error) {
      directSshError = (error as Error).message;
      logger.info(
        "Unix/Linux Local Account Rotation: Direct SSH verification failed [username=%s], falling back to su verification. Error: %s",
        targetUsername,
        directSshError
      );
    }

    // Attempt 2: SSH with app connection, then su to target user
    const appConnConfig: TSshConnectionConfig = {
      method: connection.method,
      app: connection.app,
      orgId: connection.orgId,
      gatewayId: connection.gatewayId,
      credentials: connection.credentials
    } as TSshConnectionConfig;

    try {
      await executeWithPotentialGateway(appConnConfig, gatewayV2Service, async (targetHost, targetPort) => {
        const client = await getSshConnectionClient(appConnConfig, targetHost, targetPort);
        try {
          await verifySuLogin(client, targetUsername, targetPassword);
        } finally {
          client.destroy();
        }
      });
    } catch (suError) {
      throw new Error(
        `Failed to verify credentials. Direct SSH login failed: ${directSshError}. Fallback su verification also failed: ${(suError as Error).message}`
      );
    }
  };

  // Main password rotation logic
  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const { credentials } = connection;
    const newPassword = generatePassword(passwordRequirements);

    const isSelfRotation = rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget;
    if (username === credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

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
          // Managed rotation: admin changes user's password using passwd (with sudo if specified)
          const appConnectionPassword =
            connection.method === SshConnectionMethod.Password
              ? (connection.credentials as { password: string }).password
              : undefined;
          await changeManagedPassword(client, username, newPassword, shouldUseSudo, appConnectionPassword);
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
