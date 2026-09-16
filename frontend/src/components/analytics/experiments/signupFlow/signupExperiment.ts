import { useEffect, useState } from "react";

import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { isInfisicalCloud } from "@app/helpers/platform";

import { getPostHog, isPostHogEnabled } from "../../posthog";
import { resolveFeatureFlagVariant } from "../resolveFeatureFlagVariant";
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

    return resolveFeatureFlagVariant({
      client: getPostHog(),
      fallback: {
        variant: SignupFlowVariant.Control,
        shouldPersist: false
      },
      featureFlag: SIGNUP_FLOW_FEATURE_FLAG,
      onResolved: (resolvedVariant) => {
        if (resolvedVariant.shouldPersist) persistSignupFlowVariant(resolvedVariant.variant);
        setVariant(resolvedVariant.variant);
      },
      resolve: resolveSignupFlowVariant,
      timeoutMs: FEATURE_FLAG_TIMEOUT_MS
    });
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
