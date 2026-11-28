import dns from "dns";
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";
import { delay } from "@app/lib/delay";
import {
  DnsUpdateError,
  isDnsNameInZone,
  isValidDnsName,
  normalizeDnsName,
  TDnsUpdateClient
} from "@app/lib/dns-update";
import { BadRequestError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { logger } from "@app/lib/logger";
import {
  executeWithRfc2136Client,
  getRfc2136ErrorMessage,
  TRfc2136Connection,
  TRfc2136GatewayDeps
} from "@app/services/app-connection/rfc2136";

const ACME_CHALLENGE_TTL_SECONDS = 60;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_INTERVAL_MS = 1000;
const NAMESERVER_WAIT_MS = 60_000;
const NAMESERVER_POLL_INTERVAL_MS = 2000;
const NAMESERVER_QUERY_TIMEOUT_MS = 2000;
// Real zones list 2 to 6 nameservers; the cap keeps a zone from turning each order into a flood of queries
const MAX_NAMESERVERS = 10;
const SURROUNDING_QUOTES_REGEX = new RE2('^"|"$', "g");

export type TRfc2136ProviderDeps = TRfc2136GatewayDeps & { abortSignal?: AbortSignal };

export const validateRfc2136Zone = (zone: string) => {
  if (zone && !isValidDnsName(zone)) {
    throw new BadRequestError({
      message: `Invalid DNS zone '${zone}'. Enter a zone name such as example.com, or leave it empty to detect the zone from the DNS server.`
    });
  }
};

// Infisical follows CNAMEs through public DNS only, so one that exists just on this server leaves the record name
// pointing at a CNAME, where the server ignores a TXT update.
const cnameError = (name: string, target: string, host: string) =>
  new Error(
    `'${name}' is an alias (CNAME) for '${target}' on DNS server '${host}', so the server can't add the TXT record there. Publish the CNAME in public DNS so Infisical follows it, or remove it.`
  );

// An empty zone means the CA leaves zone detection to the server (RFC 2308 SOA in the reply).
const resolveZone = async (client: TDnsUpdateClient, zone: string, name: string, host: string) => {
  if (zone) {
    if (!isDnsNameInZone(name, zone)) {
      throw new Error(
        `The challenge record '${name}' is not inside zone '${zone}'. Enter the zone that contains it on the certificate authority, or leave the zone empty to detect it from the DNS server.`
      );
    }
    return normalizeDnsName(zone);
  }

  const { zone: detected, cnameTarget } = await client.findZone(name);
  if (cnameTarget) throw cnameError(name, cnameTarget, host);
  if (!detected) {
    throw new Error(
      `DNS server '${host}' is not authoritative for any zone containing '${name}'. Check that the connection points at the zone's primary server, or enter the zone on the certificate authority.`
    );
  }
  return detected;
};

// The server can answer NOERROR without storing the record (for example when the name is a CNAME), so the add is
// confirmed by reading it back. A secondary that forwards updates only serves the record once the zone transfer
// reaches it, a few seconds later, so a missing value is asked for again before the order fails. A read-back the
// server refuses or that times out is logged and the order goes on.
const confirmTxtRecord = async (
  client: TDnsUpdateClient,
  name: string,
  value: string,
  host: string,
  abortSignal?: AbortSignal
) => {
  for (let attempt = 1; ; attempt += 1) {
    let result: Awaited<ReturnType<TDnsUpdateClient["queryTxtRecord"]>>;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await client.queryTxtRecord(name);
    } catch (error) {
      logger.warn(error, `Could not read back RFC 2136 TXT record, continuing [host=${host}] [name=${name}]`);
      return;
    }

    if (result.values.includes(value)) return;
    if (result.cnameTarget) throw cnameError(name, result.cnameTarget, host);
    if (attempt >= READ_BACK_ATTEMPTS || abortSignal?.aborted) break;
    // eslint-disable-next-line no-await-in-loop
    await delay(READ_BACK_INTERVAL_MS);
  }

  throw new Error(
    `DNS server '${host}' accepted the TXT record for '${name}' but does not serve it. Check that '${host}' is the zone's primary server and that the key's update policy allows TXT records at this name.`
  );
};

type TNameserverAnswer = "has-value" | "missing" | "no-answer";

const askNameserver = async (ip: string, name: string, value: string): Promise<TNameserverAnswer> => {
  const resolver = new dns.promises.Resolver({ timeout: NAMESERVER_QUERY_TIMEOUT_MS, tries: 1 });
  resolver.setServers([ip]);
  try {
    const records = await resolver.resolveTxt(name);
    return records.some((chunks) => chunks.join("") === value) ? "has-value" : "missing";
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    return code === dns.NODATA || code === dns.NOTFOUND ? "missing" : "no-answer";
  }
};

const firstPublicIp = async (resolve: (hostname: string) => Promise<string[]>, hostname: string) =>
  (await resolve(hostname).catch(() => [] as string[])).find((ip) => !isPrivateIp(ip));

// One public address per nameserver, IPv4 first, and no address asked twice
const getPublicNameservers = async (zone: string) => {
  const names = [...new Set((await dns.promises.resolveNs(zone)).map((nsName) => nsName.toLowerCase()))].slice(
    0,
    MAX_NAMESERVERS
  );
  const resolved = await Promise.all(
    names.map(async (nsName) => ({
      name: nsName,
      ip:
        (await firstPublicIp((hostname) => dns.promises.resolve4(hostname), nsName)) ??
        (await firstPublicIp((hostname) => dns.promises.resolve6(hostname), nsName))
    }))
  );

  const seen = new Set<string>();
  return resolved.filter((nameserver): nameserver is { name: string; ip: string } => {
    if (!nameserver.ip || seen.has(nameserver.ip)) return false;
    seen.add(nameserver.ip);
    return true;
  });
};

