import type { PostHog } from "posthog-js";

type FeatureFlagClient = Pick<PostHog, "getFeatureFlag" | "onFeatureFlags">;

type ResolveFeatureFlagVariantOptions<T> = {
  client: FeatureFlagClient | undefined;
  fallback: T;
  featureFlag: string;
  onResolved: (variant: T) => void;
  resolve: (value: unknown) => T;
  sendExposureEvent?: boolean;
  timeoutMs: number;
};

export const resolveFeatureFlagVariant = <T>({
  client,
  fallback,
  featureFlag,
  onResolved,
  resolve,
  sendExposureEvent = true,
  timeoutMs
}: ResolveFeatureFlagVariantOptions<T>) => {
  let isSettled = false;
  let unsubscribe: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const settle = (variant: T) => {
    if (isSettled) return;
    isSettled = true;
    clearTimeout(timeout);
    unsubscribe?.();
    onResolved(variant);
  };

  if (!client) {
    settle(fallback);
  } else {
    timeout = setTimeout(() => settle(fallback), timeoutMs);
    try {
      unsubscribe = client.onFeatureFlags((_flags, _variants, context) => {
        if (isSettled) return;

        try {
          settle(
            context?.errorsLoading
              ? fallback
              : resolve(
                  client.getFeatureFlag(featureFlag, {
                    send_event: sendExposureEvent,
                    fresh: true
                  })
                )
          );
        } catch {
          settle(fallback);
        }
      });
      if (isSettled) unsubscribe();
    } catch {
      settle(fallback);
    }
  }

  return () => {
    isSettled = true;
    clearTimeout(timeout);
    unsubscribe?.();
  };
};
