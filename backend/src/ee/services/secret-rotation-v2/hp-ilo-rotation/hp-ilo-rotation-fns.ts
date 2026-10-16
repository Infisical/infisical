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
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  executeWithPotentialGateway,
  getSshConnectionClient,
  SshConnectionMethod,
  TSshConnectionConfig
} from "@app/services/app-connection/ssh";

import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { generatePassword } from "../shared/utils";
import { hpIloRedfishClientFactory } from "./hp-ilo-redfish-client";
import { HpIloRotationMethod } from "./hp-ilo-rotation-schemas";
import {
  THpIloClient,
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

// iLO 5/6 present the prompt as "hpiLO->", iLO 7 as "hpeiLO->"; match the common suffix
const ILO_PROMPT = "iLO->";

export const isIloPrompt = (output: string) => output.includes(ILO_PROMPT);

const COMMAND_COMPLETED = "status_tag=COMMAND COMPLETED";
const COMMAND_FAILED = "COMMAND PROCESSING FAILED";
const CONNECTION_TIMEOUT = 45000;
const MAX_BUFFER_SIZE = 64 * 1024;

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

const createIloConnection = (config: TSshConnectionConfig, targetHost: string, targetPort: number): Promise<Client> => {
  return getSshConnectionClient(config, targetHost, targetPort);
};

const rotateIloPasswordAsTarget = async (
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  username: string,
  password: string,
  newPassword: string
): Promise<void> => {
  const targetConfig: TSshConnectionConfig = {
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
  };

  await executeWithPotentialGateway(targetConfig, gatewayV2Service, async (targetHost, targetPort) => {
    const conn = await createIloConnection(targetConfig, targetHost, targetPort);
    try {
      const command = `set /map1/accounts1/${username} password=${newPassword}`;
      await executeIloShell(conn, command);
    } finally {
      conn.end();
    }
  });
};

const rotateIloPasswordAsAdmin = async (
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  targetUsername: string,
  newPassword: string
): Promise<void> => {
  await executeWithPotentialGateway(config, gatewayV2Service, async (targetHost, targetPort) => {
    const conn = await createIloConnection(config, targetHost, targetPort);
    try {
      const command = `set /map1/accounts1/${targetUsername} password=${newPassword}`;
      await executeIloShell(conn, command);
    } finally {
      conn.end();
    }
  });
};

const verifyIloPassword = async (
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  username: string,
  password: string
): Promise<void> => {
  const verifyConfig: TSshConnectionConfig = {
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
  };

  try {
    await executeWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
      const conn = await createIloConnection(verifyConfig, targetHost, targetPort);
      conn.end();
    });
  } catch (error) {
    throw new Error(`HP iLO password verification failed: ${(error as Error).message}`);
  }
};

export const hpIloRotationFactory: TRotationFactory<
  THpIloRotationWithConnection,
  THpIloRotationGeneratedCredentials,
  THpIloRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = HpIloRotationMethod.LoginAsRoot } = parameters;

  const $getIloClient = async (): Promise<THpIloClient> => {
    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });

    if (connection.app === AppConnection.HpeIloRedFish) {
      if (rotationMethod === HpIloRotationMethod.LoginAsTarget)
        throw new BadRequestError({
          message:
            "The Login as Target rotation method requires an SSH Connection. HPE iLO Connections always rotate the password with the connection's credentials."
        });

      return hpIloRedfishClientFactory({ credentials: connection.credentials, gatewayId }, gatewayV2Service);
    }

    const sshConfig = {
      method: connection.method,
      app: connection.app,
      orgId: connection.orgId,
      gatewayId,
      credentials: connection.credentials
    } as TSshConnectionConfig;

    return {
      changePassword: async (targetUsername, newPassword, currentPassword) => {
        if (rotationMethod === HpIloRotationMethod.LoginAsTarget && currentPassword) {
          await rotateIloPasswordAsTarget(sshConfig, gatewayV2Service, targetUsername, currentPassword, newPassword);
        } else {
          await rotateIloPasswordAsAdmin(sshConfig, gatewayV2Service, targetUsername, newPassword);
        }
        // We still verify if the password works by running a SSH login
        return { isNewPasswordVerified: false };
      },
      verifyPassword: (targetUsername, password) =>
        verifyIloPassword(sshConfig, gatewayV2Service, targetUsername, password)
    };
  };

  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const newPassword = generatePassword(passwordRequirements ?? HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS);

    if (username === connection.credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const iloClient = await $getIloClient();
    const { isNewPasswordVerified } = await iloClient.changePassword(username, newPassword, currentPassword);
    if (!isNewPasswordVerified) await iloClient.verifyPassword(username, newPassword);

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
    const iloClient = await $getIloClient();
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
