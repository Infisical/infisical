import { Client, ClientChannel } from "ssh2";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
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

const ILO_PROMPT = "hpiLO->";
const COMMAND_COMPLETED = "status_tag=COMMAND COMPLETED";
const COMMAND_FAILED = "COMMAND PROCESSING FAILED";
const CONNECTION_TIMEOUT = 15000;

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

        if (buffer.includes(ILO_PROMPT) && !commandSent) {
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
          reject(new Error(`iLO command failed: ${buffer}`));
        }
      });

      stream.on("close", () => {
        clearTimeout(timeout);
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
  return getSshConnectionClient(
    {
      ...config,
      algorithms: {
        serverHostKey: ["ssh-rsa"],
        kex: ["diffie-hellman-group14-sha1", "diffie-hellman-group1-sha1"]
      }
    },
    targetHost,
    targetPort
  );
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
> = (secretRotation, appConnectionDAL, kmsService, _gatewayService, gatewayV2Service) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = HpIloRotationMethod.LoginAsRoot } = parameters;

  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const newPassword = generatePassword(passwordRequirements ?? HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS);

    const isSelfRotation = rotationMethod === HpIloRotationMethod.LoginAsTarget;
    // if (username === credentials.username)
    //   throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const sshConfig: TSshConnectionConfig = {
      method: connection.method,
      app: connection.app,
      orgId: connection.orgId,
      gatewayId: connection.gatewayId,
      credentials: connection.credentials
    } as TSshConnectionConfig;

    if (isSelfRotation && currentPassword) {
      await rotateIloPasswordAsTarget(sshConfig, gatewayV2Service, username, currentPassword, newPassword);
    } else {
      await rotateIloPasswordAsAdmin(sshConfig, gatewayV2Service, username, newPassword);
    }

    await verifyIloPassword(sshConfig, gatewayV2Service, username, newPassword);

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

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
