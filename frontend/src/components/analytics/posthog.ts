import type { PostHog } from "posthog-js";
import posthog from "posthog-js";

import { envConfig } from "@app/config/env";

let postHogClient: PostHog | undefined;
let initializationAttempted = false;

export const isPostHogEnabled = () =>
  typeof window !== "undefined" &&
  envConfig.ENV === "production" &&
  envConfig.TELEMETRY_CAPTURING_ENABLED &&
  Boolean(envConfig.POSTHOG_API_KEY);

export const initPostHog = (): PostHog | undefined => {
  if (initializationAttempted) return postHogClient;

  initializationAttempted = true;

  try {
    if (!isPostHogEnabled()) return undefined;

    // Every automatic capture is pinned off here rather than left unset: the options
    // defaulting to `undefined` fall back to the PostHog project's remote config, so a
    // toggle in the PostHog UI would otherwise start collecting without a code change.
    posthog.init(envConfig.POSTHOG_API_KEY!, {
      api_host: envConfig.POSTHOG_HOST,
      persistence: "localStorage+cookie",
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_scroll_properties: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true
    });
    postHogClient = posthog;
  } catch (error) {
    console.error("PostHog initialization failed", error);
  }

  return postHogClient;
};

export const getPostHog = () => postHogClient ?? initPostHog();
