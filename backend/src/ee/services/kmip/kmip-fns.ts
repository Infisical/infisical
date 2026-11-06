import { z } from "zod";

import { isValidIp } from "@app/lib/ip";
import { isFQDN } from "@app/lib/validator/validate-url";

export const KMIP_SERVER_HOSTNAMES_OR_IPS_MESSAGE =
  "Each hostname or IP must be a hostname (such as kmip.example.com or localhost) or an IP address";

export const getKmipServerAltNameType = (altName: string): "dns" | "ip" | null => {
  if (isValidIp(altName)) return "ip";
  if (isFQDN(altName, { allow_wildcard: true, require_tld: false })) return "dns";
  return null;
};

// Saving and certificate issue share this rule, so a server Infisical accepts is one it can issue a certificate for.
export const kmipServerHostnamesOrIpsField = z
  .string()
  .trim()
  .default("")
  .transform((data) => {
    if (data === "") return "";
    return data
      .split(",")
      .map((name) => name.trim())
      .join(", ");
  })
  .refine(
    (data) => data === "" || data.split(", ").every((name) => getKmipServerAltNameType(name) !== null),
    KMIP_SERVER_HOSTNAMES_OR_IPS_MESSAGE
  )
  // The list is stored, as resolved, in varchar(4096) columns on the server and its certificates.
  .refine((data) => data.length <= 4096, "Hostnames or IPs must be at most 4096 characters");
