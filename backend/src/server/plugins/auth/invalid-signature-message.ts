import type { TEnvConfig } from "@app/lib/config/env";

const CLOUD_REGIONS = {
  us: { name: "US Cloud", url: "https://app.infisical.com" },
  eu: { name: "EU Cloud", url: "https://eu.infisical.com" }
} as const;

// jsonwebtoken reports a token signed with another key as a bare "invalid signature". On a Bearer token that
// almost always means it was issued by another instance, most often the other Infisical Cloud region, and the
// bare message gives no hint of that. Self-hosted and dedicated instances get no region advice, since it would
// send their users somewhere their tokens never came from.
export const invalidSignatureMessage = (cfg: Pick<TEnvConfig, "INFISICAL_CLOUD" | "INTERNAL_REGION">) => {
  const base = "The access token was not issued by this Infisical instance";

  if (!cfg.INFISICAL_CLOUD) {
    return `${base}. Make sure you are sending it to the instance that issued it.`;
  }

  if (cfg.INTERNAL_REGION) {
    const here = CLOUD_REGIONS[cfg.INTERNAL_REGION];
    const other = CLOUD_REGIONS[cfg.INTERNAL_REGION === "us" ? "eu" : "us"];
    return `${base} (${here.name}, ${here.url}). If your organization is on ${other.name}, send it to ${other.url}.`;
  }

  return `${base}. Make sure you are sending it to the Infisical Cloud region that issued it (US: ${CLOUD_REGIONS.us.url}, EU: ${CLOUD_REGIONS.eu.url}).`;
};
