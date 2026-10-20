import RE2 from "re2";
import { Client, ClientChannel } from "ssh2";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  execOverSshClient,
  executeWithPotentialGateway,
  getSshConnectionClient,
  SshConnectionMethod,
  TSshConnectionConfig
} from "@app/services/app-connection/ssh";
import { generatePasswordWithConstraints } from "@app/services/secret-validation-rule/secret-validation-rule-password-generator";

import { generatePassword } from "../shared/utils";
import {
  escapeForPattern,
  lineAt,
  MAX_BUFFER_SIZE,
  runExpectSession,
  SHELL_TIMEOUT,
  TInteractiveShellStream
} from "./pty-expect-engine";
import { UnixLinuxLocalAccountRotationMethod } from "./unix-linux-local-account-rotation-schemas";
import {
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput,
  TUnixLinuxLocalAccountRotationWithConnection
} from "./unix-linux-local-account-rotation-types";

export type { TInteractiveShellStream } from "./pty-expect-engine";

enum ManagedPasswdStep {
  AwaitNewPasswordPrompt,
  AwaitConfirmPrompt,
  AwaitResult
}

enum SelfPasswdStep {
  AwaitCurrentPasswordPrompt,
  AwaitNewPasswordPrompt,
  AwaitConfirmPrompt,
  AwaitResult
}

enum SuVerifyStep {
  AwaitPasswordPrompt,
  AwaitShellReady,
  AwaitWhoamiReply
}

const SUDO_PROMPT = new RE2("\\[sudo\\]", "i");
// sudo's default prompt varies by platform (AIX Toolbox sudo prints a bare "Password:"), so every
// sudo call sets it explicitly to the form SUDO_PROMPT recognizes.
const SUDO = "sudo -p '[sudo] password for %p: '";
const ANY_PASSWORD_PROMPT = new RE2("password", "i");
const NEW_PASSWORD_PROMPT = new RE2("new\\s+password", "i");
const CONFIRM_PASSWORD_PROMPT = new RE2("retype|re-?enter|again|new\\s+password", "i");
const PASSWORD_CHANGE_SUCCEEDED = new RE2("\\b(?:success(?:fully)?|updated|changed)\\b", "i");
const MANAGED_PASSWORD_CHANGE_FAILED = new RE2(
  "\\bauthentication\\s+failure\\b|\\bsorry\\b|\\bunknown\\s+user\\b|\\buser\\s+not\\s+known\\b|\\bdoes\\s+not\\s+exist\\b|\\bunchanged\\b",
  "i"
);
const SELF_PASSWORD_CHANGE_FAILED = new RE2("\\berror\\b|\\bfail(?:ed|ure|s)?\\b|\\bunchanged\\b", "i");
const SU_LOGIN_FAILED = new RE2("\\bauthentication\\s+failure\\b|\\bincorrect\\s+password\\b|\\bsu:", "i");
const AIX_PASSWORD_FLAGS = new RE2("flags=([^\\r\\n]*)");
const AIX_PASSWORD_FLAG_NAME = new RE2("^[A-Za-z0-9_]+$");

const SUDO_PASSWORD_REQUIRED_MESSAGE =
  "sudo is requesting a password but the app connection uses SSH key authentication. Configure the app connection with password authentication, or configure NOPASSWD in sudoers for this user.";

const AIX_SECURITY_PASSWD_FILE = "/etc/security/passwd";
const AIX_ADMCHG_FLAG = "ADMCHG";

const passwdOverflowMessage = (t: string) =>
  `Password change failed: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without a recognized prompt. Output: ${t}`;

const passwdTimeoutMessage = (t: string) => `Password change timed out. Output: ${t}`;

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

