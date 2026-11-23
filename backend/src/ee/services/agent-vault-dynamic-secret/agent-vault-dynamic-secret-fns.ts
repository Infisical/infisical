import { BadRequestError } from "@app/lib/errors";

import { parseClientCertificate } from "../agent-vault/agent-vault-credential-schemas";

export const CLIENT_CERTIFICATE_LEASE_KEY = "CLIENT_CERTIFICATE";
export const PRIVATE_KEY_LEASE_KEY = "PRIVATE_KEY";
export const CLIENT_CERTIFICATE_LEASE_FIELDS = [CLIENT_CERTIFICATE_LEASE_KEY, PRIVATE_KEY_LEASE_KEY];

const MIN_REMAINING_MS = 5 * 60 * 1000;
const MIN_REMAINING_SHARE = 0.2;
const MAX_REMAINING_SHARE = 0.5;
const POLL_SLACK_MS = 60 * 1000;
export const MIN_FALLBACK_REMAINING_MS = 60 * 1000;
export const MIN_DYNAMIC_SECRET_TTL_MS = 10 * 60 * 1000;

export const isLeaseFresh = (
  { issuedAt, expiresAt, pollIntervalSeconds }: { issuedAt: Date; expiresAt: Date; pollIntervalSeconds: number },
  now = new Date()
) => {
  const lifetime = expiresAt.getTime() - issuedAt.getTime();
  const pollFloor = pollIntervalSeconds * 1000 + POLL_SLACK_MS;
  const wanted = Math.max(MIN_REMAINING_MS, lifetime * MIN_REMAINING_SHARE, pollFloor);
  const margin = Math.max(Math.min(wanted, lifetime * MAX_REMAINING_SHARE), pollFloor);
  return expiresAt.getTime() - now.getTime() > margin;
};

export type TLeasedClientCertificate = { certificate: string; privateKey: string; notAfter: Date };

export const clientCertificateFromLeaseData = (
  data: unknown
): { certificate: TLeasedClientCertificate } | { problem: string } => {
  const fields = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const certificate = fields[CLIENT_CERTIFICATE_LEASE_KEY];
  const privateKey = fields[PRIVATE_KEY_LEASE_KEY];
  if (typeof certificate !== "string" || typeof privateKey !== "string") {
    return {
      problem: `The dynamic secret's lease has no ${CLIENT_CERTIFICATE_LEASE_KEY} and ${PRIVATE_KEY_LEASE_KEY}, so it doesn't issue client certificates.`
    };
  }
  try {
    const parsed = parseClientCertificate({ certificate, privateKey });
    return {
      certificate: {
        certificate: parsed.certificate,
        privateKey: parsed.privateKey,
        notAfter: new Date(parsed.notAfter)
      }
    };
  } catch (error) {
    return {
      problem: `The dynamic secret issued a client certificate that can't be used: ${error instanceof BadRequestError ? error.message : "it couldn't be read"}`
    };
  }
};