// The CA can ask any of the zone's public nameservers, and with a hidden primary those are secondaries that copy the
// record a moment later, so the order waits until each one that answers serves it (as lego and cert-manager do).
// Servers Infisical cannot reach, private addresses and failed lookups are skipped: the CA may still reach them, and
// a self-hosted instance inside a split-horizon network sees the internal view, so there it only logs.
export const waitForPublicNameservers = async (
  zone: string,
  name: string,
  value: string,
  abortSignal?: AbortSignal
) => {
  let nameservers: Awaited<ReturnType<typeof getPublicNameservers>>;
  try {
    nameservers = await getPublicNameservers(zone);
  } catch (error) {
    logger.info(error, `Skipping RFC 2136 public nameserver check, NS lookup failed [zone=${zone}]`);
    return;
  }

  const pending = new Map(nameservers.map((nameserver) => [nameserver.name, nameserver.ip]));
  // a server that answered once stays pending through a later timeout, since one lost packet proves nothing
  const answered = new Set<string>();
  const deadline = Date.now() + NAMESERVER_WAIT_MS;

  while (pending.size > 0 && !abortSignal?.aborted) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      [...pending].map(async ([nsName, ip]) => {
        const answer = await askNameserver(ip, name, value);
        if (answer === "has-value") {
          pending.delete(nsName);
        } else if (answer === "missing") {
          answered.add(nsName);
        } else if (!answered.has(nsName)) {
          pending.delete(nsName);
          logger.info(`Skipping RFC 2136 nameserver that did not answer [zone=${zone}] [nameserver=${nsName}]`);
        }
      })
    );
    if (pending.size === 0 || Date.now() + NAMESERVER_POLL_INTERVAL_MS > deadline) break;
    // eslint-disable-next-line no-await-in-loop
    await delay(NAMESERVER_POLL_INTERVAL_MS);
  }

  if (pending.size === 0 || abortSignal?.aborted) return;

  const laggingList = [...pending.keys()].join("', '");
  if (!getConfig().isCloud) {
    logger.warn(
      `RFC 2136 nameservers still do not serve the challenge record, continuing [zone=${zone}] [name=${name}] [nameservers=${laggingList}]`
    );
    return;
  }
  const [subject, verb, object] =
    pending.size === 1 ? ["Nameserver", "doesn't", "it receives"] : ["Nameservers", "don't", "they receive"];
  throw new Error(
    `${subject} '${laggingList}' still ${verb} serve the challenge record '${name}' after ${NAMESERVER_WAIT_MS / 1000} seconds. Check that ${object} updates from your primary server (NOTIFY and zone transfers).`
  );
};

const toOrderError = (error: unknown, action: string, name: string, tsigSecret: string) =>
  error instanceof DnsUpdateError
    ? new Error(
        `Failed to ${action} the TXT record '${name}' on the DNS server: ${getRfc2136ErrorMessage(error, tsigSecret)}`
      )
    : error;

export const rfc2136InsertTxtRecord = async (
  connection: TRfc2136Connection,
  hostedZoneId: string,
  domain: string,
  value: string,
  { abortSignal, ...gatewayDeps }: TRfc2136ProviderDeps
) => {
  const name = normalizeDnsName(domain);
  const txtValue = value.replace(SURROUNDING_QUOTES_REGEX, "");
  const { host } = connection.credentials;

  logger.info(`Inserting TXT record via RFC 2136 [host=${host}] [name=${name}]`);

  const zone = await executeWithRfc2136Client(
    connection,
    gatewayDeps,
    async (client) => {
      let resolvedZone: string;
      try {
        resolvedZone = await resolveZone(client, hostedZoneId, name, host);
        await client.updateTxtRecord({
          zone: resolvedZone,
          name,
          value: txtValue,
          ttl: ACME_CHALLENGE_TTL_SECONDS,
          action: "add"
        });
      } catch (error) {
        throw toOrderError(error, "add", name, connection.credentials.tsigSecret);
      }
      await confirmTxtRecord(client, name, txtValue, host, abortSignal);
      return resolvedZone;
    },
    abortSignal
  );

  await waitForPublicNameservers(zone, name, txtValue, abortSignal);
};

// Takes no abort signal: cleanup has to run even when the order was cancelled.
export const rfc2136DeleteTxtRecord = async (
  connection: TRfc2136Connection,
  hostedZoneId: string,
  domain: string,
  value: string,
  gatewayDeps: TRfc2136GatewayDeps
) => {
  const name = normalizeDnsName(domain);
  const txtValue = value.replace(SURROUNDING_QUOTES_REGEX, "");
  const { host } = connection.credentials;

  logger.info(`Deleting TXT record via RFC 2136 [host=${host}] [name=${name}]`);

  await executeWithRfc2136Client(connection, gatewayDeps, async (client) => {
    try {
      const zone = await resolveZone(client, hostedZoneId, name, host);
      await client.updateTxtRecord({ zone, name, value: txtValue, ttl: 0, action: "delete" });
    } catch (error) {
      throw toOrderError(error, "delete", name, connection.credentials.tsigSecret);
    }
  });
};
