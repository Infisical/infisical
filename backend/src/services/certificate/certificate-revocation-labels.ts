const CRL_REASON_LABELS: Record<number, string> = {
  0: "Unspecified",
  1: "Key Compromise",
  2: "CA Compromise",
  3: "Affiliation Changed",
  4: "Superseded",
  5: "Cessation of Operation",
  6: "Certificate Hold",
  8: "Remove from CRL",
  9: "Privilege Withdrawn",
  10: "AA Compromise"
};

export const getRevocationReasonLabel = (code?: number | null): string | undefined => {
  if (code == null) return undefined;
  return CRL_REASON_LABELS[code] ?? `Unknown (${code})`;
};
