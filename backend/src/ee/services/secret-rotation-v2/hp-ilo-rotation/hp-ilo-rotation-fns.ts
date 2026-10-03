import { AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import https from "https";
import net from "net";
import RE2 from "re2";
import { Client, ClientChannel } from "ssh2";
import tls from "tls";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses, safeRequest } from "@app/lib/validator";
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

const HP_ILO_REDFISH_PORT = 443;
const HP_ILO_REDFISH_ACCOUNTS_PATH = "/redfish/v1/AccountService/Accounts/";
const HP_ILO_REDFISH_MAX_ACCOUNT_LOOKUPS = 50;
const HP_ILO_REDFISH_MAX_COLLECTION_PAGES = 10;
const HP_ILO_REDFISH_REQUEST_TIMEOUT_MS = 30_000;

type TRedfishCollection = {
  Members?: { "@odata.id": string }[];
  "Members@odata.nextLink"?: string;
};

type TRedfishAccount = {
  UserName?: string;
};

type TRedfishErrorResponse = {
  error?: { "@Message.ExtendedInfo"?: { MessageId?: string }[] };
};

export const hpIloApiClientFactory: THpIloClientFactory = (config, gatewayV2Service) => {
  const { host } = config.credentials;
  const urlHost = net.isIPv6(host) ? `[${host}]` : host;
  const baseUrl = `https://${urlHost}:${HP_ILO_REDFISH_PORT}`;

  // Through the gateway the socket points at localhost, so the certificate has to be checked against the iLO host
  // explicitly; SNI is left unset for IP hosts since TLS does not allow an IP address as the server name.
  // iLO ships with certificates that do not chain to a public CA, and there is no CA setting to trust one yet
  const tlsOptions = {
    rejectUnauthorized: false,
    servername: net.isIP(host) ? undefined : host,
    checkServerIdentity: (_: string, cert: tls.PeerCertificate) => tls.checkServerIdentity(host, cert)
  };

  const sendRequest = async <T = unknown>(
    path: string,
    requestConfig: Omit<AxiosRequestConfig, "url">
  ): Promise<AxiosResponse<T>> => {
    if (config.gatewayId) {
      await blockLocalAndPrivateIpAddresses(baseUrl, true);

      const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
        gatewayId: config.gatewayId,
        targetHost: host,
        targetPort: HP_ILO_REDFISH_PORT
      });

      if (!platformConnectionDetails) {
        throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
      }

      return withGatewayV2Proxy(
        (proxyPort) =>
          request.request<T>({
            ...requestConfig,
            timeout: HP_ILO_REDFISH_REQUEST_TIMEOUT_MS,
            url: `https://localhost:${proxyPort}${path}`,
            headers: { ...requestConfig.headers, Host: urlHost },
            httpsAgent: new https.Agent(tlsOptions),
            maxRedirects: 0
          }),
        {
          protocol: GatewayProxyProtocol.Tcp,
          ...platformConnectionDetails
        }
      );
    }

    return safeRequest.request<T>({
      ...requestConfig,
      timeout: HP_ILO_REDFISH_REQUEST_TIMEOUT_MS,
      url: `${baseUrl}${path}`,
      rejectUnauthorized: tlsOptions.rejectUnauthorized,
      servername: tlsOptions.servername
    });
  };

  const basicAuth = (username: string, password: string) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  const describeRedfishError = (error: unknown) => {
    if (!isAxiosError(error)) return (error as Error).message;
    if (error.response?.status === 401) return "invalid username or password";

    const messageIds = (error.response?.data as TRedfishErrorResponse | undefined)?.error?.["@Message.ExtendedInfo"]
      ?.map((info) => info.MessageId)
      .filter(Boolean);
    return messageIds?.length ? `${error.message} (${messageIds.join(", ")})` : error.message;
  };

  // Links come back from the iLO; only their path and query are kept so requests always go to the configured host
  const toRedfishPath = (odataId: string) => {
    const url = new URL(odataId, baseUrl);
    return `${url.pathname}${url.search}`;
  };

  const accountPathCache = new Map<string, string>();

  const resolveAccountPath = async (authorization: string, username: string) => {
    const cachedPath = accountPathCache.get(username);
    if (cachedPath) return cachedPath;

    const checkedPaths = new Set<string>();
    let isSearchTruncated = false;

    const findInMembers = async (members: TRedfishCollection["Members"]) => {
      for (const member of members ?? []) {
        const memberPath = toRedfishPath(member["@odata.id"]);
        if (!checkedPaths.has(memberPath)) {
          if (checkedPaths.size >= HP_ILO_REDFISH_MAX_ACCOUNT_LOOKUPS) {
            isSearchTruncated = true;
            return undefined;
          }
          checkedPaths.add(memberPath);

          // eslint-disable-next-line no-await-in-loop
          const { data: account } = await sendRequest<TRedfishAccount>(memberPath, {
            method: "GET",
            headers: { Authorization: authorization }
          });
          if (account.UserName === username) return memberPath;
        }
      }
      return undefined;
    };

    const fetchCollectionPage = async (pagePath: string): Promise<TRedfishCollection> => {
      const { data } = await sendRequest<TRedfishCollection>(pagePath, {
        method: "GET",
        headers: { Authorization: authorization }
      });
      return data;
    };

    const searchCollection = async (collectionPath: string) => {
      let pagePath: string | undefined = collectionPath;
      for (let page = 0; pagePath; page += 1) {
        if (page >= HP_ILO_REDFISH_MAX_COLLECTION_PAGES) {
          isSearchTruncated = true;
          return undefined;
        }

        // eslint-disable-next-line no-await-in-loop
        const collection = await fetchCollectionPage(pagePath);

        // eslint-disable-next-line no-await-in-loop
        const match = await findInMembers(collection.Members);
        if (match || isSearchTruncated) return match;

        const nextLink = collection["Members@odata.nextLink"];
        pagePath = nextLink ? toRedfishPath(nextLink) : undefined;
      }
      return undefined;
    };

    const filter = encodeURIComponent(`UserName eq '${username.replaceAll("'", "''")}'`);
    let accountPath: string | undefined;

    try {
      accountPath = await searchCollection(`${HP_ILO_REDFISH_ACCOUNTS_PATH}?$filter=${filter}`);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) throw error;
    }

    if (!accountPath && !isSearchTruncated) {
      accountPath = await searchCollection(HP_ILO_REDFISH_ACCOUNTS_PATH);
    }

    if (!accountPath) {
      throw new Error(
        isSearchTruncated
          ? `HP iLO account '${username}' not found within the first ${checkedPaths.size} accounts checked; the search stopped before reaching the end of the account list`
          : `HP iLO account '${username}' not found`
      );
    }

    accountPathCache.set(username, accountPath);
    return accountPath;
  };

  const changePassword = async (authorization: string, targetUsername: string, newPassword: string) => {
    try {
      const accountPath = await resolveAccountPath(authorization, targetUsername);
      await sendRequest(accountPath, {
        method: "PATCH",
        data: { Password: newPassword },
        headers: { Authorization: authorization, "Content-Type": "application/json" }
      });
    } catch (error) {
      throw new Error(`HP iLO password change failed: ${describeRedfishError(error)}`);
    }
  };

  const changePasswordAsAdmin = async (targetUsername: string, newPassword: string) => {
    if (config.method !== SshConnectionMethod.Password) {
      throw new Error("HP iLO password change failed: the Redfish API requires a password-based connection");
    }

    await changePassword(
      basicAuth(config.credentials.username, config.credentials.password),
      targetUsername,
      newPassword
    );
  };

  const changePasswordAsTarget = async (username: string, currentPassword: string, newPassword: string) => {
    await changePassword(basicAuth(username, currentPassword), username, newPassword);
  };

  const verifyPassword = async (username: string, password: string) => {
    const authorization = basicAuth(username, password);
    try {
      const accountPath = await resolveAccountPath(authorization, username);
      await sendRequest(accountPath, { method: "GET", headers: { Authorization: authorization } });
    } catch (error) {
      throw new Error(`HP iLO password verification failed: ${describeRedfishError(error)}`);
    }
  };

  return {
    changePasswordAsAdmin,
    changePasswordAsTarget,
    verifyPassword
  };
};