export const runManagedPasswordChange = (
  stream: TInteractiveShellStream,
  newPassword: string,
  appConnectionPassword?: string
): Promise<void> => {
  let step: ManagedPasswdStep = ManagedPasswdStep.AwaitNewPasswordPrompt;
  let completed = false;
  let errorMessage = "";

  return runExpectSession({
    stream,
    secrets: [newPassword, appConnectionPassword],

    advance: (ctx) => {
      const failure = MANAGED_PASSWORD_CHANGE_FAILED.exec(ctx.unmatched);
      if (failure) {
        errorMessage = ctx.transcript.redact(lineAt(ctx.unmatched, failure.index));
        ctx.consume(failure);
        ctx.finish();
        return false;
      }

      if (step === ManagedPasswdStep.AwaitNewPasswordPrompt) {
        const sudoPrompt = SUDO_PROMPT.exec(ctx.unmatched);
        if (sudoPrompt) {
          if (!appConnectionPassword) {
            ctx.safeReject(new Error(SUDO_PASSWORD_REQUIRED_MESSAGE));
            return false;
          }
          ctx.consume(sudoPrompt);
          ctx.write(`${appConnectionPassword}\n`);
          return true;
        }

        const newPasswordPrompt = NEW_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (newPasswordPrompt) {
          ctx.consume(newPasswordPrompt);
          ctx.write(`${newPassword}\n`);
          step = ManagedPasswdStep.AwaitConfirmPrompt;
          return true;
        }

        return false;
      }

      if (step === ManagedPasswdStep.AwaitConfirmPrompt) {
        const confirmPrompt = CONFIRM_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (confirmPrompt) {
          ctx.consume(confirmPrompt);
          ctx.write(`${newPassword}\n`);
          step = ManagedPasswdStep.AwaitResult;
          return true;
        }

        return false;
      }

      const success = PASSWORD_CHANGE_SUCCEEDED.exec(ctx.unmatched);
      if (success) {
        ctx.consume(success);
        completed = true;
        ctx.finish();
      }

      return false;
    },

    resolveOnClose: (ctx) => {
      if (errorMessage && !completed) {
        return { resolve: false, error: new Error(`Password change failed: ${errorMessage}`) };
      }
      if (completed || step >= ManagedPasswdStep.AwaitResult) {
        return { resolve: true };
      }
      return {
        resolve: false,
        error: new Error(
          `Password change incomplete (step: ${ManagedPasswdStep[step]}). Output: ${ctx.transcript.read()}`
        )
      };
    },

    overflowMessage: passwdOverflowMessage,
    timeoutMessage: passwdTimeoutMessage
  });
};

const changeManagedPassword = async (
  client: Client,
  targetUsername: string,
  newPassword: string,
  useSudo: boolean = false,
  appConnectionPassword?: string
): Promise<void> => {
  const command = useSudo ? `LC_ALL=C ${SUDO} passwd ${targetUsername}` : `LC_ALL=C passwd ${targetUsername}`;
  const stream = await execCommandWithPty(client, command);

  return runManagedPasswordChange(stream, newPassword, appConnectionPassword);
};

export type TAdminCommandResult = { output: string; exitCode: number | null };

export const runAdminCommand = (
  stream: TInteractiveShellStream,
  appConnectionPassword?: string
): Promise<TAdminCommandResult> => {
  let exitCode: number | null = null;
  let output = "";
  let sudoAnswered = false;

  stream.on("exit", (code) => {
    exitCode = code;
  });

  return runExpectSession({
    stream,
    secrets: [appConnectionPassword],

    advance: (ctx) => {
      const sudoPrompt = SUDO_PROMPT.exec(ctx.unmatched);
      if (!sudoPrompt) return false;

      if (!appConnectionPassword) {
        ctx.safeReject(new Error(SUDO_PASSWORD_REQUIRED_MESSAGE));
        return false;
      }
      if (sudoAnswered) {
        ctx.safeReject(new Error("sudo rejected the app connection password."));
        return false;
      }

      ctx.consume(sudoPrompt);
      ctx.write(`${appConnectionPassword}\n`);
      sudoAnswered = true;
      return true;
    },

    resolveOnClose: (ctx) => {
      output = ctx.transcript.read();
      return { resolve: true };
    },

    overflowMessage: (t) =>
      `Command failed: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without finishing. Output: ${t}`,
    timeoutMessage: (t) => `Command timed out. Output: ${t}`
  }).then(() => ({ output, exitCode }));
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

const isAixHost = async (client: Client): Promise<boolean> => {
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
    logger.warn(error, "Unix/Linux Local Account Rotation: `uname -s` failed, assuming a non-AIX host");
    return false;
  }
};

type TAixFlagContext = {
  client: Client;
  targetUsername: string;
  useSudo: boolean;
  appConnectionPassword?: string;
};

const runAixSecurityCommand = async (
  { client, useSudo, appConnectionPassword }: TAixFlagContext,
  command: string
): Promise<TAdminCommandResult> => {
  const prefix = useSudo ? `LC_ALL=C ${SUDO}` : "LC_ALL=C";
  return runAdminCommand(await execCommandWithPty(client, `${prefix} ${command}`), appConnectionPassword);
};

