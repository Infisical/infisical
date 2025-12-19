import handlebars from "handlebars";
import { Knex } from "knex";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  executeWithPotentialGateway,
  SQL_CONNECTION_ALTER_LOGIN_STATEMENT
} from "@app/services/app-connection/shared/sql";

import { DEFAULT_PASSWORD_REQUIREMENTS, generatePassword } from "../utils";
import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "./sql-credentials-rotation-types";

const redactPasswords = (e: unknown, credentials: TSqlCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

const ORACLE_PASSWORD_REQUIREMENTS = {
  ...DEFAULT_PASSWORD_REQUIREMENTS,
  length: 30
};

export const sqlCredentialsRotationFactory: TRotationFactory<
  TSqlCredentialsRotationWithConnection,
  TSqlCredentialsRotationGeneratedCredentials
> = (secretRotation, _appConnectionDAL, _kmsService, gatewayService, gatewayV2Service) => {
  const {
    connection,
    parameters: {
      username1,
      username2,
      rotationStatement: userProvidedRotationStatement,
      passwordRequirements: userProvidedPasswordRequirements
    },
    activeIndex,
    secretsMapping
  } = secretRotation;

  const defaultPasswordRequirement =
    connection.app === AppConnection.OracleDB ? ORACLE_PASSWORD_REQUIREMENTS : DEFAULT_PASSWORD_REQUIREMENTS;
  const passwordRequirement = userProvidedPasswordRequirements || defaultPasswordRequirement;

  const executeOperation = <T>(
    operation: (client: Knex) => Promise<T>,
    credentialsOverride?: TSqlCredentialsRotationGeneratedCredentials[number]
  ) => {
    const finalCredentials = {
      ...connection.credentials,
      ...credentialsOverride
    };

    return executeWithPotentialGateway(
      {
        ...connection,
        credentials: finalCredentials
      },
      gatewayService,
      gatewayV2Service,
      (client) => operation(client)
    );
  };

  const $validateCredentials = async (credentials: TSqlCredentialsRotationGeneratedCredentials[number]) => {
    try {
      await executeOperation(async (client) => {
        await client.raw(connection.app === AppConnection.OracleDB ? `SELECT 1 FROM DUAL` : `Select 1`);
      }, credentials);
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    }
  };

  const $executeQuery = async (tx: Knex, username: string, password: string) => {
    if (userProvidedRotationStatement) {
      const revokeStatement = handlebars.compile(userProvidedRotationStatement)({
        username,
        password,
        database: connection.credentials.database
      });
      const queries = revokeStatement.toString().split(";").filter(Boolean);
      for await (const query of queries) {
        await tx.raw(query);
      }
    } else {
      await tx.raw(...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[connection.app]({ username, password }));
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    callback
  ) => {
    // For SQL, since we get existing users, we change both their passwords
    // on issue to invalidate their existing passwords
    const credentialsSet = [
      { username: username1, password: generatePassword(passwordRequirement) },
      { username: username2, password: generatePassword(passwordRequirement) }
    ];

    try {
      await executeOperation(async (client) => {
        await client.transaction(async (tx) => {
          for await (const credentials of credentialsSet) {
            await $executeQuery(tx, credentials.username, credentials.password);
          }
        });
      });
    } catch (error) {
      throw new Error(redactPasswords(error, credentialsSet));
    }

    for await (const credentials of credentialsSet) {
      await $validateCredentials(credentials);
    }

    return callback(credentialsSet[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const revokedCredentials = credentialsToRevoke.map(({ username }) => ({
      username,
      password: generatePassword(passwordRequirement)
    }));

    try {
      await executeOperation(async (client) => {
        await client.transaction(async (tx) => {
          for await (const credentials of revokedCredentials) {
            // invalidate previous passwords
            await $executeQuery(tx, credentials.username, credentials.password);
          }
        });
      });
    } catch (error) {
      throw new Error(redactPasswords(error, revokedCredentials));
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    // generate new password for the next active user
    const credentials = {
      username: activeIndex === 0 ? username2 : username1,
      password: generatePassword(passwordRequirement)
    };

    try {
      await executeOperation(async (client) => {
        await $executeQuery(client, credentials.username, credentials.password);
      });
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    }

    await $validateCredentials(credentials);

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TSqlCredentialsRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    const { username, password } = secretsMapping;

    const secrets = [
      {
        key: username,
        value: generatedCredentials.username
      },
      {
        key: password,
        value: generatedCredentials.password
      }
    ];

    return secrets;
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
