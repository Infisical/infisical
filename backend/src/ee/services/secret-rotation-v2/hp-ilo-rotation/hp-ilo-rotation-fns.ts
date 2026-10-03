import { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
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
  isEnabled: () => Promise<boolean>;
  changePasswordAsAdmin: (targetUsername: string, newPassword: string) => Promise<void>;
  changePasswordAsTarget: (username: string, currentPassword: string, newPassword: string) => Promise<void>;
  verifyPassword: (username: string, password: string) => Promise<void>;
};

// Signals that an operation failed without modifying the iLO account, which is what makes it safe for the fallback
// client to retry it; any other error may hide a password change that was applied
export class HpIloAccountUnchangedError extends Error {}

export type THpIloClientOptions = {
  sslRejectUnauthorized: boolean;
};

export type THpIloClientFactory = (
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  options: THpIloClientOptions
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
    isEnabled: async () => true,
    changePasswordAsAdmin,
    changePasswordAsTarget,
    verifyPassword
  };
};

const HP_ILO_REDFISH_PORT = 443;
const HP_ILO_REDFISH_SERVICE_ROOT_PATH = "/redfish/v1/";
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

export const hpIloApiClientFactory: THpIloClientFactory = (config, gatewayV2Service, options) => {
  const { host } = config.credentials;
  const urlHost = net.isIPv6(host) ? `[${host}]` : host;
  const baseUrl = `https://${urlHost}:${HP_ILO_REDFISH_PORT}`;

  // Through the gateway the socket points at localhost, so the certificate has to be checked against the iLO host
  // explicitly; SNI is left unset for IP hosts since TLS does not allow an IP address as the server name
  const tlsOptions = {
    rejectUnauthorized: options.sslRejectUnauthorized,
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

      // withGatewayV2Proxy rethrows callback errors as its own types, which drops the HTTP status callers branch on,
      // so an error carrying an iLO response is passed out as a value and rethrown after the proxy closes
      const outcome = await withGatewayV2Proxy(
        async (proxyPort): Promise<{ response: AxiosResponse<T> } | { responseError: AxiosError }> => {
          try {
            const response = await request.request<T>({
              ...requestConfig,
              timeout: HP_ILO_REDFISH_REQUEST_TIMEOUT_MS,
              url: `https://localhost:${proxyPort}${path}`,
              headers: { ...requestConfig.headers, Host: urlHost },
              httpsAgent: new https.Agent(tlsOptions),
              maxRedirects: 0,
              proxy: false
            });
            return { response };
          } catch (error) {
            if (isAxiosError(error) && error.response) return { responseError: error };
            throw error;
          }
        },
        {
          protocol: GatewayProxyProtocol.Tcp,
          ...platformConnectionDetails
        }
      );

      if ("responseError" in outcome) throw outcome.responseError;
      return outcome.response;
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

  const checkPassword = async (username: string, password: string): Promise<"accepted" | "rejected" | "unknown"> => {
    try {
      const authorization = basicAuth(username, password);
      const accountPath = await resolveAccountPath(authorization, username);
      await sendRequest(accountPath, { method: "GET", headers: { Authorization: authorization } });
      return "accepted";
    } catch (error) {
      return isAxiosError(error) && error.response?.status === 401 ? "rejected" : "unknown";
    }
  };

  const changePassword = async (authorization: string, targetUsername: string, newPassword: string) => {
    let isPatchSent = false;
    try {
      const accountPath = await resolveAccountPath(authorization, targetUsername);
      isPatchSent = true;
      await sendRequest(accountPath, {
        method: "PATCH",
        data: { Password: newPassword },
        headers: { Authorization: authorization, "Content-Type": "application/json" }
      });
    } catch (error) {
      // A failed PATCH may still have been applied: its response can be lost (gateway transport failures arrive as
      // non-Axios errors), firmware can apply the change and still answer with an error, and the shared client retries
      // resets and 5xx responses, so a retry authenticating with a replaced password can fail after the first attempt
      // succeeded. The rotation only stores the new password on success, so the iLO is asked whether it now accepts it
      // before the failure is classified. Only a 4xx paired with the iLO rejecting the new password proves the account
      // was left unchanged
      let isAccountUnchanged = !isPatchSent;
      if (isPatchSent) {
        const newPasswordCheck = await checkPassword(targetUsername, newPassword);
        if (newPasswordCheck === "accepted") return;

        const status = isAxiosError(error) ? error.response?.status : undefined;
        isAccountUnchanged = status !== undefined && status < 500 && newPasswordCheck === "rejected";
      }

      const message = `HP iLO password change failed: ${describeRedfishError(error)}`;
      throw isAccountUnchanged ? new HpIloAccountUnchangedError(message) : new Error(message);
    }
  };

  const changePasswordAsAdmin = async (targetUsername: string, newPassword: string) => {
    if (config.method !== SshConnectionMethod.Password) {
      throw new HpIloAccountUnchangedError(
        "HP iLO password change failed: the Redfish API requires a password-based connection"
      );
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
      throw new HpIloAccountUnchangedError(`HP iLO password verification failed: ${describeRedfishError(error)}`);
    }
  };

  // The service root needs no credentials, so this only checks that Redfish is reachable over a verified TLS
  // connection; whether a given account's credentials work is left to the operation, whose 401 falls back safely.
  // A certificate that fails verification (the iLO default is self-signed) disables this client, so no credentials
  // are sent to an endpoint that cannot be authenticated
  const isEnabled = async () => {
    try {
      await sendRequest(HP_ILO_REDFISH_SERVICE_ROOT_PATH, { method: "GET" });
      return true;
    } catch {
      return false;
    }
  };

  return {
    isEnabled,
    changePasswordAsAdmin,
    changePasswordAsTarget,
    verifyPassword
  };
};

// Tries each enabled client in order, moving on only when the failed one reports the account as unchanged. Retrying
// after a change that may have been applied would authenticate with a replaced password and leave Infisical out of
// sync with the iLO.
export const hpIloFallbackClientFactory =
  (...clientFactories: THpIloClientFactory[]): THpIloClientFactory =>
  (config, gatewayV2Service, options) => {
    const clients = clientFactories.map((clientFactory) => clientFactory(config, gatewayV2Service, options));

    const enabledChecks: Promise<boolean>[] = [];
    const isClientEnabled = (index: number) => {
      enabledChecks[index] ??= clients[index].isEnabled().catch(() => false);
      return enabledChecks[index];
    };

    const runWithFallback = async (operation: string, run: (client: THpIloClient) => Promise<void>) => {
      const failures: string[] = [];

      for (const [index, client] of clients.entries()) {
        // eslint-disable-next-line no-await-in-loop
        if (await isClientEnabled(index)) {
          if (index > 0) {
            logger.warn(
              `HP iLO ${operation} falling back to client ${index} [host=${config.credentials.host}]${failures.length ? `: ${failures[failures.length - 1]}` : ""}`
            );
          }

          try {
            // eslint-disable-next-line no-await-in-loop
            await run(client);
            return;
          } catch (error) {
            failures.push((error as Error).message);
            if (!(error instanceof HpIloAccountUnchangedError)) break;
          }
        }
      }

      if (!failures.length) {
        throw new Error(`No HP iLO client is available for host '${config.credentials.host}'`);
      }
      throw new Error(failures.join("; "));
    };

    return {
      isEnabled: async () => {
        for (let index = 0; index < clients.length; index += 1) {
          // eslint-disable-next-line no-await-in-loop
          if (await isClientEnabled(index)) return true;
        }
        return false;
      },
      changePasswordAsAdmin: (targetUsername, newPassword) =>
        runWithFallback("password change", (client) => client.changePasswordAsAdmin(targetUsername, newPassword)),
      changePasswordAsTarget: (username, currentPassword, newPassword) =>
        runWithFallback("password change", (client) =>
          client.changePasswordAsTarget(username, currentPassword, newPassword)
        ),
      verifyPassword: (username, password) =>
        runWithFallback("password verification", (client) => client.verifyPassword(username, password))
    };
  };

export const hpIloRotationFactory: TRotationFactory<
  THpIloRotationWithConnection,
  THpIloRotationGeneratedCredentials,
  THpIloRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const {
    username,
    passwordRequirements,
    rotationMethod = HpIloRotationMethod.LoginAsRoot,
    sslRejectUnauthorized = true
  } = parameters;

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
    return clientFactory(sshConfig, gatewayV2Service, { sslRejectUnauthorized });
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