const readAixPasswordFlags = async (ctx: TAixFlagContext): Promise<{ flags?: string[]; output: string }> => {
  const { output, exitCode } = await runAixSecurityCommand(
    ctx,
    `lssec -f ${AIX_SECURITY_PASSWD_FILE} -s ${ctx.targetUsername} -a flags`
  );
  return { flags: exitCode === 0 ? parseAixPasswordFlags(output) : undefined, output };
};

const writeAixPasswordFlags = async (
  ctx: TAixFlagContext,
  flags: string[]
): Promise<{ succeeded: boolean; output: string }> => {
  const { output, exitCode } = await runAixSecurityCommand(
    ctx,
    `chsec -f ${AIX_SECURITY_PASSWD_FILE} -s ${ctx.targetUsername} -a flags=${flags.join(",")}`
  );
  return { succeeded: exitCode === 0, output };
};

const aixSudoHint = (ctx: TAixFlagContext) =>
  ctx.useSudo ? " If sudo is restricted, allow lssec and chsec in sudoers for the app connection user." : "";

// Rewriting the flags unchanged proves lssec and chsec both work before the password changes. A
// failure after passwd would leave a password nobody knows, since Infisical only stores it once
// the rotation succeeds.
const ensureAixPasswordFlagsWritable = async (ctx: TAixFlagContext): Promise<void> => {
  const { flags, output: readOutput } = await readAixPasswordFlags(ctx);
  if (!flags) {
    throw new Error(
      `Could not read the AIX password flags for user '${ctx.targetUsername}', so the password was not changed. Infisical must clear the ${AIX_ADMCHG_FLAG} flag that AIX sets on every password an administrator changes.${aixSudoHint(ctx)} Output: ${readOutput}`
    );
  }

  const { succeeded, output: writeOutput } = await writeAixPasswordFlags(ctx, flags);
  if (!succeeded) {
    throw new Error(
      `Could not update the AIX password flags for user '${ctx.targetUsername}', so the password was not changed. Infisical must clear the ${AIX_ADMCHG_FLAG} flag that AIX sets on every password an administrator changes.${aixSudoHint(ctx)} Output: ${writeOutput}`
    );
  }
};

