/* eslint-disable no-promise-executor-return */
/* eslint-disable no-await-in-loop */
import knex from "knex";
import { v4 as uuidv4 } from "uuid";

import { seedData1 } from "@app/db/seed-data";

enum SecretRotationType {
  OracleDb = "oracledb",
  MySQL = "mysql",
  Postgres = "postgres"
}

type TGenericSqlCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

type TSecretMapping = {
  username: string;
  password: string;
};

type TDatabaseUserCredentials = {
  username: string;
};

const formatSqlUsername = (username: string) => `${username}_${uuidv4().slice(0, 8).replace(/-/g, "").toUpperCase()}`;

const getSecretValue = async (secretKey: string) => {
  const passwordSecret = await testServer.inject({
    url: `/api/v3/secrets/raw/${secretKey}`,
    method: "GET",
    query: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug
    },
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });

  expect(passwordSecret.statusCode).toBe(200);
  expect(passwordSecret.json().secret).toBeDefined();

  const passwordSecretJson = JSON.parse(passwordSecret.payload);

  return passwordSecretJson.secret.secretValue as string;
};

const deleteSecretRotation = async (id: string, type: SecretRotationType) => {
  const res = await testServer.inject({
    method: "DELETE",
    query: {
      deleteSecrets: "true",
      revokeGeneratedCredentials: "true"
    },
    url: `/api/v2/secret-rotations/${type}-credentials/${id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });

  expect(res.statusCode).toBe(200);
};

const deleteAppConnection = async (id: string, type: SecretRotationType) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/app-connections/${type}/${id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });

  expect(res.statusCode).toBe(200);
};

const createOracleDBAppConnection = async (credentials: TGenericSqlCredentials) => {
  const createOracleDBAppConnectionReqBody = {
    credentials: {
      database: credentials.database,
      host: credentials.host,
      username: credentials.username,
      password: credentials.password,
      port: credentials.port,
      sslEnabled: true,
      sslRejectUnauthorized: true
    },
    name: `oracle-db-${uuidv4()}`,
    description: "Test OracleDB App Connection",
    gatewayId: null,
    isPlatformManagedCredentials: false,
    method: "username-and-password"
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/app-connections/oracledb`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createOracleDBAppConnectionReqBody
  });

  const json = JSON.parse(res.payload);

  expect(res.statusCode).toBe(200);
  expect(json.appConnection).toBeDefined();

  return json.appConnection.id as string;
};

const createMySQLAppConnection = async (credentials: TGenericSqlCredentials) => {
  const createMySQLAppConnectionReqBody = {
    name: `mysql-test-${uuidv4()}`,
    description: "test-mysql",
    gatewayId: null,
    method: "username-and-password",
    credentials: {
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      username: credentials.username,
      password: credentials.password,
      sslEnabled: false,
      sslRejectUnauthorized: true
    }
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/app-connections/mysql`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createMySQLAppConnectionReqBody
  });

  const json = JSON.parse(res.payload);

  expect(res.statusCode).toBe(200);
  expect(json.appConnection).toBeDefined();

  return json.appConnection.id as string;
};

const createPostgresAppConnection = async (credentials: TGenericSqlCredentials) => {
  const createPostgresAppConnectionReqBody = {
    credentials: {
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      username: credentials.username,
      password: credentials.password,
      sslEnabled: false,
      sslRejectUnauthorized: true
    },
    name: `postgres-test-${uuidv4()}`,
    description: "test-postgres",
    gatewayId: null,
    method: "username-and-password"
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/app-connections/postgres`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createPostgresAppConnectionReqBody
  });

  const json = JSON.parse(res.payload);

  expect(res.statusCode).toBe(200);
  expect(json.appConnection).toBeDefined();

  return json.appConnection.id as string;
};

const createOracleInfisicalUsers = async (
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[]
) => {
  const client = knex({
    client: "oracledb",
    connection: {
      database: credentials.database,
      port: credentials.port,
      host: credentials.host,
      user: credentials.username,
      password: credentials.password,
      connectionTimeoutMillis: 10000,
      ssl: {
        // @ts-expect-error - this is a valid property for the ssl object
        sslServerDNMatch: true
      }
    }
  });

  for await (const { username } of userCredentials) {
    // check if user exists, and if it does, don't create it
    const existingUser = await client.raw(`SELECT * FROM all_users WHERE username = '${username}'`);

    if (!existingUser.length) {
      await client.raw(`CREATE USER ${username} IDENTIFIED BY "temporary_password"`);
    }
    await client.raw(`GRANT ALL PRIVILEGES TO ${username} WITH ADMIN OPTION`);
  }

  await client.destroy();
};

