import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import RE2 from "re2";

import { logger } from "@app/lib/logger";

export interface SmbRpcConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  domain?: string;
}

const SMB3_SECURITY_OPTIONS = ["--option=client min protocol=SMB3", "--option=client smb encrypt=required"];

/**
 * Build the target string (//host)
 */
const buildTarget = (config: SmbRpcConfig): string => {
  return `//${config.host}`;
};

/**
 * Build port args for SMB commands
 */
const buildPortArgs = (config: SmbRpcConfig): string[] => {
  return ["-p", String(config.port)];
};

/**
 * Create a temporary authentication file for Samba tools
 * Format: username = value, password = value, domain = value (optional)
 * Returns the file path
 */
const createAuthFile = (config: SmbRpcConfig): string => {
  const authFilePath = path.join(os.tmpdir(), `smb-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  let content = `username = ${config.adminUser}\npassword = ${config.adminPassword}\n`;
  if (config.domain) {
    content += `domain = ${config.domain}\n`;
  }

  // Write with restrictive permissions (owner read/write only)
  fs.writeFileSync(authFilePath, content, { mode: 0o600 });

  return authFilePath;
};

/**
 * Helper to build common auth args for SMB commands using authentication file
 */
const buildAuthArgs = (authFilePath: string): string[] => {
  return ["-A", authFilePath, ...SMB3_SECURITY_OPTIONS];
};

/**
 * Execute a command and return stdout/stderr
 */
const executeCommand = (
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
};

/**
 * Parse NT_STATUS errors from command output
 */
const parseNtStatusError = (output: string): string | null => {
  const match = new RE2(/NT_STATUS_[A-Z_]+/).exec(output);
  return match ? match[0] : null;
};

/**
 * Get human-readable error message for NT_STATUS codes
 */
const getNtStatusMessage = (ntStatus: string): string => {
  const messages: Record<string, string> = {
    NT_STATUS_LOGON_FAILURE: "Authentication failed - check username and password",
    NT_STATUS_ACCESS_DENIED: "Access denied - user lacks required permissions",
    NT_STATUS_ACCOUNT_LOCKED_OUT: "Account is locked out",
    NT_STATUS_ACCOUNT_DISABLED: "Account is disabled",
    NT_STATUS_PASSWORD_EXPIRED: "Password has expired",
    NT_STATUS_PASSWORD_MUST_CHANGE: "Password must be changed before login",
    NT_STATUS_NO_SUCH_USER: "User does not exist",
    NT_STATUS_INVALID_PARAMETER: "Invalid parameter provided",
    NT_STATUS_CONNECTION_REFUSED: "Connection refused - check if SMB is enabled on target",
    NT_STATUS_HOST_UNREACHABLE: "Host unreachable",
    NT_STATUS_IO_TIMEOUT: "Connection timed out",
    NT_STATUS_UNSUCCESSFUL: `Connection failed - verify SMB is enabled on target, firewall allows the port provided in the connection configuration, and SMB3 protocol is supported`,
    NT_STATUS_PASSWORD_RESTRICTION:
      "Password rejected by Windows policy - ensure Infisical password requirements meet or exceed Windows password policy",
    NT_STATUS_WRONG_PASSWORD: "Incorrect password"
  };

  return messages[ntStatus] || `SMB error: ${ntStatus}`;
};

/**
 * Test SMB connection to a Windows host
 * Uses smbclient to list shares and verify connectivity
 */
const testSmbConnection = async (config: SmbRpcConfig): Promise<void> => {
  const authFilePath = createAuthFile(config);

  try {
    const args = ["-L", buildTarget(config), ...buildPortArgs(config), ...buildAuthArgs(authFilePath)];

    const { stdout, stderr, exitCode } = await executeCommand("smbclient", args);
    const combinedOutput = stdout + stderr;

    const ntStatus = parseNtStatusError(combinedOutput);
    if (ntStatus) {
      throw new Error(getNtStatusMessage(ntStatus));
    }

    if (exitCode !== 0) {
      throw new Error(`SMB connection failed: ${combinedOutput || "Unknown error"}`);
    }
  } finally {
    try {
      fs.unlinkSync(authFilePath);
    } catch (err) {
      logger.warn({ err, authFilePath }, "Failed to cleanup SMB auth file");
    }
  }
};

/**
 * Escape password for rpcclient's internal command parser
 * The password is wrapped in single quotes, with internal single quotes escaped
 */
const escapePasswordForRpc = (password: string): string => {
  return new RE2(/'/g).replace(password, "'\\''");
};

/**
 * Windows local account username validation:
 * - Must start with alphanumeric, underscore, or hyphen (not a period)
 * - Can contain alphanumeric, underscore, hyphen, and period
 * - Max 20 characters for local accounts
 */
const WINDOWS_USERNAME_REGEX = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;
const MAX_USERNAME_LENGTH = 20;

/**
 * Validate that a username contains only safe characters to prevent command injection
 */
export const isValidWindowsUsername = (username: string): boolean => {
  return WINDOWS_USERNAME_REGEX.test(username) && username.length > 0 && username.length <= MAX_USERNAME_LENGTH;
};

/**
 * Change a Windows local account password using rpcclient
 * Uses setuserinfo2 command with level 23 (password reset)
 */
export const changeWindowsPassword = async (
  config: SmbRpcConfig,
  targetUser: string,
  newPassword: string
): Promise<void> => {
  if (!isValidWindowsUsername(targetUser)) {
    throw new Error(
      "Invalid username format - only alphanumeric characters, underscores, hyphens, and periods allowed"
    );
  }

  const authFilePath = createAuthFile(config);

  try {
    const escapedPassword = escapePasswordForRpc(newPassword);
    const rpcCommand = `setuserinfo2 ${targetUser} 23 '${escapedPassword}'`;

    const args = [buildTarget(config), ...buildPortArgs(config), ...buildAuthArgs(authFilePath), "-c", rpcCommand];

    const { stdout, stderr, exitCode } = await executeCommand("rpcclient", args);
    const combinedOutput = stdout + stderr;

    const ntStatus = parseNtStatusError(combinedOutput);
    if (ntStatus) {
      throw new Error(getNtStatusMessage(ntStatus));
    }

    if (exitCode !== 0) {
      throw new Error(`Password change failed: ${combinedOutput || "Unknown error"}`);
    }
  } finally {
    try {
      fs.unlinkSync(authFilePath);
    } catch (err) {
      logger.warn({ err, authFilePath }, "Failed to cleanup SMB auth file");
    }
  }
};

/**
 * Verify Windows credentials by attempting to list shares
 * This is used to verify that a password change was successful
 */
export const verifyWindowsCredentials = async (
  host: string,
  port: number,
  username: string,
  password: string,
  domain?: string
): Promise<void> => {
  const config: SmbRpcConfig = {
    host,
    port,
    adminUser: username,
    adminPassword: password,
    domain
  };

  await testSmbConnection(config);
};
