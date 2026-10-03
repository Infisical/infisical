import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

export const SSH_SERVER_HOST_KEY_ALGORITHMS = [
  "rsa-sha2-512",
  "rsa-sha2-256",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp521"
] as const;

export type TSshServerHostKeyAlgorithm = (typeof SSH_SERVER_HOST_KEY_ALGORITHMS)[number];

const NEGOTIABLE_KEY_TYPES = new Set(["ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp521"]);

const WHITESPACE = new RE2("\\s+");
const BASE64 = new RE2("^[A-Za-z0-9+/]+={0,2}$");

export type TKnownHostKey = { keyType: string; key: Buffer };

export const KNOWN_HOST_KEY_EXAMPLE = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB...";

export const parseKnownHostKeys = (value: string): TKnownHostKey[] => {
  const keys: TKnownHostKey[] = [];

  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .forEach((line) => {
      const parts = line.split(WHITESPACE).filter((part) => part.length > 0);
      const typeIndex = parts.findIndex((part) => part.startsWith("ssh-") || part.startsWith("ecdsa-"));

      if (typeIndex === -1 || !parts[typeIndex + 1]) {
        throw new BadRequestError({
          message: `'${line.slice(0, 60)}' is not an SSH host key. Paste the output of 'ssh-keyscan <host>', for example '${KNOWN_HOST_KEY_EXAMPLE}'.`
        });
      }

      const keyType = parts[typeIndex];
      const encoded = parts[typeIndex + 1];

      if (!BASE64.test(encoded)) {
        throw new BadRequestError({
          message: `The ${keyType} host key is not valid base64. Paste the output of 'ssh-keyscan <host>' without editing it.`
        });
      }

      keys.push({ keyType, key: Buffer.from(encoded, "base64") });
    });

  if (!keys.length) {
    throw new BadRequestError({
      message: `No SSH host key found. Paste the output of 'ssh-keyscan <host>', for example '${KNOWN_HOST_KEY_EXAMPLE}'.`
    });
  }

  return keys;
};

export const assertKnownHostKeysAreNegotiable = (keys: TKnownHostKey[]) => {
  if (keys.some(({ keyType }) => NEGOTIABLE_KEY_TYPES.has(keyType))) return;

  const listed = [...new Set(keys.map(({ keyType }) => keyType))].join(", ");
  throw new BadRequestError({
    message: `The host keys provided are ${listed}, and this sync negotiates ${[...NEGOTIABLE_KEY_TYPES].join(", ")}. Paste the full output of 'ssh-keyscan <host>' so a key this sync can negotiate is included.`
  });
};

export const isKnownHostKeysValid = (value: string): boolean => {
  try {
    assertKnownHostKeysAreNegotiable(parseKnownHostKeys(value));
    return true;
  } catch {
    return false;
  }
};

export const presentedKeyMatchesKnownHosts = (presented: Buffer, expected: string): boolean =>
  parseKnownHostKeys(expected).some(({ key }) => key.equals(presented));

export const negotiableAlgorithmsForKnownHosts = (expected: string): TSshServerHostKeyAlgorithm[] => {
  const trusted = new Set(parseKnownHostKeys(expected).map(({ keyType }) => keyType));
  return SSH_SERVER_HOST_KEY_ALGORITHMS.filter((algorithm) =>
    algorithm.startsWith("rsa-sha2-") || algorithm === "ssh-rsa" ? trusted.has("ssh-rsa") : trusted.has(algorithm)
  );
};

export const describeKeyType = (presented: Buffer): string => {
  const nameLength = presented.readUInt32BE(0);
  return nameLength > 0 && nameLength < 64 ? presented.subarray(4, 4 + nameLength).toString("ascii") : "unknown";
};