const createMySQLInfisicalUsers = async (
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[]
) => {
  const client = knex({
    client: "mysql2",
    connection: {
      database: credentials.database,
      port: credentials.port,
      host: credentials.host,
      user: credentials.username,
      password: credentials.password,
      connectionTimeoutMillis: 10000
    }
  });

  // Fix: Ensure root has GRANT OPTION privileges
  try {
    await client.raw("GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;");
    await client.raw("FLUSH PRIVILEGES;");
  } catch (error) {
    // Ignore if already has privileges
  }

  for await (const { username } of userCredentials) {
    // check if user exists, and if it does, dont create it

    const existingUser = await client.raw(`SELECT * FROM mysql.user WHERE user = '${username}'`);

    if (!existingUser[0].length) {
      await client.raw(`CREATE USER '${username}'@'%' IDENTIFIED BY 'temporary_password';`);
    }

    await client.raw(`GRANT ALL PRIVILEGES ON \`${credentials.database}\`.* TO '${username}'@'%';`);
    await client.raw("FLUSH PRIVILEGES;");
  }

  await client.destroy();
};

const createPostgresInfisicalUsers = async (
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[]
) => {
  const client = knex({
    client: "pg",
    connection: {
      database: credentials.database,
      port: credentials.port,
      host: credentials.host,
      user: credentials.username,
      password: credentials.password,
      connectionTimeoutMillis: 10000
    }
  });

  for await (const { username } of userCredentials) {
    // check if user exists, and if it does, don't create it
    const existingUser = await client.raw("SELECT * FROM pg_catalog.pg_user WHERE usename = ?", [username]);

    if (!existingUser.rows.length) {
      await client.raw(`CREATE USER "${username}" WITH PASSWORD 'temporary_password'`);
    }

    await client.raw("GRANT ALL PRIVILEGES ON DATABASE ?? TO ??", [credentials.database, username]);
  }

  await client.destroy();
};

const createOracleDBSecretRotation = async (
  appConnectionId: string,
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[],
  secretMapping: TSecretMapping
) => {
  const now = new Date();
  const rotationTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

  await createOracleInfisicalUsers(credentials, userCredentials);

  const createOracleDBSecretRotationReqBody = {
    parameters: userCredentials.reduce(
      (acc, user, index) => {
        acc[`username${index + 1}`] = user.username;
        return acc;
      },
      {} as Record<string, string>
    ),
    secretsMapping: {
      username: secretMapping.username,
      password: secretMapping.password
    },
    name: `test-oracle-${uuidv4()}`,
    description: "Test OracleDB Secret Rotation",
    secretPath: "/",
    isAutoRotationEnabled: true,
    rotationInterval: 5, // 5 seconds for testing
    rotateAtUtc: {
      hours: rotationTime.getUTCHours(),
      minutes: rotationTime.getUTCMinutes()
    },
    connectionId: appConnectionId,
    environment: seedData1.environment.slug,
    projectId: seedData1.projectV3.id
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/oracledb-credentials`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createOracleDBSecretRotationReqBody
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().secretRotation).toBeDefined();

  return res;
};

const createMySQLSecretRotation = async (
  appConnectionId: string,
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[],
  secretMapping: TSecretMapping
) => {
  const now = new Date();
  const rotationTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

  await createMySQLInfisicalUsers(credentials, userCredentials);

  const createMySQLSecretRotationReqBody = {
    parameters: userCredentials.reduce(
      (acc, user, index) => {
        acc[`username${index + 1}`] = user.username;
        return acc;
      },
      {} as Record<string, string>
    ),
    secretsMapping: {
      username: secretMapping.username,
      password: secretMapping.password
    },
    name: `test-mysql-rotation-${uuidv4()}`,
    description: "Test MySQL Secret Rotation",
    secretPath: "/",
    isAutoRotationEnabled: true,
    rotationInterval: 5,
    rotateAtUtc: {
      hours: rotationTime.getUTCHours(),
      minutes: rotationTime.getUTCMinutes()
    },
    connectionId: appConnectionId,
    environment: seedData1.environment.slug,
    projectId: seedData1.projectV3.id
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/mysql-credentials`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createMySQLSecretRotationReqBody
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().secretRotation).toBeDefined();

  return res;
};

