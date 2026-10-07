import { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import https from "https";
import net from "net";
import tls from "tls";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn/array";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { safeRequest } from "@app/lib/validator";
import { THpeIloConnectionConfig } from "@app/services/app-connection/hpe-ilo";
import { HPE_ILO_DEFAULT_PORT } from "@app/services/app-connection/hpe-ilo/hpe-ilo-connection-fns";

import { THpIloClient } from "./hp-ilo-rotation-types";

const HP_ILO_REDFISH_SERVICE_ROOT_PATH = "/redfish/v1/";
const HP_ILO_REDFISH_ACCOUNTS_PATH = "/redfish/v1/AccountService/Accounts/";
const HP_ILO_REDFISH_MAX_ACCOUNT_LOOKUPS = 50;
const HP_ILO_REDFISH_ACCOUNT_LOOKUP_CONCURRENCY = 5;
const HP_ILO_REDFISH_MAX_COLLECTION_PAGES = 10;
const HP_ILO_REDFISH_REQUEST_TIMEOUT_MS = 30_000;
const HP_ILO_GATEWAY_CONNECTION_DETAILS_MAX_AGE_MS = 2 * 60 * 1000;

type TRedfishAccount = {
  UserName?: string;
};

type TRedfishCollection = {
  Members?: ({ "@odata.id": string } & TRedfishAccount)[];
  "Members@odata.nextLink"?: string;
};

type TRedfishErrorResponse = {
  error?: { "@Message.ExtendedInfo"?: { MessageId?: string }[] };
};

export const hpIloRedfishClientFactory = (
  config: Pick<THpeIloConnectionConfig, "credentials" | "gatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): THpIloClient => {
  const { credentials } = config;
  const { hostname: host } = credentials;
  const port = credentials.port ?? HPE_ILO_DEFAULT_PORT;
  const baseUrl = `https://${host}:${port}`;

  // Through the gateway the socket points at localhost, so the certificate has to be checked against the iLO host
  // explicitly; SNI is left unset for IP hosts since TLS does not allow an IP address as the server name
  const tlsOptions = {
    rejectUnauthorized: credentials.sslRejectUnauthorized ?? true,
    ca: credentials.sslCertificate,
    servername: net.isIP(host) ? undefined : host,
    checkServerIdentity: (_: string, cert: tls.PeerCertificate) => tls.checkServerIdentity(host, cert)
  };

  const fetchConnectionDetails = async (gatewayId: string) => {
    const details = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: host,
      targetPort: port
    });
    if (!details) {
      throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    }
    return details;
  };

  // Every set of connection details carries a freshly generated key and a client certificate valid for 5 minutes, so
  // the requests of one rotation share a set, and it is replaced well before the certificate could expire mid-tunnel
  let cachedConnectionDetails: { details: ReturnType<typeof fetchConnectionDetails>; fetchedAt: number } | undefined;

  const getConnectionDetails = (gatewayId: string) => {
    if (
      cachedConnectionDetails &&
      Date.now() - cachedConnectionDetails.fetchedAt <= HP_ILO_GATEWAY_CONNECTION_DETAILS_MAX_AGE_MS
    ) {
      return cachedConnectionDetails.details;
    }

    const entry = { details: fetchConnectionDetails(gatewayId), fetchedAt: Date.now() };
    cachedConnectionDetails = entry;
    entry.details.catch(() => {
      if (cachedConnectionDetails === entry) cachedConnectionDetails = undefined;
    });
    return entry.details;
  };

  const sendRequest = async <T = unknown>(
    path: string,
    baseRequestConfig: Omit<AxiosRequestConfig, "url">
  ): Promise<AxiosResponse<T>> => {
    // iLO drops idle keep-alive connections almost immediately, while safeRequest's cached agents keep sockets open
    // for reuse; a reused socket then fails with "socket hang up", so every request asks for its connection to close
    const requestConfig = {
      ...baseRequestConfig,
      timeout: baseRequestConfig.timeout ?? HP_ILO_REDFISH_REQUEST_TIMEOUT_MS,
      headers: { ...baseRequestConfig.headers, Connection: "close" }
    };

    if (config.gatewayId) {
      const platformConnectionDetails = await getConnectionDetails(config.gatewayId);

      // withGatewayV2Proxy rethrows callback errors as its own types, which drops the HTTP status callers branch on,
      // so an error carrying an iLO response is passed out as a value and rethrown after the proxy closes
      const outcome = await withGatewayV2Proxy(
        async (proxyPort): Promise<{ response: AxiosResponse<T> } | { responseError: AxiosError }> => {
          try {
            const response = await request.request<T>({
              ...requestConfig,
              url: `https://localhost:${proxyPort}${path}`,
              headers: { ...requestConfig.headers, Host: host },
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
      url: `${baseUrl}${path}`,
      rejectUnauthorized: tlsOptions.rejectUnauthorized,
      ca: tlsOptions.ca,
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

  // Links come back from the iLO; only their path and query are kept so requests always go to the configured host.
  // The path is appended straight after the host, so one that does not start with "/" (a link with a non-HTTP
  // scheme such as "x:@127.0.0.1:8443/") would rewrite the authority and send the request, credentials included,
  // somewhere else
  const toRedfishPath = (odataId: string) => {
    const url = new URL(odataId, baseUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.pathname.startsWith(HP_ILO_REDFISH_SERVICE_ROOT_PATH)
    ) {
      throw new BadRequestError({
        message: `HP iLO returned a link outside the Redfish API ('${odataId.slice(0, 200)}'), so it was not followed`
      });
    }
    return `${url.pathname}${url.search}`;
  };

  const accountPathCache = new Map<string, string>();

  const resolveAccountPath = async (authorization: string, username: string) => {
    const cachedPath = accountPathCache.get(username);
    if (cachedPath) return cachedPath;

    const checkedPaths = new Set<string>();
    let memberLookups = 0;
    let isSearchTruncated = false;
    let unreadableAccounts = 0;

    // A login without user-management privilege can list the collection but only read its own account, so a 403 on
    // another member just means it is not the account being looked for. A 404 is an account removed after listing
    const readMemberUsername = async (memberPath: string) => {
      try {
        const { data: account } = await sendRequest<TRedfishAccount>(memberPath, {
          method: "GET",
          headers: { Authorization: authorization }
        });
        return account.UserName;
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status !== 403 && status !== 404) throw error;
        unreadableAccounts += 1;
        return undefined;
      }
    };

    const findByReadingMembers = async (memberPaths: string[]) => {
      const remainingLookups = Math.max(HP_ILO_REDFISH_MAX_ACCOUNT_LOOKUPS - memberLookups, 0);
      const pathsToRead = memberPaths.slice(0, remainingLookups);

      for (const batch of chunkArray(pathsToRead, HP_ILO_REDFISH_ACCOUNT_LOOKUP_CONCURRENCY)) {
        memberLookups += batch.length;

        // eslint-disable-next-line no-await-in-loop
        const usernames = await Promise.all(batch.map(readMemberUsername));
        batch.forEach((memberPath) => checkedPaths.add(memberPath));

        const matchIndex = usernames.indexOf(username);
        if (matchIndex !== -1) return batch[matchIndex];
      }

      if (pathsToRead.length < memberPaths.length) isSearchTruncated = true;
      return undefined;
    };

    const findInMembers = async (members: TRedfishCollection["Members"]) => {
      // A page that was not expanded (firmware ignoring $expand, or a nextLink that drops it) only lists links,
      // so those accounts have to be read on their own
      const unexpandedPaths = new Set<string>();
      for (const member of members ?? []) {
        const memberPath = toRedfishPath(member["@odata.id"]);
        if (!checkedPaths.has(memberPath)) {
          if (member.UserName === undefined) {
            unexpandedPaths.add(memberPath);
          } else {
            checkedPaths.add(memberPath);
            if (member.UserName === username) return memberPath;
          }
        }
      }

      return findByReadingMembers([...unexpandedPaths]);
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

    // HPE documents $expand=. on Accounts for iLO 5, 6 and 7, which inlines UserName on every member and saves a
    // request (and a gateway tunnel) per account. $expand=* is avoided because firmware before iLO 7 1.22 rejects it
    let accountPath: string | undefined;
    try {
      accountPath = await searchCollection(`${HP_ILO_REDFISH_ACCOUNTS_PATH}?$expand=.`);
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === undefined || status === 401 || status >= 500) throw error;
      accountPath = await searchCollection(HP_ILO_REDFISH_ACCOUNTS_PATH);
    }

    if (!accountPath) {
      const unreadableNote = unreadableAccounts
        ? ` (${unreadableAccounts} account(s) could not be read with the credentials used)`
        : "";
      throw new Error(
        isSearchTruncated
          ? `HP iLO account '${username}' not found within the first ${checkedPaths.size} accounts checked; the search stopped before reaching the end of the account list${unreadableNote}`
          : `HP iLO account '${username}' not found${unreadableNote}`
      );
    }

    accountPathCache.set(username, accountPath);
    return accountPath;
  };

  const readAccountAs = async (username: string, password: string) => {
    const authorization = basicAuth(username, password);
    const accountPath = await resolveAccountPath(authorization, username);
    await sendRequest(accountPath, { method: "GET", headers: { Authorization: authorization } });
  };

  const isPasswordAccepted = async (username: string, password: string) => {
    try {
      await readAccountAs(username, password);
      return true;
    } catch {
      return false;
    }
  };

  const changePassword = async (targetUsername: string, newPassword: string) => {
    const authorization = basicAuth(credentials.username, credentials.password);
    let isPatchSent = false;
    try {
      const accountPath = await resolveAccountPath(authorization, targetUsername);
      isPatchSent = true;
      await sendRequest(accountPath, {
        method: "PATCH",
        data: { Password: newPassword },
        headers: { Authorization: authorization, "Content-Type": "application/json" }
      });
      return { isNewPasswordVerified: false };
    } catch (error) {
      // A failed PATCH may still have been applied: its response can be lost (gateway transport failures arrive as
      // non-Axios errors) and firmware can apply the change and still answer with an error. The rotation only stores
      // the new password on success, so failing here while the iLO already accepts it would leave Infisical holding a
      // password that no longer works
      if (isPatchSent && (await isPasswordAccepted(targetUsername, newPassword)))
        return { isNewPasswordVerified: true };

      throw new Error(`HP iLO password change failed: ${describeRedfishError(error)}`);
    }
  };

  const verifyPassword = async (username: string, password: string) => {
    try {
      await readAccountAs(username, password);
    } catch (error) {
      throw new Error(`HP iLO password verification failed: ${describeRedfishError(error)}`);
    }
  };

  return {
    changePassword,
    verifyPassword
  };
};
