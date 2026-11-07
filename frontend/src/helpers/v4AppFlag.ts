import { getPostHog, isPostHogEnabled } from "@app/components/analytics/posthog";
import { resolveFeatureFlagVariant } from "@app/lib/analytics/experiments/resolveFeatureFlagVariant";

export const V4_APP_FLAG = "v4-app";

const PREVIEW_HOST = /^pr-\d+\.preview\.infisical\.com$/;

const readLocalOverride = () => {
  try {
    const value = window.localStorage.getItem(V4_APP_FLAG);
    return value === "on" || value === "off" ? value : undefined;
  } catch {
    return undefined;
  }
};

export const isPreviewDeploy = () => PREVIEW_HOST.test(window.location.hostname);

// Preview deploys default the flag on so a PR can be reviewed in v4; "off" in localStorage still wins.
export const isV4AppEnabled = () =>
  new Promise<boolean>((resolve) => {
    const override = readLocalOverride();
    if (isPreviewDeploy()) {
      resolve(override !== "off");
      return;
    }
    if (override === "on" && !isPostHogEnabled()) {
      resolve(true);
      return;
    }
    resolveFeatureFlagVariant({
      client: getPostHog(),
      fallback: false,
      featureFlag: V4_APP_FLAG,
      onResolved: resolve,
      resolve: (value) => value === true,
      sendExposureEvent: false,
      timeoutMs: 3000
    });
  });
