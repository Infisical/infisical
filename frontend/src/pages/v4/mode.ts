import { getPostHog, isPostHogEnabled } from "@app/components/analytics/posthog";
import { resolveFeatureFlagVariant } from "@app/lib/analytics/experiments/resolveFeatureFlagVariant";

export const V4_DEMO_ORG_ID = "demo";
export const V4_APP_FLAG = "v4-app";

export type V4Mode = "demo" | "live";

const hasLocalOverride = () => {
  if (isPostHogEnabled()) return false;
  try {
    return window.localStorage.getItem(V4_APP_FLAG) === "on";
  } catch {
    return false;
  }
};

export const canPreviewV4States = () => !isPostHogEnabled();

export const isV4AppEnabled = () =>
  new Promise<boolean>((resolve) => {
    if (hasLocalOverride()) {
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
