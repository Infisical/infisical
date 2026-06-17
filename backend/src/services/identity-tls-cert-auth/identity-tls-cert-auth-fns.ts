export const parseSubjectDetails = (data: string) => {
  const values: Record<string, string> = {};
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

// SAN types whose values are case-insensitive per RFC 5280 (DNS names and the
// domain part of email addresses). For these we normalize to lower case so an
// allow-list entry of "svc.example.com" matches a certificate "DNS:SVC.EXAMPLE.COM".
const CASE_INSENSITIVE_SAN_TYPES = new Set(["dns", "email"]);

const normalizeSanType = (rawType: string): string => {
  const type = rawType.trim().toLowerCase();
  // Node renders the IP SAN type as "IP Address"; collapse it to a stable token.
  if (type === "ip address" || type === "ip") return "ip";
  if (type === "rfc822name") return "email";
  return type;
};

const normalizeSanValue = (type: string, value: string): string => {
  const trimmed = value.trim();
  return CASE_INSENSITIVE_SAN_TYPES.has(type) ? trimmed.toLowerCase() : trimmed;
};

// Builds a canonical "type:value" token (e.g. "uri:spiffe://example.org/svc")
// used for type-aware, collision-safe comparison.
const toCanonicalSan = (type: string, value: string): string => {
  const normalizedType = normalizeSanType(type);
  return `${normalizedType}:${normalizeSanValue(normalizedType, value)}`;
};

// Node's X509Certificate.subjectAltName returns a comma-separated string where
// each entry is prefixed by its SAN type, e.g.
//   "DNS:svc.example.com, URI:spiffe://example.org/svc, IP Address:10.0.0.1"
// We return canonical "type:value" tokens so comparison is type-aware: a
// "uri:spiffe://example.org/svc" allow-list entry can never be satisfied by a
// "dns:spiffe://example.org/svc" SAN of a different type.
export const parseCertificateSubjectAltNames = (subjectAltName?: string): string[] => {
  if (!subjectAltName) return [];
  return subjectAltName
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<string[]>((acc, entry) => {
      const separatorIdx = entry.indexOf(":");
      // No type prefix — cannot classify, so skip rather than risk a cross-type match.
      if (separatorIdx === -1) return acc;
      const type = entry.slice(0, separatorIdx);
      const value = entry.slice(separatorIdx + 1);
      if (value.trim()) acc.push(toCanonicalSan(type, value));
      return acc;
    }, []);
};

// Normalizes an admin-configured allow-list entry to the same canonical
// "type:value" token. Entries may be supplied either type-prefixed
// ("URI:spiffe://example.org/svc") or, for DNS names, bare ("svc.example.com"),
// in which case we default the type to DNS.
export const normalizeAllowedSubjectAltName = (allowedSan: string): string | null => {
  const trimmed = allowedSan.trim();
  if (!trimmed) return null;
  const separatorIdx = trimmed.indexOf(":");
  if (separatorIdx === -1) {
    // Bare value with no type prefix — treat as a DNS name (the common case).
    return toCanonicalSan("dns", trimmed);
  }
  const type = trimmed.slice(0, separatorIdx);
  const value = trimmed.slice(separatorIdx + 1);
  return toCanonicalSan(type, value);
};

// Returns true when at least one of the certificate's SANs satisfies the
// comma-separated allow-list, using type-aware, case-correct comparison.
export const isSubjectAltNameAllowed = (allowedSubjectAltNames: string, certificateSubjectAltName?: string): boolean => {
  const certificateSans = new Set(parseCertificateSubjectAltNames(certificateSubjectAltName));
  return allowedSubjectAltNames
    .split(",")
    .map(normalizeAllowedSubjectAltName)
    .filter((san): san is string => san !== null)
    .some((allowedSan) => certificateSans.has(allowedSan));
};
