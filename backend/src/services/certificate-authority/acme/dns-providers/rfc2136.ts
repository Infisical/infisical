import RE2 from "re2";

import {
  DnsUpdateError,
  isDnsNameInZone,
  isValidDnsName,
  normalizeDnsName,
  TDnsUpdateClient
} from "@app/lib/dns-update";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  executeWithRfc2136Client,
  getRfc2136ErrorMessage,
  TRfc2136Connection,
  TRfc2136GatewayDeps
} from "@app/services/app-connection/rfc2136";

const ACME_CHALLENGE_TTL_SECONDS = 60;
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
// confirmed by reading it back. Only a verified answer without the value fails the order; a read-back the server
// refuses or that times out is logged and the order goes on.
const confirmTxtRecord = async (client: TDnsUpdateClient, name: string, value: string, host: string) => {
  let result: Awaited<ReturnType<TDnsUpdateClient["queryTxtRecord"]>>;
  try {
    result = await client.queryTxtRecord(name);
  } catch (error) {
    logger.warn(error, `Could not read back RFC 2136 TXT record, continuing [host=${host}] [name=${name}]`);
    return;
  }

  if (result.values.includes(value)) return;

  if (result.cnameTarget) throw cnameError(name, result.cnameTarget, host);
  throw new Error(
    `DNS server '${host}' accepted the TXT record for '${name}' but does not serve it. Check that '${host}' is the zone's primary server and that the key's update policy allows TXT records at this name.`
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

  await executeWithRfc2136Client(
    connection,
    gatewayDeps,
    async (client) => {
      try {
        const zone = await resolveZone(client, hostedZoneId, name, host);
        await client.updateTxtRecord({ zone, name, value: txtValue, ttl: ACME_CHALLENGE_TTL_SECONDS, action: "add" });
      } catch (error) {
        throw toOrderError(error, "add", name, connection.credentials.tsigSecret);
      }
      await confirmTxtRecord(client, name, txtValue, host);
    },
    abortSignal
  );
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
