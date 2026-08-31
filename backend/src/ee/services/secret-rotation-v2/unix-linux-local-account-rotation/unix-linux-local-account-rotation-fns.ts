import { StringDecoder } from "node:string_decoder";

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
  executeWithPotentialGateway,
  getSshConnectionClient,
  SshConnectionMethod,
  TSshConnectionConfig
} from "@app/services/app-connection/ssh";
import { generatePasswordWithConstraints } from "@app/services/secret-validation-rule/secret-validation-rule-password-generator";

import { generatePassword } from "../shared/utils";
import { UnixLinuxLocalAccountRotationMethod } from "./unix-linux-local-account-rotation-schemas";
import {
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput,
  TUnixLinuxLocalAccountRotationWithConnection
} from "./unix-linux-local-account-rotation-types";

const SHELL_TIMEOUT = 15_000;
const MAX_BUFFER_SIZE = 64 * 1024;
const MAX_TRANSCRIPT_SIZE = 4 * 1024;

const SUDO_PROMPT = new RE2("\\[sudo\\]", "i");
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

export type TInteractiveShellStream = {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  write(data: string): void;
  end(): void;
};

const escapeForPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const lineAt = (text: string, index: number) => {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return (end === -1 ? text.slice(start) : text.slice(start, end)).trim();
};

// The transcript is interpolated into rotation errors, which are persisted and rendered in the UI,
// so bounding and redaction live here: no individual error site can forget to apply them.
const createTranscript = (secrets: (string | undefined)[]) => {
  const knownSecrets = secrets.filter((secret): secret is string => Boolean(secret));
  const redact = (value: string) =>
    knownSecrets.reduce((redacted, secret) => redacted.replaceAll(secret, "***"), value);

  let text = "";
  let truncated = false;

  return {
    append: (chunk: string) => {
      text += chunk;
      if (text.length > MAX_TRANSCRIPT_SIZE) {
        text = text.slice(-MAX_TRANSCRIPT_SIZE);
        truncated = true;
      }
    },
    redact,
    read: () => (truncated ? `...${redact(text)}` : redact(text))
  };
};

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

// Drives the prompts of `passwd <username>` for managed rotation (admin changing another user's
// password). Prompts are matched against everything received so far, not just the arriving chunk:
// a PTY behind an SSH channel and a gateway tunnel re-segments freely, so a prompt can straddle
// two data events.
export const runManagedPasswordChange = (
  stream: TInteractiveShellStream,
  newPassword: string,
  appConnectionPassword?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transcript = createTranscript([newPassword, appConnectionPassword]);
    const decoder = new StringDecoder("utf8");

    let pending = "";
    let step = 0;
    let completed = false;
    let settled = false;
    let closing = false;
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
        safeReject(new Error(`Password change timed out. Output: ${transcript.read()}`));
      }
    }, SHELL_TIMEOUT);

    const finish = () => {
      closing = true;
      clearTimeout(timeout);
      stream.end();
    };

    // Matched text is dropped so the same bytes cannot satisfy a later step as well, which would
    // send the new password a third time or read the first prompt as its own confirmation.
    const consume = (match: RegExpExecArray) => {
      pending = pending.slice(match.index + match[0].length);
    };

    const advance = (): boolean => {
      const failure = MANAGED_PASSWORD_CHANGE_FAILED.exec(pending);
      if (failure) {
        errorMessage = transcript.redact(lineAt(pending, failure.index));
        consume(failure);
        finish();
        return false;
      }

      if (step === 0) {
        const sudoPrompt = SUDO_PROMPT.exec(pending);
        if (sudoPrompt) {
          if (!appConnectionPassword) {
            clearTimeout(timeout);
            safeReject(
              new Error(
                "sudo is requesting a password but the app connection uses SSH key authentication. Configure the app connection with password authentication, or configure NOPASSWD in sudoers for this user."
              )
            );
            stream.end();
            return false;
          }
          consume(sudoPrompt);
          stream.write(`${appConnectionPassword}\n`);
          // Still step 0: the new-password prompt follows, and may already be in this buffer.
          return true;
        }

        const newPasswordPrompt = NEW_PASSWORD_PROMPT.exec(pending);
        if (newPasswordPrompt) {
          consume(newPasswordPrompt);
          stream.write(`${newPassword}\n`);
          step = 1;
          return true;
        }

        return false;
      }

      if (step === 1) {
        const confirmPrompt = CONFIRM_PASSWORD_PROMPT.exec(pending);
        if (confirmPrompt) {
          consume(confirmPrompt);
          stream.write(`${newPassword}\n`);
          step = 2;
          return true;
        }

        return false;
      }

      const success = PASSWORD_CHANGE_SUCCEEDED.exec(pending);
      if (success) {
        consume(success);
        completed = true;
        finish();
      }

      return false;
    };

    stream.on("data", (chunk: Buffer) => {
      if (settled || closing) return;

      const text = decoder.write(chunk);
      if (!text) return;

      transcript.append(text);
      pending += text;

      // A host can coalesce several prompts into one chunk, and once it is waiting on our answer no
      // further data event arrives, so advance until nothing more matches instead of once per event.
      let progressed = true;
      while (progressed && !settled && !closing) {
        progressed = advance();
      }

      if (!settled && !closing && pending.length > MAX_BUFFER_SIZE) {
        clearTimeout(timeout);
        stream.end();
        safeReject(
          new Error(
            `Password change failed: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without a recognized prompt. Output: ${transcript.read()}`
          )
        );
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      const tail = decoder.end();
      if (tail) transcript.append(tail);
      if (settled) return;
      settled = true;

      if (errorMessage && !completed) {
        reject(new Error(`Password change failed: ${errorMessage}`));
      } else if (completed || step >= 2) {
        resolve();
      } else {
        reject(new Error(`Password change incomplete (step ${step}). Output: ${transcript.read()}`));
      }
    });

    stream.on("error", (streamErr: Error) => {
      clearTimeout(timeout);
      safeReject(new Error(`Stream error: ${streamErr.message}`));
    });
  });
};