const createPostgresSecretRotation = async (
  appConnectionId: string,
  credentials: TGenericSqlCredentials,
  userCredentials: TDatabaseUserCredentials[],
  secretMapping: TSecretMapping
) => {
  const now = new Date();
  const rotationTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

  await createPostgresInfisicalUsers(credentials, userCredentials);

  const createPostgresSecretRotationReqBody = {
    parameters: userCredentials.reduce(
      (acc, user, index) => {
        acc[`username${index + 1}`] = user.username;
        return acc;
      },
      {} as Record<string, string>
    ),
    secretsMapping: {
      username: secretMapping.username,
      password: secretMapping.password
    },
    name: `test-postgres-rotation-${uuidv4()}`,
    description: "Test Postgres Secret Rotation",
    secretPath: "/",
    isAutoRotationEnabled: true,
    rotationInterval: 5,
    rotateAtUtc: {
      hours: rotationTime.getUTCHours(),
      minutes: rotationTime.getUTCMinutes()
    },
    connectionId: appConnectionId,
    environment: seedData1.environment.slug,
    projectId: seedData1.projectV3.id
  };

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/postgres-credentials`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createPostgresSecretRotationReqBody
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().secretRotation).toBeDefined();

  return res;
};

describe("Secret Rotations", async () => {
  const testCases = [
    {
      type: SecretRotationType.MySQL,
      name: "MySQL (8.4.6) Secret Rotation",
      dbCredentials: {
        database: "mysql-test",
        host: "127.0.0.1",
        username: "root",
        password: "mysql-test",
        port: 3306
      },
      secretMapping: {
        username: formatSqlUsername("MYSQL_USERNAME"),
        password: formatSqlUsername("MYSQL_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("MYSQL_USER_1")
        },
        {
          username: formatSqlUsername("MYSQL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.MySQL,
      name: "MySQL (8.0.29) Secret Rotation",
      dbCredentials: {
        database: "mysql-test",
        host: "127.0.0.1",
        username: "root",
        password: "mysql-test",
        port: 3307
      },
      secretMapping: {
        username: formatSqlUsername("MYSQL_USERNAME"),
        password: formatSqlUsername("MYSQL_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("MYSQL_USER_1")
        },
        {
          username: formatSqlUsername("MYSQL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.MySQL,
      name: "MySQL (5.7.31) Secret Rotation",
      dbCredentials: {
        database: "mysql-test",
        host: "127.0.0.1",
        username: "root",
        password: "mysql-test",
        port: 3308
      },
      secretMapping: {
        username: formatSqlUsername("MYSQL_USERNAME"),
        password: formatSqlUsername("MYSQL_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("MYSQL_USER_1")
        },
        {
          username: formatSqlUsername("MYSQL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.OracleDb,
      name: "OracleDB (23.8) Secret Rotation",
      dbCredentials: {
        database: "FREEPDB1",
        host: "127.0.0.1",
        username: "system",
        password: "pdb-password",
        port: 1521
      },
      secretMapping: {
        username: formatSqlUsername("ORACLEDB_USERNAME"),
        password: formatSqlUsername("ORACLEDB_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("INFISICAL_USER_1")
        },
        {
          username: formatSqlUsername("INFISICAL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.OracleDb,
      name: "OracleDB (19.3) Secret Rotation",
      skippable: true,
      dbCredentials: {
        password: process.env.E2E_TEST_ORACLE_DB_19_PASSWORD!,
        host: process.env.E2E_TEST_ORACLE_DB_19_HOST!,
        username: process.env.E2E_TEST_ORACLE_DB_19_USERNAME!,
        port: 1521,
        database: process.env.E2E_TEST_ORACLE_DB_19_DATABASE!
      },
      secretMapping: {
        username: formatSqlUsername("ORACLEDB_USERNAME"),
        password: formatSqlUsername("ORACLEDB_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("INFISICAL_USER_1")
        },
        {
          username: formatSqlUsername("INFISICAL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.Postgres,
      name: "Postgres (17) Secret Rotation",
      dbCredentials: {
        database: "postgres-test",
        host: "127.0.0.1",
        username: "postgres-test",
        password: "postgres-test",
        port: 5433
      },
      secretMapping: {
        username: formatSqlUsername("POSTGRES_USERNAME"),
        password: formatSqlUsername("POSTGRES_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("INFISICAL_USER_1")
        },
        {
          username: formatSqlUsername("INFISICAL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.Postgres,
      name: "Postgres (16) Secret Rotation",
      dbCredentials: {
        database: "postgres-test",
        host: "127.0.0.1",
        username: "postgres-test",
        password: "postgres-test",
        port: 5434
      },
      secretMapping: {
        username: formatSqlUsername("POSTGRES_USERNAME"),
        password: formatSqlUsername("POSTGRES_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("INFISICAL_USER_1")
        },
        {
          username: formatSqlUsername("INFISICAL_USER_2")
        }
      ]
    },
    {
      type: SecretRotationType.Postgres,
      name: "Postgres (10.12) Secret Rotation",
      dbCredentials: {
        database: "postgres-test",
        host: "127.0.0.1",
        username: "postgres-test",
        password: "postgres-test",
        port: 5435
      },
      secretMapping: {
        username: formatSqlUsername("POSTGRES_USERNAME"),
        password: formatSqlUsername("POSTGRES_PASSWORD")
      },
      userCredentials: [
        {
          username: formatSqlUsername("INFISICAL_USER_1")
        },
        {
          username: formatSqlUsername("INFISICAL_USER_2")
        }
      ]
    }
  ] as {
    skippable?: boolean;
    type: SecretRotationType;
    name: string;
    dbCredentials: TGenericSqlCredentials;
    secretMapping: TSecretMapping;
    userCredentials: TDatabaseUserCredentials[];
  }[];

  const createAppConnectionMap = {
    [SecretRotationType.OracleDb]: createOracleDBAppConnection,
    [SecretRotationType.MySQL]: createMySQLAppConnection,
    [SecretRotationType.Postgres]: createPostgresAppConnection
  };

  const createRotationMap = {
    [SecretRotationType.OracleDb]: createOracleDBSecretRotation,
    [SecretRotationType.MySQL]: createMySQLSecretRotation,
    [SecretRotationType.Postgres]: createPostgresSecretRotation
  };

  const appConnectionIds: { id: string; type: SecretRotationType }[] = [];
  const secretRotationIds: { id: string; type: SecretRotationType }[] = [];

  afterAll(async () => {
    for (const { id, type } of secretRotationIds) {
      await deleteSecretRotation(id, type);
    }

    for (const { id, type } of appConnectionIds) {
      await deleteAppConnection(id, type);
    }
  });

  testCases.forEach(({ skippable, dbCredentials, secretMapping, userCredentials, type, name }) => {
    const shouldSkip = () => {
      if (skippable) {
        if (type === SecretRotationType.OracleDb) {
          if (!process.env.E2E_TEST_ORACLE_DB_19_HOST) {
            return true;
          }
        }
      }

      return false;
    };

    if (shouldSkip()) {
      test.skip(`Skipping Secret Rotation for ${type} (${name}) because E2E_TEST_ORACLE_DB_19_HOST is not set`);
    } else {
      test.concurrent(
        `Create secret rotation for ${name}`,
        async () => {
          const appConnectionId = await createAppConnectionMap[type](dbCredentials);

          if (appConnectionId) {
            appConnectionIds.push({ id: appConnectionId, type });
          }

          const res = await createRotationMap[type](appConnectionId, dbCredentials, userCredentials, secretMapping);

          const resJson = JSON.parse(res.payload);

          if (resJson.secretRotation) {
            secretRotationIds.push({ id: resJson.secretRotation.id, type });
          }

          const startSecretValue = await getSecretValue(secretMapping.password);
          expect(startSecretValue).toBeDefined();

          let attempts = 0;
          while (attempts < 60) {
            const currentSecretValue = await getSecretValue(secretMapping.password);

            if (currentSecretValue !== startSecretValue) {
              break;
            }

            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2_500));
          }

          if (attempts >= 60) {
            throw new Error("Secret rotation failed to rotate after 60 attempts");
          }

          const finalSecretValue = await getSecretValue(secretMapping.password);
          expect(finalSecretValue).not.toBe(startSecretValue);
        },
        {
          timeout: 300_000
        }
      );
    }
  });
});
