import { PostHog } from 'posthog-node';
import { NODE_ENV, POSTHOG_HOST, POSTHOG_PROJECT_API_KEY, TELEMETRY_ENABLED } from '../config';

let postHogClient: any;
if (
    NODE_ENV === 'production'
    && TELEMETRY_ENABLED
) {
    // case: enable opt-out telemetry in production
    postHogClient = new PostHog(POSTHOG_PROJECT_API_KEY, {
        host: POSTHOG_HOST
    });
}

export default postHogClient;