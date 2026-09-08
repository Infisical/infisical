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
import {
  escapeForPattern,
  lineAt,
  MAX_BUFFER_SIZE,
  runExpectSession,
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
            ctx.safeReject(
              new Error(
                "sudo is requesting a password but the app connection uses SSH key authentication. Configure the app connection with password authentication, or configure NOPASSWD in sudoers for this user."
              )
            );
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
  const command = useSudo ? `LC_ALL=C sudo passwd ${targetUsername}` : `LC_ALL=C passwd ${targetUsername}`;
  const stream = await execCommandWithPty(client, command);

  return runManagedPasswordChange(stream, newPassword, appConnectionPassword);
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