// Change password for managed rotation (admin changing another user's password)
// Uses `sudo passwd <username>` (or `passwd <username>`) executed via PTY
// LC_ALL=C forces English prompts regardless of system locale
const changeManagedPassword = async (
  client: Client,
  targetUsername: string,
  newPassword: string,
  useSudo: boolean = false,
  appConnectionPassword?: string
): Promise<void> => {
  const command = useSudo ? `LC_ALL=C sudo passwd ${targetUsername}` : `LC_ALL=C passwd ${targetUsername}`;
  const stream = await execCommandWithPty(client, command);

  return runManagedPasswordChange(stream, newPassword, appConnectionPassword);
};

// Drives the prompts of `passwd` for self rotation (user changing their own password), matching
// against everything received so far for the same reason as the managed handler.
export const runSelfPasswordChange = (
  stream: TInteractiveShellStream,
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transcript = createTranscript([oldPassword, newPassword]);
    const decoder = new StringDecoder("utf8");

    let pending = "";
    let step = 0;
    let completed = false;
    let settled = false;
    let closing = false;
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
        safeReject(new Error(`Password change timed out. Output: ${transcript.read()}`));
      }
    }, SHELL_TIMEOUT);

    const finish = () => {
      closing = true;
      clearTimeout(timeout);
      stream.end();
    };

    const consume = (match: RegExpExecArray) => {
      pending = pending.slice(match.index + match[0].length);
    };

    const advance = (): boolean => {
      if (step >= 1) {
        const failure = SELF_PASSWORD_CHANGE_FAILED.exec(pending);
        if (failure) {
          errorMessage = transcript.redact(lineAt(pending, failure.index));
          consume(failure);
          finish();
          return false;
        }
      }

      if (step === 0) {
        const currentPasswordPrompt = ANY_PASSWORD_PROMPT.exec(pending);
        if (currentPasswordPrompt) {
          consume(currentPasswordPrompt);
          stream.write(`${oldPassword}\n`);
          step = 1;
          return true;
        }

        return false;
      }

      if (step === 1) {
        const newPasswordPrompt = NEW_PASSWORD_PROMPT.exec(pending);
        if (newPasswordPrompt) {
          consume(newPasswordPrompt);
          stream.write(`${newPassword}\n`);
          step = 2;
          return true;
        }

        return false;
      }

      if (step === 2) {
        const confirmPrompt = CONFIRM_PASSWORD_PROMPT.exec(pending);
        if (confirmPrompt) {
          consume(confirmPrompt);
          stream.write(`${newPassword}\n`);
          step = 3;
          return true;
        }

        return false;
      }

      const success = PASSWORD_CHANGE_SUCCEEDED.exec(pending);
      if (success) {
        consume(success);
        completed = true;
        finish();
      }

      return false;
    };

    stream.on("data", (chunk: Buffer) => {
      if (settled || closing) return;

      const text = decoder.write(chunk);
      if (!text) return;

      transcript.append(text);
      pending += text;

      let progressed = true;
      while (progressed && !settled && !closing) {
        progressed = advance();
      }

      if (!settled && !closing && pending.length > MAX_BUFFER_SIZE) {
        clearTimeout(timeout);
        stream.end();
        safeReject(
          new Error(
            `Password change failed: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without a recognized prompt. Output: ${transcript.read()}`
          )
        );
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      const tail = decoder.end();
      if (tail) transcript.append(tail);
      if (settled) return;
      settled = true;

      if (errorMessage && !completed) {
        reject(new Error(`Password change failed: ${errorMessage}`));
      } else if (completed || step >= 3) {
        resolve();
      } else {
        reject(new Error(`Password change incomplete (step ${step}). Output: ${transcript.read()}`));
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
// LC_ALL=C forces English prompts regardless of system locale
const changeSelfPassword = async (client: Client, oldPassword: string, newPassword: string): Promise<void> => {
  const stream = await execCommandWithPty(client, "LC_ALL=C passwd");

  return runSelfPasswordChange(stream, oldPassword, newPassword);
};

// Drives the prompts of `su - <username>`, matching against everything received so far for the same
// reason as the password handlers.
export const runSuLoginVerification = (
  stream: TInteractiveShellStream,
  targetUsername: string,
  targetPassword: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transcript = createTranscript([targetPassword]);
    const decoder = new StringDecoder("utf8");
    const whoamiReply = new RE2(escapeForPattern(targetUsername), "i");

    let pending = "";
    let step = 0;
    let completed = false;
    let settled = false;
    let closing = false;

    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        stream.end();
        safeReject(new Error(`su verification timed out. Output: ${transcript.read()}`));
      }
    }, SHELL_TIMEOUT);

    const finish = () => {
      closing = true;
      clearTimeout(timeout);
      stream.end();
    };

    const consume = (match: RegExpExecArray) => {
      pending = pending.slice(match.index + match[0].length);
    };

    const advance = (): boolean => {
      if (step >= 1) {
        const failure = SU_LOGIN_FAILED.exec(pending);
        if (failure) {
          const diagnostic = transcript.redact(lineAt(pending, failure.index));
          consume(failure);
          clearTimeout(timeout);
          safeReject(new Error(`su authentication failed for user ${targetUsername}. Output: ${diagnostic}`));
          stream.end();
          return false;
        }
      }

      if (step === 0) {
        const passwordPrompt = ANY_PASSWORD_PROMPT.exec(pending);
        if (passwordPrompt) {
          consume(passwordPrompt);
          stream.write(`${targetPassword}\n`);
          step = 1;
          return true;
        }

        return false;
      }

      if (step === 1) {
        // Anything buffered here is su's own banner or shell prompt; only the reply to whoami names
        // the user we ended up as, so it is dropped rather than sliced.
        if (!pending.trim()) return false;
        pending = "";
        stream.write("whoami\n");
        step = 2;
        return true;
      }

      if (whoamiReply.test(pending)) {
        completed = true;
        stream.write("exit\n");
        finish();
      }

      return false;
    };

    stream.on("data", (chunk: Buffer) => {
      if (settled || closing) return;

      const text = decoder.write(chunk);
      if (!text) return;

      transcript.append(text);
      pending += text;

      let progressed = true;
      while (progressed && !settled && !closing) {
        progressed = advance();
      }

      if (!settled && !closing && pending.length > MAX_BUFFER_SIZE) {
        clearTimeout(timeout);
        stream.end();
        safeReject(
          new Error(
            `su verification failed for user ${targetUsername}: the host sent more than ${MAX_BUFFER_SIZE / 1024} KB of output without a recognized prompt. Output: ${transcript.read()}`
          )
        );
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      const tail = decoder.end();
      if (tail) transcript.append(tail);
      if (settled) return;
      settled = true;

      if (completed) {
        resolve();
      } else {
        reject(new Error(`su verification failed for user ${targetUsername}. Output: ${transcript.read()}`));
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
// LC_ALL=C forces English prompts regardless of system locale
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
  _gatewayService,
  gatewayV2Service,
  gatewayPoolService,
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

  // Main password rotation logic
  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const conn = await getResolvedConnection();
    const { credentials } = conn;
    const newPassword = passwordValidationContext?.constraints?.length
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
