import posthog from "posthog-js";

import { ENV, POSTHOG_API_KEY, POSTHOG_HOST, TELEMETRY_ENABLED } from "../utilities/config";

export const initPostHog = () => {
	if (typeof window !== "undefined") {
		if (ENV == "production" && TELEMETRY_ENABLED) {
			posthog.init(POSTHOG_API_KEY, {
				api_host: POSTHOG_HOST,
			});
		}
	}

	return posthog;
};
