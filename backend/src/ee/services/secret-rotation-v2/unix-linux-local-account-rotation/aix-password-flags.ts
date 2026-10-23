import RE2 from "re2";
import { Client } from "ssh2";

import { logger } from "@app/lib/logger";
import { execOverSshClient } from "@app/services/app-connection/ssh";

import { SHELL_TIMEOUT } from "./pty-expect-engine";

const AIX_PASSWORD_FLAGS = new RE2("flags=([^\\r\\n]*)");
const AIX_PASSWORD_FLAG_NAME = new RE2("^[A-Za-z0-9_]+$");

const AIX_SECURITY_PASSWD_FILE = "/etc/security/passwd";
const AIX_ADMCHG_FLAG = "ADMCHG";

export type TAixCommandResult = { output: string; exitCode: number | null };

export type TAixFlagContext = {
  targetUsername: string;
  useSudo: boolean;
  runCommand: (command: string) => Promise<TAixCommandResult>;
};

export const parseAixPasswordFlags = (lssecOutput: string): string[] | undefined => {
  const match = AIX_PASSWORD_FLAGS.exec(lssecOutput);
  if (!match) return undefined;

  const flags = match[1]
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);

  // The flags are written back into a shell command, so anything but a plain flag name is rejected.
  return flags.every((flag) => AIX_PASSWORD_FLAG_NAME.test(flag)) ? flags : undefined;
};

export const isAixHost = async (client: Client): Promise<boolean> => {
  try {
    const { stdout, stderr, exitCode } = await execOverSshClient(client, "uname -s", SHELL_TIMEOUT);
    if (exitCode !== 0) {
      logger.warn(
        `Unix/Linux Local Account Rotation: \`uname -s\` exited with code ${exitCode}, assuming a non-AIX host. Output: ${stderr.trim() || stdout.trim()}`
      );
      return false;
    }
    return stdout.trim() === "AIX";
  } catch (error) {
    throw new Error(
      `Could not detect the host's operating system, so the password was not changed: ${(error as Error).message}`
    );
  }
};

const readAixPasswordFlags = async (ctx: TAixFlagContext): Promise<{ flags?: string[]; output: string }> => {
  const { output, exitCode } = await ctx.runCommand(
    `lssec -f ${AIX_SECURITY_PASSWD_FILE} -s ${ctx.targetUsername} -a flags`
  );
  return { flags: exitCode === 0 ? parseAixPasswordFlags(output) : undefined, output };
};

const writeAixPasswordFlags = async (
  ctx: TAixFlagContext,
  flags: string[]
): Promise<{ succeeded: boolean; output: string }> => {
  const { output, exitCode } = await ctx.runCommand(
    `chsec -f ${AIX_SECURITY_PASSWD_FILE} -s ${ctx.targetUsername} -a flags=${flags.join(",")}`
  );
  return { succeeded: exitCode === 0, output };
};

const aixSudoHint = (ctx: TAixFlagContext) =>
  ctx.useSudo ? " If sudo is restricted, allow lssec and chsec in sudoers for the app connection user." : "";

// Rewriting the flags unchanged proves lssec and chsec both work before the password changes. A
// failure after passwd would leave a password nobody knows, since Infisical only stores it once
// the rotation succeeds.
export const ensureAixPasswordFlagsWritable = async (ctx: TAixFlagContext): Promise<void> => {
  const notChanged = (problem: string, output: string) =>
    new Error(
      `Could not ${problem} the AIX password flags for user '${ctx.targetUsername}', so the password was not changed. Infisical must clear the ${AIX_ADMCHG_FLAG} flag that AIX sets on every password an administrator changes.${aixSudoHint(ctx)} Output: ${output}`
    );

  const { flags, output: readOutput } = await readAixPasswordFlags(ctx);
  if (!flags) throw notChanged("read", readOutput);

  const { succeeded, output: writeOutput } = await writeAixPasswordFlags(ctx, flags);
  if (!succeeded) throw notChanged("update", writeOutput);
};

// AIX adds ADMCHG to the account's flags whenever root or the security group sets its password,
// forcing a password change at next login. Login-only verification cannot see the flag because
// OpenSSH on AIX applies the forced change only once a session starts, so a non-interactive
// `ssh host command` fails with "Password change required but no TTY available".
export const clearAixAdminChangeFlag = async (ctx: TAixFlagContext): Promise<void> => {
  const fail = (detail: string) =>
    new Error(
      `Password was changed but clearing the AIX ${AIX_ADMCHG_FLAG} flag for user '${ctx.targetUsername}' failed, so the new password was not saved and the account will be forced to change its password at next login. Rotate the secret again to set a new password.${aixSudoHint(ctx)} ${detail}`
    );

  let flags: string[] | undefined;
  let readOutput: string;
  try {
    ({ flags, output: readOutput } = await readAixPasswordFlags(ctx));
  } catch (error) {
    throw fail((error as Error).message);
  }
  if (!flags) throw fail(`Output: ${readOutput}`);
  if (!flags.includes(AIX_ADMCHG_FLAG)) return;

  let result: { succeeded: boolean; output: string };
  try {
    result = await writeAixPasswordFlags(
      ctx,
      flags.filter((flag) => flag !== AIX_ADMCHG_FLAG)
    );
  } catch (error) {
    throw fail((error as Error).message);
  }
  if (!result.succeeded) throw fail(`Output: ${result.output}`);
};
