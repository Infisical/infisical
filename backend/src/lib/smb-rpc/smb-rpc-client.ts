import { spawn } from "child_process";

export interface SmbRpcConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  domain?: string;
}

const SMB3_SECURITY_OPTIONS = ["--option=client min protocol=SMB3", "--option=client smb encrypt=required"];

/**
 * Build the target string (//host:port)
 */
const buildTarget = (config: SmbRpcConfig): string => {
  return `//${config.host}:${config.port}`;
};

/**
 * Helper to build common auth args for SMB commands
 */
const buildAuthArgs = (config: SmbRpcConfig): string[] => {
  const userCredential = config.domain
    ? `${config.domain}\\${config.adminUser}%${config.adminPassword}`
    : `${config.adminUser}%${config.adminPassword}`;

  return ["-U", userCredential, ...SMB3_SECURITY_OPTIONS];
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
      resolve({ stdout, stderr, exitCode: code ?? 0 });
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
  const match = output.match(/NT_STATUS_[A-Z_]+/);
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
  const args = ["-L", buildTarget(config), ...buildAuthArgs(config)];

  const { stdout, stderr, exitCode } = await executeCommand("smbclient", args);
  const combinedOutput = stdout + stderr;

  const ntStatus = parseNtStatusError(combinedOutput);
  if (ntStatus) {
    throw new Error(getNtStatusMessage(ntStatus));
  }

  if (exitCode !== 0) {
    throw new Error(`SMB connection failed: ${combinedOutput || "Unknown error"}`);
  }
};

/**
 * Escape password for rpcclient's internal command parser
 * The password is wrapped in single quotes, with internal single quotes escaped
 */
const escapePasswordForRpc = (password: string): string => {
  return password.replace(/'/g, "'\\''");
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
  const escapedPassword = escapePasswordForRpc(newPassword);
  const rpcCommand = `setuserinfo2 ${targetUser} 23 '${escapedPassword}'`;

  const args = [buildTarget(config), ...buildAuthArgs(config), "-c", rpcCommand];

  const { stdout, stderr, exitCode } = await executeCommand("rpcclient", args);
  const combinedOutput = stdout + stderr;

  const ntStatus = parseNtStatusError(combinedOutput);
  if (ntStatus) {
    throw new Error(getNtStatusMessage(ntStatus));
  }

  if (exitCode !== 0) {
    throw new Error(`Password change failed: ${combinedOutput || "Unknown error"}`);
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
