export const parseSubjectDetails = (data: string) => {
  const values: Record<string, string> = {};
  data.split("\n").forEach((el) => {
    const [key, value] = el.split("=");
    if (key && value) {
      values[key.trim()] = value.trim();
    }
  });
  return values;
};

// Node's X509Certificate.subjectAltName returns a comma-separated string where
// each entry is prefixed by its SAN type, e.g.
//   "DNS:svc.example.com, URI:spiffe://example.org/svc, IP Address:10.0.0.1"
// In SPIFFE X.509-SVID setups the identity lives in the URI SAN (the SPIFFE ID)
// and the Subject is empty, so CN matching alone cannot authorize the workload.
export const parseSubjectAltNames = (subjectAltName?: string): string[] => {
  if (!subjectAltName) return [];
  return subjectAltName
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separatorIdx = entry.indexOf(":");
      if (separatorIdx === -1) return [entry];
      const value = entry.slice(separatorIdx + 1).trim();
      // Expose both the raw value and the type-prefixed form so admins can
      // configure either "spiffe://example.org/svc" or "URI:spiffe://example.org/svc".
      return value ? [value, entry] : [entry];
    });
};
