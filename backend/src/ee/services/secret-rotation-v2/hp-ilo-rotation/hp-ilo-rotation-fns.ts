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
// import { BadRequestError } from "@app/lib/errors";
import {
  executeWithPotentialGateway,
  getSshConnectionClient,
  SshConnectionMethod,
  TSshConnectionConfig
} from "@app/services/app-connection/ssh";

import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { generatePassword } from "../shared/utils";
import { HpIloRotationMethod } from "./hp-ilo-rotation-schemas";
import {
  THpIloRotationGeneratedCredentials,
  THpIloRotationInput,
  THpIloRotationWithConnection
} from "./hp-ilo-rotation-types";

// iLO 5 has a maximum password length of 39 characters
const HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 39,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: ""
};

export type THpIloClient = {
  changePasswordAsAdmin: (targetUsername: string, newPassword: string) => Promise<void>;
  changePasswordAsTarget: (username: string, currentPassword: string, newPassword: string) => Promise<void>;
  verifyPassword: (username: string, password: string) => Promise<void>;
};

export type THpIloClientFactory = (
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => THpIloClient;

// iLO 5/6 present the prompt as "hpiLO->", iLO 7 as "hpeiLO->"; match the common suffix
const ILO_PROMPT = "iLO->";

export const isIloPrompt = (output: string) => output.includes(ILO_PROMPT);

const COMMAND_COMPLETED = "status_tag=COMMAND COMPLETED";
const COMMAND_FAILED = "COMMAND PROCESSING FAILED";
const CONNECTION_TIMEOUT = 45000;
const MAX_BUFFER_SIZE = 64 * 1024;

export const hpIloSshClientFactory: THpIloClientFactory = (config, gatewayV2Service) => {
  const executeIloShell = (conn: Client, command: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      conn.shell((err, stream: ClientChannel) => {
        if (err) {
          reject(new Error(`iLO shell error: ${err.message}`));
          return;
        }

        let buffer = "";
        let commandSent = false;
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            conn.end();
            reject(new Error("iLO shell timeout - no prompt received"));
          }
        }, CONNECTION_TIMEOUT);

        stream.on("data", (data: Buffer) => {
          if (settled) return;

          buffer += data.toString();

          if (buffer.length > MAX_BUFFER_SIZE) {
            clearTimeout(timeout);
            settled = true;
            conn.end();
            reject(new Error("iLO shell response exceeded maximum buffer size"));
            return;
          }

          if (isIloPrompt(buffer) && !commandSent) {
            commandSent = true;
            stream.write(`${command}\n`);
          }

          if (commandSent && buffer.includes(COMMAND_COMPLETED)) {
            clearTimeout(timeout);
            settled = true;
            stream.write("exit\n");
            resolve(buffer);
          }

          if (commandSent && buffer.includes(COMMAND_FAILED)) {
            clearTimeout(timeout);
            settled = true;
            conn.end();
            const passwordPattern = new RE2("password=[^\\s]+", "gi");
            const sanitizedBuffer = passwordPattern.replace(buffer, "password=***");
            reject(new Error(`iLO command failed: ${sanitizedBuffer}`));
          }
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            reject(new Error("iLO shell closed unexpectedly"));
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          if (!settled) {
            clearTimeout(timeout);
            settled = true;
            reject(new Error(`iLO SSH error: ${data.toString()}`));
          }
        });
      });
    });
  };

  const withUserCredentials = (username: string, password: string): TSshConnectionConfig => ({
    method: SshConnectionMethod.Password,
    app: config.app,
    orgId: config.orgId,
    gatewayId: config.gatewayId,
    credentials: {
      host: config.credentials.host,
      port: config.credentials.port,
      username,
      password
    }
  });

  const runCommand = async (connectionConfig: TSshConnectionConfig, command: string) => {
    await executeWithPotentialGateway(connectionConfig, gatewayV2Service, async (targetHost, targetPort) => {
      const conn = await getSshConnectionClient(connectionConfig, targetHost, targetPort);
      try {
        await executeIloShell(conn, command);
      } finally {
        conn.end();
      }
    });
  };

  const changePasswordAsAdmin = async (targetUsername: string, newPassword: string) => {
    await runCommand(config, `set /map1/accounts1/${targetUsername} password=${newPassword}`);
  };

  const changePasswordAsTarget = async (username: string, currentPassword: string, newPassword: string) => {
    await runCommand(
      withUserCredentials(username, currentPassword),
      `set /map1/accounts1/${username} password=${newPassword}`
    );
  };

  const verifyPassword = async (username: string, password: string) => {
    const verifyConfig = withUserCredentials(username, password);
    try {
      await executeWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
        const conn = await getSshConnectionClient(verifyConfig, targetHost, targetPort);
        conn.end();
      });
    } catch (error) {
      throw new Error(`HP iLO password verification failed: ${(error as Error).message}`);
    }
  };

  return {
    changePasswordAsAdmin,
    changePasswordAsTarget,
    verifyPassword
  };
};

export const hpIloApiClientFactory: THpIloClientFactory = () => ({
  changePasswordAsAdmin: async () => {},
  changePasswordAsTarget: async () => {},
  verifyPassword: async () => {}
});

export const hpIloRotationFactory: TRotationFactory<
  THpIloRotationWithConnection,
  THpIloRotationGeneratedCredentials,
  THpIloRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = HpIloRotationMethod.LoginAsRoot } = parameters;

  const getIloClient = async (clientFactory: THpIloClientFactory = hpIloSshClientFactory): Promise<THpIloClient> => {
    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });
    const sshConfig = {
      method: connection.method,
      app: connection.app,
      orgId: connection.orgId,
      gatewayId: effectiveGatewayId,
      credentials: connection.credentials
    } as TSshConnectionConfig;
    return clientFactory(sshConfig, gatewayV2Service);
  };

  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const newPassword = generatePassword(passwordRequirements ?? HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS);

    const isSelfRotation = rotationMethod === HpIloRotationMethod.LoginAsTarget;
    // if (username === connection.credentials.username)
    //   throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const iloClient = await getIloClient();

    if (isSelfRotation && currentPassword) {
      await iloClient.changePasswordAsTarget(username, currentPassword, newPassword);
    } else {
      await iloClient.changePasswordAsAdmin(username, newPassword);
    }

    await iloClient.verifyPassword(username, newPassword);

    return { username, password: newPassword };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    THpIloRotationGeneratedCredentials,
    THpIloRotationInput["temporaryParameters"]
  > = async (callback, temporaryParameters) => {
    const credentials = await $rotatePassword(temporaryParameters?.password);
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<THpIloRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const currentPassword = credentialsToRevoke[activeIndex].password;
    await $rotatePassword(currentPassword);
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<THpIloRotationGeneratedCredentials> = async (
    _,
    callback,
    activeCredentials
  ) => {
    const credentials = await $rotatePassword(activeCredentials.password);
    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<THpIloRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    return [
      { key: secretsMapping.username, value: generatedCredentials.username },
      { key: secretsMapping.password, value: generatedCredentials.password }
    ];
  };

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<THpIloRotationGeneratedCredentials> = async ({
    username: activeUsername,
    password
  }) => {
    const iloClient = await getIloClient();
    await iloClient.verifyPassword(activeUsername, password);
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
