export const parseSubjectDetails = (data?: string | null) => {
  const values: Record<string, string> = {};
  if (!data) return values;
  data.split("\n").forEach((el) => {
    const eqIdx = el.indexOf("=");
    if (eqIdx === -1) return;
    const key = el.slice(0, eqIdx).trim();
    // Slice on the first "=" only so values that themselves contain "=" are preserved.
    const value = el.slice(eqIdx + 1).trim();
    if (key && value) {
      values[key] = value;
    }
  });
  return values;
};

type CanonicalSanType = "dns" | "ip" | "email" | "uri";

export type TCertificateSanItem = { type: string; value: string };

const peculiarTypeToCanonical = (type: string): CanonicalSanType | null => {
  switch (type.trim().toLowerCase()) {
    case "dns":
      return "dns";
    case "ip":
      return "ip";
    case "email":
      return "email";
    // peculiar represents URI SANs (e.g. SPIFFE IDs) under the "url" type.
    case "url":
      return "uri";
    default:
      return null;
  }
};

const allowedPrefixToCanonical = (prefix: string): CanonicalSanType | null => {
  switch (prefix.trim().toLowerCase()) {
    case "dns":
      return "dns";
    case "ip":
      return "ip";
    case "email":
      return "email";
    case "uri":
    case "url":
      return "uri";
    default:
      return null;
  }
};

const normalizeSanValue = (type: CanonicalSanType, value: string): string => {
  const trimmed = value.normalize("NFC").trim();
  // DNS names are case-insensitive (RFC 5280).
  if (type === "dns") return trimmed.toLowerCase();
  // For email, only the domain part is case-insensitive (RFC 5321). Lowercasing the
  // local-part would weaken the allow-list (it would accept addresses differing only in
  // local-part casing), so preserve it and lowercase the domain only.
  if (type === "email") {
    const atIdx = trimmed.lastIndexOf("@");
    if (atIdx === -1) return trimmed;
    return `${trimmed.slice(0, atIdx)}@${trimmed.slice(atIdx + 1).toLowerCase()}`;
  }
  // URI and IP values are matched exactly.
  return trimmed;
};

const toCanonicalSan = (type: CanonicalSanType, value: string): string => `${type}:${normalizeSanValue(type, value)}`;

export const parseCertificateSubjectAltNames = (sanItems?: ReadonlyArray<TCertificateSanItem>): string[] => {
  if (!sanItems) return [];
  const tokens: string[] = [];
  for (const item of sanItems) {
    const type = peculiarTypeToCanonical(item.type);
    if (type && item.value.trim()) tokens.push(toCanonicalSan(type, item.value));
  }
  return tokens;
};

export const normalizeAllowedSubjectAltName = (allowedSan: string): string | null => {
  const trimmed = allowedSan.trim();
  if (!trimmed) return null;

  const separatorIdx = trimmed.indexOf(":");
  if (separatorIdx !== -1) {
    const type = allowedPrefixToCanonical(trimmed.slice(0, separatorIdx));
    if (type) {
      return toCanonicalSan(type, trimmed.slice(separatorIdx + 1));
    }
  }

  return toCanonicalSan("dns", trimmed);
};

export const isValidAllowedSubjectAltNameEntry = (entry: string): boolean => {
  const trimmed = entry.trim();
  if (!trimmed) return false;

  const separatorIdx = trimmed.indexOf(":");
  if (separatorIdx === -1) return true; // bare DNS name

  // Has a colon: the text before the first colon must be a recognized type prefix.
  return allowedPrefixToCanonical(trimmed.slice(0, separatorIdx)) !== null;
};

export const isSubjectAltNameAllowed = (
  allowedSubjectAltNames: ReadonlyArray<string>,
  certificateSanItems?: ReadonlyArray<TCertificateSanItem>
): boolean => {
  const certificateSans = new Set(parseCertificateSubjectAltNames(certificateSanItems));
  if (certificateSans.size === 0) return false;

  return allowedSubjectAltNames
    .map(normalizeAllowedSubjectAltName)
    .filter((san): san is string => san !== null)
    .some((allowedSan) => certificateSans.has(allowedSan));
};

export const serializeAllowedSubjectAltNames = (entries?: ReadonlyArray<string> | null): string | null | undefined => {
  if (entries === undefined) return undefined;
  if (entries === null || entries.length === 0) return null;
  return JSON.stringify(entries);
};

export const parseAllowedSubjectAltNames = (stored?: string | null): string[] => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string");
    return [];
  } catch {
    return [];
  }
};
