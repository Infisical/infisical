import { useEffect, useState } from "react";

import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { isInfisicalCloud } from "@app/helpers/platform";

import { getPostHog, isPostHogEnabled } from "../../posthog";
import {
  resolveSignupFlowVariant,
  SIGNUP_COMPLETED_EVENT,
  SIGNUP_FLOW_FEATURE_FLAG,
  SignupFlowVariant
} from "./signupExperimentConfig";

export { SignupFlowVariant } from "./signupExperimentConfig";

const SIGNUP_FLOW_VARIANT_SESSION_KEY = "infisical-signup-flow-variant";
const SIGNUP_FLOW_VARIANT_COOKIE_KEY = "infisical_signup_flow_variant";
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

  if (isInfisicalCloud()) {
    document.cookie = `${SIGNUP_FLOW_VARIANT_COOKIE_KEY}=${variant}; Path=/; Domain=.infisical.com; SameSite=Lax; Secure`;
  }
};

const getPersistedSignupFlowVariant = () => {
  let sessionVariant: string | null = null;
  try {
    sessionVariant = window.sessionStorage.getItem(SIGNUP_FLOW_VARIANT_SESSION_KEY);
  } catch {
    sessionVariant = null;
  }

  const cookieVariant = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SIGNUP_FLOW_VARIANT_COOKIE_KEY}=`))
    ?.split("=")[1];
  const resolvedVariant = resolveSignupFlowVariant(sessionVariant ?? cookieVariant);

  if (!sessionVariant && resolvedVariant.shouldPersist) {
    try {
      window.sessionStorage.setItem(SIGNUP_FLOW_VARIANT_SESSION_KEY, resolvedVariant.variant);
    } catch {
      // The cookie assignment still applies when session storage is unavailable.
    }
  }

  return resolvedVariant.shouldPersist ? resolvedVariant.variant : undefined;
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
    let unsubscribe: (() => void) | undefined;
    let timeout: number | undefined;
    const settle = (nextVariant: SignupFlowVariant, shouldPersist = false) => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(timeout);
      unsubscribe?.();
      if (shouldPersist) persistSignupFlowVariant(nextVariant);
      setVariant(nextVariant);
    };

    timeout = window.setTimeout(() => settle(SignupFlowVariant.Control), FEATURE_FLAG_TIMEOUT_MS);
    try {
      unsubscribe = client.onFeatureFlags((_flags, _variants, context) => {
        if (isSettled) return;

        try {
          const flagValue = context?.errorsLoading
            ? undefined
            : client.getFeatureFlag(SIGNUP_FLOW_FEATURE_FLAG, {
                fresh: true
              });
          const resolvedVariant = resolveSignupFlowVariant(flagValue);
          settle(resolvedVariant.variant, resolvedVariant.shouldPersist);
        } catch {
          settle(SignupFlowVariant.Control);
        }
      });
      if (isSettled) unsubscribe();
    } catch {
      settle(SignupFlowVariant.Control);
    }

    return () => {
      window.clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [enabled, variant]);

  return variant;
};

export const captureSignupCompleted = (signupMethod: "email" | "sso") => {
  if (!isInfisicalCloud()) return;

  const telemetry = new Telemetry().getInstance();
  telemetry.capture(SIGNUP_COMPLETED_EVENT, {
    signup_method: signupMethod,
    signup_flow_variant: getPersistedSignupFlowVariant() ?? "unassigned"
  });
};
