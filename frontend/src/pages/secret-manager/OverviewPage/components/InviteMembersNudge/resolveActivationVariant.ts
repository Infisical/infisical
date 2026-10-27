import type { PostHog } from "posthog-js";

import { resolveFeatureFlagVariant } from "@app/lib/analytics/experiments/resolveFeatureFlagVariant";

export const ACTIVATION_PRESENTATION_FLAG = "secrets-activation-presentation";
export type ActivationVariant = "control" | "card" | null;

export const resolveActivationVariant = (
  posthog: Pick<PostHog, "getFeatureFlag" | "onFeatureFlags"> | undefined,
  onResolved: (variant: ActivationVariant) => void
) => {
  return resolveFeatureFlagVariant({
    client: posthog,
    fallback: null,
    featureFlag: ACTIVATION_PRESENTATION_FLAG,
    onResolved,
    resolve: (value) => (value === "control" || value === "card" ? value : null),
    sendExposureEvent: false,
    timeoutMs: 3000
  });
};
