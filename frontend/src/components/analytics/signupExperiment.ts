import { useEffect, useState } from "react";

import { getPostHog, isPostHogEnabled } from "./posthog";
import {
  resolveSignupFlowVariant,
  SIGNUP_COMPLETED_EVENT,
  SIGNUP_FLOW_FEATURE_FLAG,
  SignupFlowVariant
} from "./signupExperimentConfig";

export { SignupFlowVariant } from "./signupExperimentConfig";

const SIGNUP_FLOW_VARIANT_SESSION_KEY = "infisical-signup-flow-variant";
const SIGNUP_FLOW_VARIANT_QUERY_PARAM = "signupFlow";
const FEATURE_FLAG_TIMEOUT_MS = 2500;

const getLocalSignupFlowVariantOverride = () => {
  if (!import.meta.env.DEV) return undefined;

  const value = new URLSearchParams(window.location.search).get(SIGNUP_FLOW_VARIANT_QUERY_PARAM);
  const resolvedVariant = resolveSignupFlowVariant(value);

  return resolvedVariant.shouldPersist ? resolvedVariant.variant : undefined;
};

const persistSignupFlowVariant = (variant: SignupFlowVariant) => {
  try {
    window.sessionStorage.setItem(SIGNUP_FLOW_VARIANT_SESSION_KEY, variant);
  } catch {
    // The assigned variant still applies for this render when storage is unavailable.
  }
};

const getPersistedSignupFlowVariant = () => {
  try {
    const variant = window.sessionStorage.getItem(SIGNUP_FLOW_VARIANT_SESSION_KEY);
    const resolvedVariant = resolveSignupFlowVariant(variant);
    return resolvedVariant.shouldPersist ? resolvedVariant.variant : undefined;
  } catch {
    return undefined;
  }
};

export const useSignupFlowVariant = (enabled = true) => {
  const [variant, setVariant] = useState<SignupFlowVariant | null>(() => {
    if (!enabled) return SignupFlowVariant.Control;

    const localOverride = getLocalSignupFlowVariantOverride();
    if (localOverride) return localOverride;

    if (!isPostHogEnabled()) return SignupFlowVariant.Control;
    return getPersistedSignupFlowVariant() ?? null;
  });

  useEffect(() => {
    if (!enabled || variant) return undefined;

    const client = getPostHog();
    if (!client) {
      setVariant(SignupFlowVariant.Control);
      return undefined;
    }

    let isSettled = false;
    const settle = (nextVariant: SignupFlowVariant, shouldPersist = false) => {
      if (isSettled) return;
      isSettled = true;
      if (shouldPersist) persistSignupFlowVariant(nextVariant);
      setVariant(nextVariant);
    };

    const unsubscribe = client.onFeatureFlags(() => {
      const flagValue = client.getFeatureFlag(SIGNUP_FLOW_FEATURE_FLAG);
      const resolvedVariant = resolveSignupFlowVariant(flagValue);
      settle(resolvedVariant.variant, resolvedVariant.shouldPersist);
    });
    const timeout = window.setTimeout(
      () => settle(SignupFlowVariant.Control),
      FEATURE_FLAG_TIMEOUT_MS
    );

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [enabled, variant]);

  return variant;
};

export const captureSignupCompleted = (signupMethod: "email" | "sso") => {
  const client = getPostHog();
  if (!client) return;

  client.capture(SIGNUP_COMPLETED_EVENT, {
    signup_method: signupMethod,
    signup_flow_variant: getPersistedSignupFlowVariant() ?? SignupFlowVariant.Control
  });
};
