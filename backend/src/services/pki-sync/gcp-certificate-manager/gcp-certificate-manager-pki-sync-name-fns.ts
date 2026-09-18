import crypto from "node:crypto";

import RE2 from "re2";

import { PkiSyncError } from "../pki-sync-errors";
import {
  GCP_CERTIFICATE_MANAGER_NAMING,
  GCP_NAME_HASH_LENGTH,
  GCP_NAME_LEADING_LETTER_PATTERN
} from "./gcp-certificate-manager-pki-sync-constants";

const DISALLOWED_CHARS = new RE2("[^a-z0-9-]", "g");
const REPEATED_HYPHENS = new RE2("-{2,}", "g");
const SURROUNDING_HYPHENS = new RE2("^-+|-+$", "g");

const keepPrefixAndAppendHash = (cleaned: string): string => {
  const { MAX_NAME_LENGTH } = GCP_CERTIFICATE_MANAGER_NAMING;
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;

  const wholeNameDigest = crypto.createHash("sha256").update(cleaned).digest("hex").slice(0, GCP_NAME_HASH_LENGTH);
  const keptPrefix = cleaned.slice(0, MAX_NAME_LENGTH - GCP_NAME_HASH_LENGTH - 1).replace(SURROUNDING_HYPHENS, "");

  return `${keptPrefix}-${wholeNameDigest}`;
};

export const toGcpCertificateId = (name: string): string => {
  const cleaned = name
    .toLowerCase()
    .replace(DISALLOWED_CHARS, "-")
    .replace(REPEATED_HYPHENS, "-")
    .replace(SURROUNDING_HYPHENS, "");

  const normalized = keepPrefixAndAppendHash(cleaned).replace(SURROUNDING_HYPHENS, "");

  if (!normalized) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Certificate name "${name}" cannot be converted into a GCP Certificate Manager resource ID. Use a certificate name schema that produces lowercase letters, digits or hyphens.`
    });
  }

  if (!GCP_NAME_LEADING_LETTER_PATTERN.test(normalized)) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Certificate name "${name}" resolves to the GCP resource ID "${normalized}", which starts with "${normalized[0]}". GCP Certificate Manager requires an ID to start with a letter, so begin the certificate name schema with a letter instead of a placeholder.`
    });
  }

  return normalized;
};

export const buildGcpCertificateResourceName = ({
  gcpProjectId,
  location,
  certificateId
}: {
  gcpProjectId: string;
  location: string;
  certificateId: string;
}) => `projects/${gcpProjectId}/locations/${location}/certificates/${certificateId}`;

export const toGcpCertificateMapEntryId = (pkiSyncId: string) => toGcpCertificateId(`infisical-${pkiSyncId}`);
