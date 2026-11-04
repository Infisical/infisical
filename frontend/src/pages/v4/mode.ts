import { getPostHog } from "@app/components/analytics/posthog";
import { resolveFeatureFlagVariant } from "@app/lib/analytics/experiments/resolveFeatureFlagVariant";

export const V4_DEMO_ORG_ID = "demo";
export const V4_APP_FLAG = "v4-app";

export type V4Mode = "demo" | "live";

export const isV4AppEnabled = () =>
  new Promise<boolean>((resolve) => {
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