// AIX adds ADMCHG to the account's flags whenever root or the security group sets its password,
// forcing a password change at next login. Login-only verification cannot see the flag because
// OpenSSH on AIX applies the forced change only once a session starts, so a non-interactive
// `ssh host command` fails with "Password change required but no TTY available".
const clearAixAdminChangeFlag = async (ctx: TAixFlagContext): Promise<void> => {
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

export const runSelfPasswordChange = (
  stream: TInteractiveShellStream,
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  let step: SelfPasswdStep = SelfPasswdStep.AwaitCurrentPasswordPrompt;
  let completed = false;
  let errorMessage = "";

  return runExpectSession({
    stream,
    secrets: [oldPassword, newPassword],

    advance: (ctx) => {
      if (step >= SelfPasswdStep.AwaitNewPasswordPrompt) {
        const failure = SELF_PASSWORD_CHANGE_FAILED.exec(ctx.unmatched);
        if (failure) {
          errorMessage = ctx.transcript.redact(lineAt(ctx.unmatched, failure.index));
          ctx.consume(failure);
          ctx.finish();
          return false;
        }
      }

      if (step === SelfPasswdStep.AwaitCurrentPasswordPrompt) {
        const currentPasswordPrompt = ANY_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (currentPasswordPrompt) {
          ctx.consume(currentPasswordPrompt);
          ctx.write(`${oldPassword}\n`);
          step = SelfPasswdStep.AwaitNewPasswordPrompt;
          return true;
        }

        return false;
      }

      if (step === SelfPasswdStep.AwaitNewPasswordPrompt) {
        const newPasswordPrompt = NEW_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (newPasswordPrompt) {
          ctx.consume(newPasswordPrompt);
          ctx.write(`${newPassword}\n`);
          step = SelfPasswdStep.AwaitConfirmPrompt;
          return true;
        }

        return false;
      }

      if (step === SelfPasswdStep.AwaitConfirmPrompt) {
        const confirmPrompt = CONFIRM_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (confirmPrompt) {
          ctx.consume(confirmPrompt);
          ctx.write(`${newPassword}\n`);
          step = SelfPasswdStep.AwaitResult;
          return true;
        }

        return false;
      }

      const success = PASSWORD_CHANGE_SUCCEEDED.exec(ctx.unmatched);
      if (success) {
        ctx.consume(success);
        completed = true;
        ctx.finish();
      }

      return false;
    },

    resolveOnClose: (ctx) => {
      if (errorMessage && !completed) {
        return { resolve: false, error: new Error(`Password change failed: ${errorMessage}`) };
      }
      if (completed || step >= SelfPasswdStep.AwaitResult) {
        return { resolve: true };
      }
      return {
        resolve: false,
        error: new Error(`Password change incomplete (step: ${SelfPasswdStep[step]}). Output: ${ctx.transcript.read()}`)
      };
    },

    overflowMessage: passwdOverflowMessage,
    timeoutMessage: passwdTimeoutMessage
  });
};

const changeSelfPassword = async (client: Client, oldPassword: string, newPassword: string): Promise<void> => {
  const stream = await execCommandWithPty(client, "LC_ALL=C passwd");

  return runSelfPasswordChange(stream, oldPassword, newPassword);
};

export const runSuLoginVerification = (
  stream: TInteractiveShellStream,
  targetUsername: string,
  targetPassword: string
): Promise<void> => {
  const whoamiReply = new RE2(escapeForPattern(targetUsername), "i");

  let step: SuVerifyStep = SuVerifyStep.AwaitPasswordPrompt;
  let completed = false;

  return runExpectSession({
    stream,
    secrets: [targetPassword],

    advance: (ctx) => {
      if (step >= SuVerifyStep.AwaitShellReady) {
        const failure = SU_LOGIN_FAILED.exec(ctx.unmatched);
        if (failure) {
          const diagnostic = ctx.transcript.redact(lineAt(ctx.unmatched, failure.index));
          ctx.consume(failure);
          ctx.safeReject(new Error(`su authentication failed for user ${targetUsername}. Output: ${diagnostic}`));
          return false;
        }
      }

      if (step === SuVerifyStep.AwaitPasswordPrompt) {
        const passwordPrompt = ANY_PASSWORD_PROMPT.exec(ctx.unmatched);
        if (passwordPrompt) {
          ctx.consume(passwordPrompt);
          ctx.write(`${targetPassword}\n`);
          step = SuVerifyStep.AwaitShellReady;
          return true;
        }

        return false;
      }

      if (step === SuVerifyStep.AwaitShellReady) {
        if (!ctx.unmatched.trim()) return false;
        ctx.clearUnmatched();
        ctx.write("whoami\n");
        step = SuVerifyStep.AwaitWhoamiReply;
        return true;
      }

      if (whoamiReply.test(ctx.unmatched)) {
        completed = true;
        ctx.write("exit\n");
        ctx.finish();
      }

      return false;
    },

    resolveOnClose: (ctx) => {
      if (completed) {
        return { resolve: true };
      }
      return {
        resolve: false,
        error: new Error(`su verification failed for user ${targetUsername}. Output: ${ctx.transcript.read()}`)
      };
    },

    overflowMessage: (t) =>
      `su verification failed for user ${targetUsername}: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without a recognized prompt. Output: ${t}`,
    timeoutMessage: (t) => `su verification timed out. Output: ${t}`
  });
};

const verifySuLogin = async (client: Client, targetUsername: string, targetPassword: string): Promise<void> => {
  const stream = await execCommandWithPty(client, `LC_ALL=C su - ${targetUsername}`);

  return runSuLoginVerification(stream, targetUsername, targetPassword);
};

export const unixLinuxLocalAccountRotationFactory: TRotationFactory<
  TUnixLinuxLocalAccountRotationWithConnection,
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput["temporaryParameters"]
> = (
  secretRotation,
  appConnectionDAL,
  kmsService,
  gatewayV2Service,
  gatewayPoolService,
  _keyStore,
  passwordValidationContext
) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const {
    username,
    passwordRequirements,
    rotationMethod = UnixLinuxLocalAccountRotationMethod.LoginAsRoot,
    useSudo
  } = parameters;
  const shouldUseSudo = Boolean(useSudo);

  let resolvedConnection: typeof connection | undefined;
  const getResolvedConnection = async () => {
    if (!resolvedConnection) {
      const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: connection.gatewayId,
        gatewayPoolId: connection.gatewayPoolId
      });
      resolvedConnection = { ...connection, gatewayId: effectiveGatewayId, gatewayPoolId: null };
    }
    return resolvedConnection;
  };

  const $verifyCredentials = async (targetUsername: string, targetPassword: string): Promise<void> => {
    const conn = await getResolvedConnection();
    const verifyConfig: TSshConnectionConfig = {
      method: SshConnectionMethod.Password,
      app: conn.app,
      orgId: conn.orgId,
      gatewayId: conn.gatewayId,
      credentials: {
        host: conn.credentials.host,
        port: conn.credentials.port,
        username: targetUsername,
        password: targetPassword
      }
    };

    let directSshError: string | undefined;
    try {
      await executeWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
        const client = await getSshConnectionClient(verifyConfig, targetHost, targetPort);
        client.destroy();
      });
      return;
    } catch (error) {
      directSshError = (error as Error).message;
      logger.info(
        "Unix/Linux Local Account Rotation: Direct SSH verification failed [username=%s], falling back to su verification. Error: %s",
        targetUsername,
        directSshError
      );
    }

    const appConnConfig: TSshConnectionConfig = {
      method: conn.method,
      app: conn.app,
      orgId: conn.orgId,
      gatewayId: conn.gatewayId,
      credentials: conn.credentials
    } as TSshConnectionConfig;

    try {
      await executeWithPotentialGateway(
        appConnConfig,
        gatewayV2Service,
        async (targetHost, targetPort) => {
          const client = await getSshConnectionClient(appConnConfig, targetHost, targetPort);
          try {
            await verifySuLogin(client, targetUsername, targetPassword);
          } finally {
            client.destroy();
          }
        },
        gatewayPoolService
      );
    } catch (suError) {
      throw new Error(
        `Failed to verify credentials. Direct SSH login failed: ${directSshError}. Fallback su verification also failed: ${(suError as Error).message}`
      );
    }
  };

  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const conn = await getResolvedConnection();
    const { credentials } = conn;
    const newPassword = passwordValidationContext
      ? generatePasswordWithConstraints(passwordValidationContext.constraints)
      : generatePassword(passwordRequirements);

    const isSelfRotation = rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget;
    if (username === credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    if (conn.configuration?.blockedUsers) {
      const blockedUsersList = conn.configuration.blockedUsers.split(",").map((u) => u.trim().toLowerCase());
      if (blockedUsersList.includes(username.toLowerCase())) {
        throw new BadRequestError({
          message: `Username '${username}' is blocked from rotation by the SSH connection configuration.`
        });
      }
    }

    let connectConfig: TSshConnectionConfig;

    if (isSelfRotation && currentPassword) {
      connectConfig = {
        method: SshConnectionMethod.Password,
        app: conn.app,
        orgId: conn.orgId,
        gatewayId: conn.gatewayId,
        credentials: {
          host: credentials.host,
          port: credentials.port,
          username,
          password: currentPassword
        }
      };
    } else {
      connectConfig = {
        method: conn.method,
        app: conn.app,
        orgId: conn.orgId,
        gatewayId: conn.gatewayId,
        credentials: conn.credentials
      } as TSshConnectionConfig;
    }

    await executeWithPotentialGateway(connectConfig, gatewayV2Service, async (targetHost, targetPort) => {
      const client = await getSshConnectionClient(connectConfig, targetHost, targetPort);

      try {
        if (isSelfRotation && currentPassword) {
          await changeSelfPassword(client, currentPassword, newPassword);
        } else {
          const appConnectionPassword =
            conn.method === SshConnectionMethod.Password
              ? (conn.credentials as { password: string }).password
              : undefined;
          const aixFlagContext = (await isAixHost(client))
            ? { client, targetUsername: username, useSudo: shouldUseSudo, appConnectionPassword }
            : undefined;
          if (aixFlagContext) await ensureAixPasswordFlagsWritable(aixFlagContext);

          await changeManagedPassword(client, username, newPassword, shouldUseSudo, appConnectionPassword);

          if (aixFlagContext) await clearAixAdminChangeFlag(aixFlagContext);
        }
      } finally {
        client.destroy();
      }
    });

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
    await $rotatePassword(currentPassword);
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TUnixLinuxLocalAccountRotationGeneratedCredentials
  > = async (_, callback, activeCredentials) => {
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

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TUnixLinuxLocalAccountRotationGeneratedCredentials
  > = async ({ username: activeUsername, password }) => {
    await $verifyCredentials(activeUsername, password);
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
