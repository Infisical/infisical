import ldap from "@infisical/ldapjs";
import RE2 from "re2";

import { sidStringToBuffer } from "@app/lib/windows-sid/windows-sid-fns";

const LDAP_TIME_LIMIT_EXCEEDED = 3;
const LDAP_SIZE_LIMIT_EXCEEDED = 4;
const LDAP_CLIENT_TIMEOUT_ERROR_NAME = "TimeoutError";

type TLdapAttribute = { type: string; values: string[]; buffers: Buffer[] };

export const getLdapAttribute = (entry: ldap.SearchEntry, name: string): string =>
  (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (attribute) => attribute.type.toLowerCase() === name.toLowerCase()
  )?.values?.[0] ?? "";

export const getLdapAttributeBuffers = (entry: ldap.SearchEntry, name: string): Buffer[] =>
  (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (attribute) => attribute.type.toLowerCase() === name.toLowerCase()
  )?.buffers ?? [];

export const getLdapAttributeBuffer = (entry: ldap.SearchEntry, name: string): Buffer | undefined =>
  getLdapAttributeBuffers(entry, name)[0];

export const buildDomainBaseDN = (domainFqdn: string): string =>
  domainFqdn
    .split(".")
    .filter(Boolean)
    .map((label) => `DC=${label}`)
    .join(",");

const NUL_CHARACTER = String.fromCharCode(0);
const LDAP_FILTER_SPECIAL_CHARACTERS = new RE2("[\\\\*()\\x00]", "g");
const LDAP_FILTER_ESCAPES: Record<string, string> = {
  "\\": "\\5c",
  "*": "\\2a",
  "(": "\\28",
  ")": "\\29",
  [NUL_CHARACTER]: "\\00"
};

export const escapeLdapFilterValue = (value: string): string =>
  value.replace(LDAP_FILTER_SPECIAL_CHARACTERS, (character) => LDAP_FILTER_ESCAPES[character]);

export const netbiosFromDomainFqdn = (domainFqdn: string): string => domainFqdn.split(".")[0].toUpperCase();

export type TLdapSearchOptions = {
  baseDN: string;
  filter: string | ldap.Filter;
  attributes: string[];
  timeLimitSeconds: number;
  scope?: "base" | "one" | "sub";
  sizeLimit?: number;
  pageSize?: number;
  acceptSizeLimitExceeded?: boolean;
  mapError?: (input: { err?: Error; status?: number }) => Error;
};

export const isLdapSearchTimeout = ({ err, status }: { err?: Error; status?: number }) =>
  status === LDAP_TIME_LIMIT_EXCEEDED ||
  (err as { code?: number } | undefined)?.code === LDAP_TIME_LIMIT_EXCEEDED ||
  err?.name === LDAP_CLIENT_TIMEOUT_ERROR_NAME;

const defaultMapError = ({ err, status }: { err?: Error; status?: number }) =>
  err ?? new Error(`LDAP search failed with status ${status}`);

export const searchLdap = (client: ldap.Client, options: TLdapSearchOptions): Promise<ldap.SearchEntry[]> =>
  new Promise((resolve, reject) => {
    const mapError = options.mapError ?? defaultMapError;
    const entries: ldap.SearchEntry[] = [];

    client.search(
      options.baseDN,
      {
        filter: options.filter,
        scope: options.scope ?? "sub",
        attributes: options.attributes,
        timeLimit: options.timeLimitSeconds,
        ...(options.sizeLimit === undefined ? {} : { sizeLimit: options.sizeLimit }),
        ...(options.pageSize === undefined ? {} : { paged: { pageSize: options.pageSize } })
      },
      (err, res) => {
        if (err) {
          reject(mapError({ err }));
          return;
        }
        res.on("searchEntry", (entry) => entries.push(entry));
        res.on("error", (streamErr: Error & { code?: number }) => {
          if (options.acceptSizeLimitExceeded && streamErr?.code === LDAP_SIZE_LIMIT_EXCEEDED) {
            resolve(entries);
            return;
          }
          reject(mapError({ err: streamErr }));
        });
        res.on("end", (result) => {
          const status = result?.status;
          if (status === 0) resolve(entries);
          else reject(mapError({ status }));
        });
      }
    );
  });

export const buildSidEqualityFilter = (sid: string) =>
  new ldap.EqualityFilter({ attribute: "objectSid", value: sidStringToBuffer(sid) });
