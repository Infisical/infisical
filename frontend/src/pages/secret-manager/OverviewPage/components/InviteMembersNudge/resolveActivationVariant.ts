import type { PostHog } from "posthog-js";

export const ACTIVATION_PRESENTATION_FLAG = "secrets-activation-presentation";
export type ActivationVariant = "control" | "card" | null;

export const resolveActivationVariant = (
  posthog: Pick<PostHog, "getFeatureFlag" | "onFeatureFlags"> | undefined,
  onResolved: (variant: ActivationVariant) => void
) => {
  let settled = false;
  let unsubscribe: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const finish = (value: unknown) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    unsubscribe?.();
    onResolved(value === "control" || value === "card" ? value : null);
  };

  if (!posthog) {
    finish(null);
  } else {
    timeout = setTimeout(() => finish(null), 3000);
    try {
      unsubscribe = posthog.onFeatureFlags((_flags, _variants, context) => {
        try {
          finish(
            context?.errorsLoading
              ? null
              : posthog.getFeatureFlag(ACTIVATION_PRESENTATION_FLAG, {
                  send_event: false,
                  fresh: true
                })
          );
        } catch {
          finish(null);
        }
      });
      if (settled) unsubscribe();
    } catch {
      finish(null);
    }
  }

  return () => {
    settled = true;
    clearTimeout(timeout);
    unsubscribe?.();
  };
};