export const hpIloFallbackClientFactory =
  (primaryFactory: THpIloClientFactory, fallbackFactory: THpIloClientFactory): THpIloClientFactory =>
  (config, gatewayV2Service) => {
    const primary = primaryFactory(config, gatewayV2Service);
    const fallback = fallbackFactory(config, gatewayV2Service);

    const withFallback = async (operation: string, run: (client: THpIloClient) => Promise<void>) => {
      try {
        await run(primary);
      } catch (primaryError) {
        logger.warn(
          `HP iLO ${operation} failed on primary client, retrying with fallback [host=${config.credentials.host}]: ${(primaryError as Error).message}`
        );
        try {
          await run(fallback);
        } catch (fallbackError) {
          throw new Error(
            `HP iLO ${operation} failed: ${(primaryError as Error).message}; fallback also failed: ${(fallbackError as Error).message}`
          );
        }
      }
    };

    return {
      changePasswordAsAdmin: (targetUsername, newPassword) =>
        withFallback("password change", (client) => client.changePasswordAsAdmin(targetUsername, newPassword)),
      changePasswordAsTarget: (username, currentPassword, newPassword) =>
        withFallback("password change", (client) =>
          client.changePasswordAsTarget(username, currentPassword, newPassword)
        ),
      verifyPassword: (username, password) =>
        withFallback("password verification", (client) => client.verifyPassword(username, password))
    };
  };

export const hpIloRotationFactory: TRotationFactory<
  THpIloRotationWithConnection,
  THpIloRotationGeneratedCredentials,
  THpIloRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = HpIloRotationMethod.LoginAsRoot } = parameters;

  const getIloClient = async (
    clientFactory: THpIloClientFactory = hpIloFallbackClientFactory(hpIloApiClientFactory, hpIloSshClientFactory)
  ): Promise<THpIloClient> => {
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
    if (username === connection.credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

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
