import type { TEnvConfig } from "@app/lib/config/env";

const CLOUD_REGIONS = {
  us: { name: "US Cloud", url: "https://app.infisical.com" },
  eu: { name: "EU Cloud", url: "https://eu.infisical.com" }
} as const;

// jsonwebtoken reports a token signed with another key as a bare "invalid signature". On a Bearer token that
// is most often a token from another instance, usually the other Infisical Cloud region, and the bare message
// gives no hint of that. It can also be a token signed before this instance's secret changed, or an edited one,
// so the message says "may". Self-hosted and dedicated instances get no region advice, since it would send their
// users somewhere their tokens never came from.
export const invalidSignatureMessage = (cfg: Pick<TEnvConfig, "INFISICAL_CLOUD" | "INTERNAL_REGION">) => {
  const base =
    "The access token's signature could not be verified. It may have been issued by a different Infisical instance";

  if (!cfg.INFISICAL_CLOUD) {
    return `${base}.`;
  }

  if (cfg.INTERNAL_REGION) {
    const here = CLOUD_REGIONS[cfg.INTERNAL_REGION];
    const other = CLOUD_REGIONS[cfg.INTERNAL_REGION === "us" ? "eu" : "us"];
    return `${base}: this is ${here.name} (${here.url}); if your organization is on ${other.name}, use ${other.url}.`;
  }

  return `${base}: if your organization is on Infisical Cloud, use the region that issued it (US: ${CLOUD_REGIONS.us.url}, EU: ${CLOUD_REGIONS.eu.url}).`;
};
