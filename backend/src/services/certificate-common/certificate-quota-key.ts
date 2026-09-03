import { createHash } from "node:crypto";

// Identity of "one logical certificate" for quotas. orderId already collapses renewal chains; this
// exists for re-enrollment, where ACME mints a new order for the same names every cycle.
export const buildCertificateQuotaKey = ({
  commonName,
  altNames
}: {
  commonName?: string | null;
  altNames?: string | null;
}): string => {
  const sans = (altNames ?? "")
    .split(",")
    .map((san) => san.trim().toLowerCase())
    .filter(Boolean);
  const cn = (commonName ?? "").trim().toLowerCase();
  const canonical = `CN=${cn}|SAN=${[...new Set(sans)].sort().join(",")}`;

  return createHash("sha256").update(canonical).digest("hex");
};
