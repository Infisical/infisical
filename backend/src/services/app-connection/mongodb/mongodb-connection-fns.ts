import { MongoClient } from "mongodb";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { MongoDBConnectionMethod } from "./mongodb-connection-enums";
import { TMongoDBConnectionConfig } from "./mongodb-connection-types";

export const getMongoDBConnectionListItem = () => {
  return {
    name: "MongoDB" as const,
    app: AppConnection.MongoDB as const,
    methods: Object.values(MongoDBConnectionMethod) as [MongoDBConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: false as const
  };
};

export type TMongoDBConnectionCredentials = {
  host: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  tlsEnabled?: boolean;
  tlsRejectUnauthorized?: boolean;
  tlsCertificate?: string;
};

export type TCreateMongoClientOptions = {
  authCredentials?: { username: string; password: string };
  validateConnection?: boolean;
};

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

export const createMongoClient = async (
  credentials: TMongoDBConnectionCredentials,
  options?: TCreateMongoClientOptions
): Promise<MongoClient> => {
  const srvRegex = new RE2("^mongodb\\+srv:\\/\\/");
  const protocolRegex = new RE2("^mongodb:\\/\\/");

  let normalizedHost = credentials.host.trim();
  const isSrvFromHost = srvRegex.test(normalizedHost);
  if (isSrvFromHost) {
    normalizedHost = srvRegex.replace(normalizedHost, "");
  } else if (protocolRegex.test(normalizedHost)) {
    normalizedHost = protocolRegex.replace(normalizedHost, "");
  }

  const [hostIp] = await verifyHostInputValidity(normalizedHost);

  const isSrv = !credentials.port || isSrvFromHost;
  const uri = isSrv ? `mongodb+srv://${hostIp}` : `mongodb://${hostIp}:${credentials.port}`;

  const authCredentials = options?.authCredentials ?? {
    username: credentials.username,
    password: credentials.password
  };

  const clientOptions: {
    auth?: { username: string; password?: string };
    authSource?: string;
    tls?: boolean;
    tlsInsecure?: boolean;
    ca?: string;
    directConnection?: boolean;
    connectTimeoutMS?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  } = {
    auth: {
      username: authCredentials.username,
      password: authCredentials.password
    },
    authSource: isSrv ? undefined : credentials.database,
    directConnection: !isSrv,
    connectTimeoutMS: DEFAULT_CONNECTION_TIMEOUT_MS,
    serverSelectionTimeoutMS: DEFAULT_CONNECTION_TIMEOUT_MS,
    socketTimeoutMS: DEFAULT_CONNECTION_TIMEOUT_MS
  };

  if (credentials.tlsEnabled) {
    clientOptions.tls = true;
    clientOptions.tlsInsecure = !credentials.tlsRejectUnauthorized;
    if (credentials.tlsCertificate) {
      clientOptions.ca = credentials.tlsCertificate;
    }
  }

  const client = new MongoClient(uri, clientOptions);

  if (options?.validateConnection) {
    await client
      .db(credentials.database)
      .command({ ping: 1 })
      .then(() => true);
  }

  return client;
};

export const validateMongoDBConnectionCredentials = async (config: TMongoDBConnectionConfig) => {
  let client: MongoClient | null = null;
  try {
    client = await createMongoClient(config.credentials, { validateConnection: true });

    if (client) await client.close();

    return config.credentials;
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(err as Error)?.message || "verify credentials"}`
    });
  } finally {
    if (client) await client.close();
  }
};
