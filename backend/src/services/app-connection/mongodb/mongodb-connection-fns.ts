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

export const validateMongoDBConnectionCredentials = async (config: TMongoDBConnectionConfig) => {
  const srvRegex = new RE2("^mongodb\\+srv:\\/\\/");
  const protocolRegex = new RE2("^mongodb:\\/\\/");

  let normalizedHost = config.credentials.host.trim();
  const isSrvFromHost = srvRegex.test(normalizedHost);
  if (isSrvFromHost) {
    normalizedHost = srvRegex.replace(normalizedHost, "");
  } else if (protocolRegex.test(normalizedHost)) {
    normalizedHost = protocolRegex.replace(normalizedHost, "");
  }

  const [hostIp] = await verifyHostInputValidity(normalizedHost);

  let client: MongoClient | null = null;
  try {
    const isSrv = !config.credentials.port || isSrvFromHost;
    const uri = isSrv ? `mongodb+srv://${hostIp}` : `mongodb://${hostIp}:${config.credentials.port}`;

    const clientOptions: {
      auth?: { username: string; password?: string };
      authSource?: string;
      tls?: boolean;
      tlsInsecure?: boolean;
      ca?: string;
      directConnection?: boolean;
    } = {
      auth: {
        username: config.credentials.username,
        password: config.credentials.password
      },
      authSource: isSrv ? undefined : config.credentials.database,
      directConnection: !isSrv
    };

    if (config.credentials.sslEnabled) {
      clientOptions.tls = true;
      clientOptions.tlsInsecure = !config.credentials.sslRejectUnauthorized;
      if (config.credentials.sslCertificate) {
        clientOptions.ca = config.credentials.sslCertificate;
      }
    }

    client = new MongoClient(uri, clientOptions);

    await client
      .db(config.credentials.database)
      .command({ ping: 1 })
      .then(() => true);

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
